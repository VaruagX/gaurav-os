package expo.modules.reminder

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import java.util.ArrayDeque

/**
 * Short-lived foreground service: plays alarm sound and speaks reminders with TextToSpeech
 * while the app is closed / screen is locked. Stops itself when the queue is empty.
 */
class ReminderService : Service() {
  companion object {
    const val ACTION_PLAY = "expo.modules.reminder.PLAY"
    const val ACTION_HALT = "expo.modules.reminder.HALT"
    private const val ALARM_CAP_MS = 10 * 60_000L
    @Volatile var running = false

    fun play(ctx: Context, id: Int) {
      val i = Intent(ctx, ReminderService::class.java).setAction(ACTION_PLAY).putExtra("id", id)
      ContextCompat.startForegroundService(ctx, i)
    }

    fun halt(ctx: Context, id: Int) {
      val i = Intent(ctx, ReminderService::class.java).setAction(ACTION_HALT).putExtra("id", id)
      ctx.startService(i)
    }

    fun haltAll(ctx: Context) = halt(ctx, -1)
  }

  private val main = Handler(Looper.getMainLooper())
  private val queue = ArrayDeque<Reminder>()
  private var current: Reminder? = null
  private var voice: VoiceEngine? = null
  private var player: MediaPlayer? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var foregroundStarted = false
  private var foregroundId = -1
  private var capRunnable: Runnable? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    running = true
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "gauravos:reminder").apply {
      setReferenceCounted(false); acquire(ALARM_CAP_MS + 60_000L)
    }
    voice = VoiceEngine(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val id = intent?.getIntExtra("id", -1) ?: -1
    when (intent?.action) {
      ACTION_PLAY -> {
        val r = ReminderStore.get(this, id)
        if (r == null) {
          if (!foregroundStarted) { stopSelfSafely() }
          return START_NOT_STICKY
        }
        if (!foregroundStarted) {
          foregroundStarted = true
          foregroundId = ReminderNotification.notifId(r.id)
          val n = ReminderNotification.build(this, r)
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(this, foregroundId, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
          } else startForeground(foregroundId, n)
        }
        queue.removeAll { it.id == r.id }
        if (current?.id == r.id) cleanupCurrent()
        queue.add(r)
        processNext()
      }
      ACTION_HALT -> {
        if (id == -1) {
          current?.let { ReminderStore.addEvent(this, it.id, "stopped", "from app") }
          queue.clear(); cleanupCurrent()
        } else {
          queue.removeAll { it.id == id }
          if (current?.id == id) cleanupCurrent()
        }
        processNext()
      }
    }
    return START_NOT_STICKY
  }

  private fun processNext() {
    if (current != null) return
    val r = queue.poll()
    if (r == null) { stopSelfSafely(); return }
    current = r
    if (ReminderNotification.notifId(r.id) != foregroundId) ReminderNotification.show(this, r)
    ReminderStore.addEvent(this, r.id, "fired")
    if (r.mode == "alarm") runAlarm(r) else runSingle(r)
  }

  private fun runSingle(r: Reminder) {
    if (!r.speak) { finishCurrent(r); return }
    speakOnce(r, false) { ok ->
      if (!ok) ReminderStore.addEvent(this, r.id, "voice_failed")
      finishCurrent(r)
    }
  }

  private fun runAlarm(r: Reminder) {
    startAlarmSound()
    capRunnable = Runnable {
      // Safety cap: stop the noise, keep a persistent notification so it is not lost.
      cleanupCurrent()
      ReminderStore.addEvent(this, r.id, "stopped", "auto-timeout")
      ReminderNotification.show(this, r.copy(mode = "persistent"))
      processNext()
    }
    main.postDelayed(capRunnable!!, ALARM_CAP_MS)
    if (r.speak) speakLoop(r) else Unit
  }

  private fun speakLoop(r: Reminder) {
    if (current?.id != r.id) return
    player?.setVolume(0.2f, 0.2f)
    speakOnce(r, true) { ok ->
      if (current?.id != r.id) return@speakOnce
      player?.setVolume(1f, 1f)
      if (!ok) ReminderStore.addEvent(this, r.id, "voice_failed")
      main.postDelayed({ speakLoop(r) }, if (ok) 4000L else 8000L)
    }
  }

  private fun speakOnce(r: Reminder, alarm: Boolean, done: (Boolean) -> Unit) {
    val text = if (r.message.isNotBlank()) r.message else r.title
    voice?.speak(text, r.lang, r.rate, r.pitch, alarm, done) ?: done(false)
  }

  private fun startAlarmSound() {
    try {
      val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      player = MediaPlayer().apply {
        setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
        setDataSource(this@ReminderService, uri)
        isLooping = true
        prepare(); start()
      }
    } catch (e: Exception) { player = null }
  }

  private fun cleanupCurrent() {
    capRunnable?.let { main.removeCallbacks(it) }; capRunnable = null
    main.removeCallbacksAndMessages(null)
    voice?.stop()
    try { player?.stop() } catch (e: Exception) {}
    player?.release(); player = null
    current = null
  }

  private fun finishCurrent(r: Reminder) {
    if (current?.id == r.id) current = null
    processNext()
  }

  private fun stopSelfSafely() {
    if (foregroundStarted) {
      // Detach so the reminder notification stays visible after the service is gone.
      stopForeground(STOP_FOREGROUND_DETACH)
      foregroundStarted = false
    }
    stopSelf()
  }

  override fun onDestroy() {
    running = false
    cleanupCurrent()
    voice?.shutdown(); voice = null
    try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (e: Exception) {}
    super.onDestroy()
  }
}
