package expo.modules.reminder

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.provider.ContactsContract
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import android.telecom.TelecomManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Handles ONE ringing call: announce caller via TTS, listen for "haan/nahi", then answer/reject through
 * TelecomManager (needs ANSWER_PHONE_CALLS). Silence/timeout leaves the phone ringing untouched.
 * `simulate` runs the same flow (TTS + mic + parsing) but never touches a real call.
 */
class CallAssistantService : Service() {
  companion object {
    private const val CHANNEL = "gaurav_call_assistant"
    private const val NOTIF_ID = 9201
    private const val TAG = "GauravCall"
    @Volatile var active = false
    @Volatile private var lastStart = 0L
    @Volatile private var instance: CallAssistantService? = null
    @Volatile private var warm: VoiceEngine? = null

    /** Start TTS initialisation immediately (it takes ~0.5-1.5s) so speech can begin the moment the service is up. */
    fun prewarm(ctx: Context) {
      if (warm != null || active || !CallAssistantStore.config(ctx).enabled) return
      val v = VoiceEngine(ctx.applicationContext); warm = v
      Handler(Looper.getMainLooper()).postDelayed({ if (warm === v) { warm = null; v.shutdown() } }, 30_000L)
    }

    /** Returns false if ignored (disabled, or duplicate trigger for the same call). */
    fun start(ctx: Context, number: String?, simulate: Boolean = false, simName: String? = null): Boolean {
      val cfg = CallAssistantStore.config(ctx)
      if (!simulate && !cfg.enabled) return false
      if (!active) prewarm(ctx)
      val now = System.currentTimeMillis()
      if (active || (!simulate && now - lastStart < 20_000)) return false
      lastStart = now
      val i = Intent(ctx, CallAssistantService::class.java).putExtra("number", number).putExtra("simulate", simulate).putExtra("simName", simName)
      return try { ContextCompat.startForegroundService(ctx, i); true } catch (e: Exception) {
        CallAssistantStore.addEvent(ctx, null, "failed", "service start blocked: ${e.javaClass.simpleName}")
        false
      }
    }

    fun onCallState(state: String) { instance?.handleState(state) }

    /** Put the ringtone volume back if an earlier run lowered it and never got to restore it. */
    fun restoreRing(ctx: Context) {
      val v = CallAssistantStore.takeRing(ctx)
      if (v > 0) try { (ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager).setStreamVolume(AudioManager.STREAM_RING, v, 0) } catch (e: Exception) {}
    }

    /** Display name from Contacts, or null if unknown / permission missing. */
    fun lookupName(ctx: Context, number: String?): String? {
      if (number.isNullOrBlank()) return null
      if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) return null
      return try {
        val uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number))
        ctx.contentResolver.query(uri, arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME), null, null, null)?.use { c ->
          if (c.moveToFirst()) c.getString(0) else null
        }
      } catch (e: Exception) { null }
    }
  }

  private val main = Handler(Looper.getMainLooper())
  private val flow = CallFlow()
  private var voice: VoiceEngine? = null
  private var recognizer: SpeechRecognizer? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var simulate = false
  private var contactName: String? = null
  private var deadline = 0L
  private var listenTag = "hi-IN"
  private var timeoutSec = 8
  private var timeoutRunnable: Runnable? = null
  private var finished = false
  private var lastError = 0
  private var answeredPending = false
  private var extraDetail: String? = null
  private var speakerWanted = true

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (active) return START_NOT_STICKY
    active = true; instance = this
    t0 = System.currentTimeMillis()
    simulate = intent?.getBooleanExtra("simulate", false) ?: false
    val cfg = CallAssistantStore.config(this)
    timeoutSec = cfg.timeoutSec
    speakerWanted = cfg.speaker
    restoreRing(this)
    goForeground()
    if (cfg.duckRing && !simulate) duckRing()
    wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "gauravos:call").apply { setReferenceCounted(false); acquire(90_000L) }

    contactName = if (simulate) (intent?.getStringExtra("simName") ?: "Test Contact") else lookupName(this, intent?.getStringExtra("number"))
    val lang = CallAnnouncement.lang(cfg.lang)
    listenTag = lang.listenTag
    val text = CallAnnouncement.text(cfg.lang, cfg.user, contactName)
    voice = CallReadyService.voice ?: warm ?: VoiceEngine(this)
    warm = null
    KeywordModel.ensure(this)
    if (!KeywordModel.ready) ensureRecognizer() // bind the speech service now so listening can begin the instant the announcement ends
    Log.i(TAG, "announce start +${System.currentTimeMillis() - t0}ms: $text")
    voice!!.speak(text, lang.voiceTag, 1.0f, 1.0f, true) { ok ->
      main.post {
        if (finished) return@post
        Log.i(TAG, "announcement done +${System.currentTimeMillis() - t0}ms ok=$ok")
        deadline = System.currentTimeMillis() + timeoutSec * 1000L
        timeoutRunnable = Runnable { act(flow.onTimeout()) }.also { main.postDelayed(it, timeoutSec * 1000L) }
        act(flow.onAnnounced(ok))
      }
    }
    return START_NOT_STICKY
  }

  private fun goForeground() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "Call assistant", NotificationManager.IMPORTANCE_LOW))
    }
    val n: Notification = NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_reminder).setContentTitle("GAURAV OS call assistant")
      .setContentText(if (simulate) "Running a test call…" else "Incoming call — listening for your answer")
      .setCategory(NotificationCompat.CATEGORY_CALL).setOngoing(true).setPriority(NotificationCompat.PRIORITY_LOW).build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ServiceCompat.startForeground(this, NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else startForeground(NOTIF_ID, n)
  }

  /** Lower the ringtone while we talk/listen so the microphone can hear a distant voice. Restored in finish(). */
  private fun duckRing() {
    try {
      val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val cur = am.getStreamVolume(AudioManager.STREAM_RING)
      if (cur > 1) { CallAssistantStore.saveRing(this, cur); am.setStreamVolume(AudioManager.STREAM_RING, maxOf(1, cur / 4), 0) }
    } catch (e: Exception) { /* Do-Not-Disturb policy may forbid it: harmless */ }
  }

  /** Call volume to the top so the caller is easy to hear from a distance. */
  private fun raiseCallVolume() {
    try {
      val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
      am.setStreamVolume(AudioManager.STREAM_VOICE_CALL, am.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL), 0)
    } catch (e: Exception) {}
  }

  /** Route call audio to the loudspeaker. Telecom may reset the route, so this is applied several times. */
  private fun enableSpeaker(): Boolean {
    val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        am.availableCommunicationDevices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }?.let { am.setCommunicationDevice(it) }
      }
      @Suppress("DEPRECATION") am.isSpeakerphoneOn = true
    } catch (e: Exception) {}
    @Suppress("DEPRECATION") return am.isSpeakerphoneOn
  }

  private fun speakerThenFinish() {
    if (!answeredPending) return
    answeredPending = false
    enableSpeaker()
    main.postDelayed({ enableSpeaker() }, 800)
    main.postDelayed({ extraDetail = if (enableSpeaker()) "on speaker" else "speaker not applied"; finish("answered") }, 2500)
  }

  fun handleState(state: String) {
    if (answeredPending && state == "OFFHOOK") { main.post { speakerThenFinish() }; return }
    if (simulate) return
    main.post { act(flow.onCallState(state)) }
  }

  private fun act(a: CallFlow.Action) {
    when (a) {
      is CallFlow.Action.None -> {}
      is CallFlow.Action.StartListening -> listen()
      is CallFlow.Action.Answer -> perform(true)
      is CallFlow.Action.Reject -> perform(false)
      is CallFlow.Action.Finish -> finish(a.reason)
    }
  }

  private var keyword: KeywordListener? = null
  private var listening = false
  private var gotReady = false
  private var t0 = 0L
  private var firstListenAt = 0L
  private val heard = ArrayList<String>()
  private val watchdog = Runnable {
    // The recogniser service sometimes drops the connection silently; if it never became ready, rebuild it.
    if (listening && !gotReady && !finished) {
      Log.w(TAG, "recogniser not ready after 2.5s, recreating")
      recognizer?.let { try { it.destroy() } catch (e: Exception) {} }; recognizer = null
      listening = false; lastError = -1
      listen()
    }
  }

  private val recListener = object : RecognitionListener {
    override fun onReadyForSpeech(p: android.os.Bundle?) { gotReady = true; main.removeCallbacks(watchdog); Log.i(TAG, "ready for speech +${System.currentTimeMillis() - t0}ms") }
    override fun onBeginningOfSpeech() { Log.i(TAG, "speech begins") }
    override fun onRmsChanged(v: Float) {}
    override fun onBufferReceived(b: ByteArray?) {}
    override fun onEndOfSpeech() {}
    override fun onEvent(t: Int, p: android.os.Bundle?) {}
    override fun onPartialResults(p: android.os.Bundle?) {
      // Act as soon as a clear yes/no is heard, without waiting for the recogniser to decide the sentence is over.
      val list = p?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: return
      if (finished) return
      Log.i(TAG, "partial: $list")
      list.firstOrNull()?.let { if (heard.lastOrNull() != it && heard.size < 6) heard.add(it) }
      val next = flow.onHeard(list)
      if (next is CallFlow.Action.Answer || next is CallFlow.Action.Reject) act(next)
    }
    override fun onResults(b: android.os.Bundle?) {
      listening = false
      val list = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: arrayListOf()
      if (finished) return
      Log.i(TAG, "results: $list")
      list.firstOrNull()?.let { if (heard.lastOrNull() != it && heard.size < 6) heard.add(it) }
      val next = flow.onHeard(list)
      if (next is CallFlow.Action.StartListening) main.postDelayed({ listen() }, 150) else act(next)
    }
    override fun onError(error: Int) {
      listening = false
      if (finished) return
      Log.w(TAG, "recogniser error $error")
      lastError = error
      // 12/13 = language not supported / language pack missing: retry with English (India), which is almost always present.
      if ((error == 12 || error == 13) && listenTag != "en-IN") listenTag = "en-IN"
      // 8 = busy, 5 = client error: rebuild the recogniser.
      if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY || error == SpeechRecognizer.ERROR_CLIENT) {
        recognizer?.let { try { it.destroy() } catch (e: Exception) {} }; recognizer = null
      }
      val next = flow.onListenEnded(deadline - System.currentTimeMillis() - 300)
      val wait = if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) 120L else 400L
      if (next is CallFlow.Action.StartListening) main.postDelayed({ listen() }, wait) else act(next)
    }
  }

  /** One recogniser instance is created early (while the announcement plays) and reused, so listening starts fast. */
  private fun ensureRecognizer(): SpeechRecognizer? {
    recognizer?.let { return it }
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED || !SpeechRecognizer.isRecognitionAvailable(this)) return null
    val sr = SpeechRecognizer.createSpeechRecognizer(this)
    sr.setRecognitionListener(recListener)
    recognizer = sr
    return sr
  }

  /** Offline "hey Siri"-style listener (preferred); returns false if the model/mic is not available. */
  private fun startKeyword(): Boolean {
    if (keyword != null) { keyword!!.muted = false; return true }
    val k = KeywordListener(this) { text ->
      if (!finished) {
        if (heard.lastOrNull() != text && heard.size < 6) heard.add(text)
        val next = flow.onHeard(listOf(text))
        if (next is CallFlow.Action.Answer || next is CallFlow.Action.Reject) act(next)
      }
    }
    k.muted = false
    if (!k.start()) return false
    keyword = k
    if (firstListenAt == 0L) firstListenAt = System.currentTimeMillis()
    return true
  }

  private fun listen() {
    if (finished || listening) return
    if (KeywordModel.ready && (keyword != null || startKeyword())) return // offline listener streams continuously; no restarts needed
    val remaining = deadline - System.currentTimeMillis()
    if (remaining < CallFlow.MIN_LISTEN_MS) { act(flow.onListenEnded(remaining)); return }
    val sr = ensureRecognizer()
    if (sr == null) {
      CallAssistantStore.addEvent(this, contactName, "failed", "no microphone permission or recogniser")
      finish("no_response"); return
    }
    if (firstListenAt == 0L) firstListenAt = System.currentTimeMillis()
    listening = true; gotReady = false
    val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
      .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_WEB_SEARCH) // best for short commands
      .putExtra(RecognizerIntent.EXTRA_LANGUAGE, listenTag)
      .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false)
      .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
      .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1200L)
      .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
    if (Build.VERSION.SDK_INT >= 33) {
      i.putStringArrayListExtra(RecognizerIntent.EXTRA_BIASING_STRINGS, arrayListOf("yes", "no", "haan", "nahi", "uthao", "answer", "reject", "pick up", "mat uthao"))
    }
    try { sr.startListening(i) } catch (e: Exception) {
      Log.w(TAG, "startListening failed: ${e.javaClass.simpleName}")
      listening = false; recognizer?.destroy(); recognizer = null
      main.postDelayed({ listen() }, 300); return
    }
    main.removeCallbacks(watchdog); main.postDelayed(watchdog, 2500)
  }

  private fun perform(answer: Boolean) {
    if (simulate) { finish(if (answer) "sim_answer" else "sim_reject"); return }
    val tm = getSystemService(Context.TELECOM_SERVICE) as TelecomManager
    try {
      if (answer) {
        tm.acceptRingingCall()
        if (speakerWanted) {
          // Stop listening/announcing right away, then put the call on speaker AS SOON AS the call screen allows it.
          recognizer?.let { try { it.cancel() } catch (e: Exception) {}; it.destroy() }; recognizer = null
          keyword?.stop(); keyword = null
          voice?.stop(); timeoutRunnable?.let { main.removeCallbacks(it) }
          answeredPending = true
          raiseCallVolume()
          val viaA11y = CallSpeakerService.request { msg -> main.post { extraDetail = msg; answeredPending = false; finish("answered") } }
          if (!viaA11y) {
            enableSpeaker()
            extraDetail = "speaker needs the accessibility helper (Settings)"
            main.postDelayed({ answeredPending = false; finish("answered") }, 1500)
          } else main.postDelayed({ if (!finished) { answeredPending = false; finish("answered") } }, 16000)
        } else finish("answered")
      }
      else {
        val ok = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) tm.endCall() else false
        if (ok) finish("rejected") else { CallAssistantStore.addEvent(this, contactName, "failed", "endCall returned false"); finish("failed_reject") }
      }
    } catch (e: SecurityException) {
      CallAssistantStore.addEvent(this, contactName, "failed", "ANSWER_PHONE_CALLS not granted")
      finish("failed_permission")
    } catch (e: Exception) {
      CallAssistantStore.addEvent(this, contactName, "failed", e.javaClass.simpleName)
      finish("failed")
    }
  }

  private fun finish(reason: String) {
    if (finished) return
    finished = true
    if (!reason.startsWith("failed")) {
      val d = listOfNotNull(extraDetail,
        if (heard.isNotEmpty()) "heard: " + heard.joinToString(" / ") { "\"$it\"" } else if (!simulate && reason == "no_response") "heard nothing" else null,
        if (firstListenAt > 0) "listening from +" + String.format("%.1f", (firstListenAt - t0) / 1000.0) + "s" else null, if (simulate) "simulation" else null, if (reason == "no_response" && lastError != 0) "recogniser error $lastError" else null, if (!simulate && !CallReadyService.running) "ready service off" else null).joinToString(" · ")
      CallAssistantStore.addEvent(this, contactName, reason, d)
    }
    cleanup()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun cleanup() {
    main.removeCallbacksAndMessages(null)
    keyword?.stop(); keyword = null
    restoreRing(this)
    recognizer?.let { try { it.cancel() } catch (e: Exception) {}; it.destroy() }; recognizer = null
    if (voice !== CallReadyService.voice) voice?.shutdown() else voice?.stop()
    voice = null
    try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (e: Exception) {}
  }

  override fun onDestroy() {
    if (!finished) { finished = true; cleanup() }
    active = false; instance = null
    super.onDestroy()
  }
}
