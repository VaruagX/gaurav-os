package expo.modules.reminder

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Long-lived, low-priority foreground service ("call assistant ready"). Started while the app is open, it
 *  1. keeps the text-to-speech engine warm so the announcement starts instantly when a call rings, and
 *  2. holds a microphone-type foreground service that was started while the app was visible, which is the one way
 *     Android lets a background process keep listening (a service started from the background gets the mic silenced).
 */
class CallReadyService : Service() {
  companion object {
    private const val CHANNEL = "gaurav_call_ready"
    private const val NOTIF_ID = 9202
    @Volatile var running = false
    @Volatile var voice: VoiceEngine? = null

    fun start(ctx: Context): Boolean {
      if (running) return true
      if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return false
      return try { ContextCompat.startForegroundService(ctx, Intent(ctx, CallReadyService::class.java)); true } catch (e: Exception) { false }
    }

    fun stop(ctx: Context) { ctx.stopService(Intent(ctx, CallReadyService::class.java)) }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "Call assistant ready", NotificationManager.IMPORTANCE_MIN))
    }
    val n = NotificationCompat.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_stat_reminder)
      .setContentTitle("Call assistant is ready").setContentText("Will announce incoming calls")
      .setOngoing(true).setPriority(NotificationCompat.PRIORITY_MIN).build()
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceCompat.startForeground(this, NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      else startForeground(NOTIF_ID, n)
    } catch (e: Exception) {
      CallAssistantStore.addEvent(this, null, "failed", "ready service refused: ${e.javaClass.simpleName}")
      stopSelf(); return START_NOT_STICKY
    }
    running = true
    CallAssistantService.restoreRing(this)
    if (voice == null) voice = VoiceEngine(this)
    KeywordModel.ensure(this) // load the offline yes/no model now so it is instant when a call rings
    return START_STICKY
  }

  override fun onDestroy() {
    running = false
    voice?.shutdown(); voice = null
    super.onDestroy()
  }
}
