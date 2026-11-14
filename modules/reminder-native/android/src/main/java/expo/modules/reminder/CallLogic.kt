package expo.modules.reminder

/** Pure (Android-free) logic for the AI Caller Assistant, unit-tested in src/test. */

enum class CallCommand { ANSWER, REJECT, NONE }

object CallCommandParser {
  private val strongYes = setOf("haan", "han", "haa", "ha", "haanji", "hanji", "ji", "yes", "yess", "yea", "yeh", "ya", "yaa", "yeah", "yep", "yup", "ok", "okay", "sure", "haa", "haan", "haaan", "हाँ", "हां", "हा", "जी", "ठीक")
  private val answerVerbs = setOf("uthao", "utha", "uthalo", "uthaiye", "uthaye", "uthaiyye", "pick", "answer", "receive", "accept", "उठाओ", "उठा", "उठाइए", "उठालो", "रिसीव")
  private val strongNo = setOf("nahi", "nahin", "nahee", "nai", "no", "nope", "nah", "naah", "nay", "naa", "noo", "नहीं", "नही", "नहि")
  private val negMod = setOf("mat", "dont", "don't", "मत")
  private val rejectVerbs = setOf("reject", "decline", "cut", "kaat", "kaato", "kato", "काट", "काटो", "कट", "रिजेक्ट")

  private fun tokens(text: String): List<String> =
    text.lowercase().replace(Regex("[.,!?;:\"“”‘’।]"), " ").replace("'", "'").split(Regex("\\s+")).filter { it.isNotBlank() }

  fun parse(text: String): CallCommand {
    val t = tokens(text)
    if (t.isEmpty()) return CallCommand.NONE
    val yes = t.any { it in strongYes }
    val verb = t.any { it in answerVerbs }
    val no = t.any { it in strongNo }
    val mod = t.any { it in negMod }
    val rej = t.any { it in rejectVerbs }
    val negative = no || mod || rej
    if (negative && yes) return CallCommand.NONE // contradictory ("haan nahi"): keep listening
    if (negative) return CallCommand.REJECT      // includes "mat uthao" / "nahi uthao"
    if (yes || verb) return CallCommand.ANSWER
    return CallCommand.NONE
  }

  /** Recognisers return several alternatives; use the first that is a clear command. */
  fun parseAny(alternatives: List<String>): CallCommand {
    for (a in alternatives) { val c = parse(a); if (c != CallCommand.NONE) return c }
    return CallCommand.NONE
  }
}

object CallAnnouncement {
  data class Lang(val id: String, val voiceTag: String, val listenTag: String)

  val LANGS = listOf(
    Lang("both", "en-IN", "en-IN"),
    Lang("hinglish-hi", "hi-IN", "hi-IN"),
    Lang("hinglish-en", "en-IN", "hi-IN"),
    Lang("english", "en-IN", "en-IN")
  )

  fun lang(id: String): Lang = LANGS.firstOrNull { it.id == id } ?: LANGS[0]

  /** "Gaurav, <Name> ka call aaya hai. Kya aap call uthana chahte ho?" (or English equivalent). */
  fun text(langId: String, user: String, contactName: String?): String {
    val name = contactName?.trim()?.takeIf { it.isNotEmpty() }
    if (langId == "both") {
      return "$user, ${name ?: "ek anjaan number"} ka call aaya hai. Kya aap call uthana chahte ho? " +
        "Say yes or no."
    }
    return if (langId == "english") {
      "$user, ${name ?: "an unknown number"} is calling. Do you want to answer?"
    } else {
      "$user, ${name ?: "ek anjaan number"} ka call aaya hai. Kya aap call uthana chahte ho?"
    }
  }
}

/** State machine for one ringing call. The service feeds it events and executes the returned action. */
class CallFlow {
  enum class Phase { ANNOUNCING, LISTENING, DONE }
  sealed class Action {
    object None : Action()
    object StartListening : Action()
    object Answer : Action()
    object Reject : Action()
    data class Finish(val reason: String) : Action()
  }

  var phase = Phase.ANNOUNCING
    private set

  companion object { const val MIN_LISTEN_MS = 1500L }

  fun onAnnounced(ok: Boolean): Action {
    if (phase != Phase.ANNOUNCING) return Action.None
    if (!ok) { phase = Phase.DONE; return Action.Finish("tts_failed") }
    phase = Phase.LISTENING
    return Action.StartListening
  }

  fun onHeard(alternatives: List<String>): Action {
    if (phase != Phase.LISTENING) return Action.None
    return when (CallCommandParser.parseAny(alternatives)) {
      CallCommand.ANSWER -> { phase = Phase.DONE; Action.Answer }
      CallCommand.REJECT -> { phase = Phase.DONE; Action.Reject }
      CallCommand.NONE -> Action.StartListening
    }
  }

  /** Recogniser finished without a result (silence / error). Retry only if enough time remains. */
  fun onListenEnded(remainingMs: Long): Action {
    if (phase != Phase.LISTENING) return Action.None
    if (remainingMs < MIN_LISTEN_MS) { phase = Phase.DONE; return Action.Finish("no_response") }
    return Action.StartListening
  }

  fun onTimeout(): Action {
    if (phase != Phase.LISTENING) return Action.None
    phase = Phase.DONE
    return Action.Finish("no_response")
  }

  /** "RINGING" keeps the flow alive; IDLE/OFFHOOK means the caller hung up or the call was answered elsewhere. */
  fun onCallState(state: String): Action {
    if (phase == Phase.DONE || state == "RINGING") return Action.None
    phase = Phase.DONE
    return Action.Finish("call_ended")
  }
}

/** Automatic gain for far-away speech. Pure so it can be unit-tested. */
object Agc {
  const val TARGET_PEAK = 10_000f
  const val MAX_GAIN = 60f
  const val FLOOR = 150f

  /** Envelope follower: instant attack, slow release (~1s at 8 frames/s). */
  fun envelope(prev: Float, framePeak: Int): Float = maxOf(framePeak.toFloat(), prev * 0.9f)

  fun gain(envelope: Float): Float = (TARGET_PEAK / maxOf(envelope, FLOOR)).coerceIn(1f, MAX_GAIN)

  fun peak(buf: ShortArray, n: Int): Int { var p = 0; for (i in 0 until n) { val a = Math.abs(buf[i].toInt()); if (a > p) p = a }; return p }

  fun apply(buf: ShortArray, n: Int, gain: Float) {
    for (i in 0 until n) buf[i] = (buf[i] * gain).toInt().coerceIn(-32768, 32767).toShort()
  }
}
