package expo.modules.reminder

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat

/** Optional ongoing notification with Task / Expense / Note shortcuts. */
object QuickAddNotification {
  private const val CH = "gaurav_quick_add"
  private const val ID = 9100
  private const val PREFS = "gaurav_os_quick"

  private fun pi(ctx: Context, uri: String, req: Int): PendingIntent {
    val i = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(ctx.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(ctx, req, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  fun isEnabled(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("on", false)

  fun set(ctx: Context, on: Boolean) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("on", on).apply()
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (!on) { nm.cancel(ID); return }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CH) == null) {
      val ch = NotificationChannel(CH, "Quick add", NotificationManager.IMPORTANCE_LOW)
      ch.setShowBadge(false); nm.createNotificationChannel(ch)
    }
    val n = NotificationCompat.Builder(ctx, CH)
      .setSmallIcon(R.drawable.ic_stat_reminder).setContentTitle("GAURAV OS · Quick add").setContentText("Add something in two taps")
      .setOngoing(true).setOnlyAlertOnce(true).setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(pi(ctx, "gauravos://home", 10))
      .addAction(0, "Task", pi(ctx, "gauravos://quick/task", 11))
      .addAction(0, "Expense", pi(ctx, "gauravos://quick/expense", 12))
      .addAction(0, "Note", pi(ctx, "gauravos://quick/note", 13))
      .build()
    try { nm.notify(ID, n) } catch (e: SecurityException) { }
  }

  fun restore(ctx: Context) { if (isEnabled(ctx)) set(ctx, true) }
}
