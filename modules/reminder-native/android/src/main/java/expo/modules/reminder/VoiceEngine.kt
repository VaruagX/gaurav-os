package expo.modules.reminder

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.io.File
import java.util.Locale
import java.util.UUID

/**
 * TextToSpeech wrapper usable from services (no JS / UI needed).
 *
 * Speech is synthesised to files sentence by sentence and PLAYED BY THIS APP (MediaPlayer, our own foreground
 * service). That keeps playback attributed to us rather than to the TTS engine app, so Android 16 background-audio
 * hardening does not mute it, and lets us choose USAGE_ALARM so it is audible in silent mode / on the lock screen.
 * The first sentence starts playing while later ones are still being synthesised. If file synthesis fails we fall back
 * to direct TextToSpeech.speak().
 */
class VoiceEngine(private val ctx: Context) {
  private val main = Handler(Looper.getMainLooper())
  private var tts: TextToSpeech? = null
  private var ready = false
  private var failed = false
  private val waiting = mutableListOf<() -> Unit>()
  private val callbacks = mutableMapOf<String, (Boolean) -> Unit>()
  private val audio = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private var focus: AudioFocusRequest? = null
  private var job: Job? = null

  init {
    main.post {
      tts = TextToSpeech(ctx.applicationContext) { status ->
        if (status == TextToSpeech.SUCCESS) {
          tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            override fun onDone(utteranceId: String?) { finish(utteranceId, true) }
            @Deprecated("Deprecated in Java") override fun onError(utteranceId: String?) { finish(utteranceId, false) }
            override fun onError(utteranceId: String?, errorCode: Int) { finish(utteranceId, false) }
          })
          ready = true
        } else failed = true
        val q = waiting.toList(); waiting.clear(); q.forEach { it() }
      }
    }
  }

  private fun finish(id: String?, ok: Boolean) {
    val cb = synchronized(callbacks) { callbacks.remove(id) }
    if (cb != null) main.post { cb(ok) }
  }

  private fun attrs(loud: Boolean) = AudioAttributes.Builder()
    .setUsage(if (loud) AudioAttributes.USAGE_ALARM else AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()

  /** Speak [text]. [loud] = alarm stream (audible in silent mode). [onDone] gets true on success. */
  fun speak(text: String, lang: String, rate: Float, pitch: Float, loud: Boolean, onDone: (Boolean) -> Unit) {
    main.post {
      val run = {
        val t = tts
        if (failed || t == null) onDone(false) else {
          job?.cancel()
          val a = attrs(loud)
          t.setAudioAttributes(a)
          val res = t.setLanguage(Locale.forLanguageTag(lang))
          if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) t.setLanguage(Locale.getDefault())
          t.setSpeechRate(rate.coerceIn(0.3f, 2.5f)); t.setPitch(pitch.coerceIn(0.5f, 2.0f))
          requestFocus(a)
          val parts = text.split(Regex("(?<=[.?!])\\s+")).map { it.trim() }.filter { it.isNotEmpty() }.ifEmpty { listOf(text) }
          val j = Job(t, text, parts, loud) { ok -> abandonFocus(); onDone(ok) }
          job = j; j.begin()
        }
      }
      if (ready || failed) run() else waiting.add(run)
    }
  }

  private inner class Job(val t: TextToSpeech, val full: String, val parts: List<String>, val loud: Boolean, val onDone: (Boolean) -> Unit) {
    private val id = UUID.randomUUID().toString().take(8)
    private val files = arrayOfNulls<File>(parts.size)
    private var nextPlay = 0
    private var playing = false
    private var dead = false
    private var player: MediaPlayer? = null
    private var playedAny = false

    fun begin() { synth(0) }

    private fun synth(i: Int) {
      if (dead) return
      val f = File(ctx.cacheDir, "tts_${id}_$i.wav")
      val uid = "$id:$i"
      synchronized(callbacks) {
        callbacks[uid] = { ok ->
          if (!dead) {
            if (!ok) fail() else { files[i] = f; if (i + 1 < parts.size) synth(i + 1); pump() }
          }
        }
      }
      val r = t.synthesizeToFile(parts[i], Bundle(), f, uid)
      if (r != TextToSpeech.SUCCESS) { synchronized(callbacks) { callbacks.remove(uid) }; fail() }
    }

    private fun pump() {
      if (dead || playing) return
      if (nextPlay >= parts.size) { end(true); return }
      val f = files[nextPlay] ?: return
      playing = true
      try {
        val mp = MediaPlayer()
        player = mp
        mp.setAudioAttributes(attrs(loud))
        mp.setDataSource(f.absolutePath)
        mp.setOnCompletionListener { it.release(); player = null; f.delete(); nextPlay++; playing = false; playedAny = true; pump() }
        mp.setOnErrorListener { p, _, _ -> p.release(); player = null; playing = false; fail(); true }
        mp.prepare(); mp.start()
      } catch (e: Exception) { playing = false; fail() }
    }

    private fun fail() {
      if (dead) return
      if (!playedAny) {
        // Fall back to direct speech through the TTS engine.
        dead = true; cleanup()
        val id2 = UUID.randomUUID().toString()
        synchronized(callbacks) { callbacks[id2] = { ok -> onDone(ok) } }
        val r = t.speak(full, TextToSpeech.QUEUE_FLUSH, null, id2)
        if (r != TextToSpeech.SUCCESS) { synchronized(callbacks) { callbacks.remove(id2) }; onDone(false) }
      } else end(false)
    }

    private fun end(ok: Boolean) { if (dead) return; dead = true; cleanup(); onDone(ok) }

    fun cancel() { if (dead) return; dead = true; cleanup() }

    private fun cleanup() {
      try { player?.stop() } catch (e: Exception) {}
      player?.release(); player = null
      files.forEach { it?.delete() }
      for (i in parts.indices) File(ctx.cacheDir, "tts_${id}_$i.wav").delete()
    }
  }

  private fun requestFocus(a: AudioAttributes) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(a).build()
      audio.requestAudioFocus(focus!!)
    }
  }

  private fun abandonFocus() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) focus?.let { audio.abandonAudioFocusRequest(it) }
    focus = null
  }

  fun stop() { main.post { job?.cancel(); job = null; tts?.stop(); synchronized(callbacks) { callbacks.clear() }; abandonFocus() } }

  fun shutdown() {
    main.post {
      job?.cancel(); job = null
      tts?.stop(); tts?.shutdown(); tts = null
      synchronized(callbacks) { callbacks.clear() }
      abandonFocus()
    }
  }

  /** Languages from [candidates] the installed engine can speak. */
  fun availableLanguages(candidates: List<String>, cb: (List<String>) -> Unit) {
    main.post {
      val run = {
        val t = tts
        cb(if (t == null) emptyList() else candidates.filter {
          val r = t.isLanguageAvailable(Locale.forLanguageTag(it))
          r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED
        })
      }
      if (ready || failed) run() else waiting.add(run)
    }
  }
}
