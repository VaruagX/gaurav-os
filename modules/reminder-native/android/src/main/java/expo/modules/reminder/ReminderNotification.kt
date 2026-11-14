package expo.modules.reminder

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat

object ReminderNotification {
  const val CH_NORMAL = "gaurav_reminders_normal"
  const val CH_PERSISTENT = "gaurav_reminders_persistent"
  const val CH_ALARM = "gaurav_reminders_alarm"
  private const val BASE = 10_000

  fun notifId(id: Int) = BASE + id

  fun ensureChannels(ctx: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    fun mk(id: String, name: String, desc: String) {
      if (nm.getNotificationChannel(id) != null) return
      val ch = NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH)
      ch.description = desc
      ch.setSound(null, null) // sound/speech is produced by ReminderService
      ch.enableVibration(true)
      ch.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      nm.createNotificationChannel(ch)
    }
    mk(CH_NORMAL, "Reminders", "Normal voice reminders")
    mk(CH_PERSISTENT, "Persistent reminders", "Stay until completed or snoozed")
    mk(CH_ALARM, "Alarm reminders", "Alarm sound with repeated speech")
  }

  private fun action(ctx: Context, id: Int, act: String, req: Int): PendingIntent {
    val i = Intent(ctx, ReminderReceiver::class.java).setAction(act)
      .setData(Uri.parse("gauravos://action/$act/$id")).putExtra("id", id)
    return PendingIntent.getBroadcast(ctx, req + id, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  fun build(ctx: Context, r: Reminder): Notification {
    ensureChannels(ctx)
    val channel = when (r.mode) { "alarm" -> CH_ALARM; "persistent" -> CH_PERSISTENT; else -> CH_NORMAL }
    val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val contentPi = launch?.let {
      PendingIntent.getActivity(ctx, notifId(r.id), it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val text = if (r.message.isNotBlank()) r.message else r.title
    val b = NotificationCompat.Builder(ctx, channel)
      .setSmallIcon(R.drawable.ic_stat_reminder)
      .setContentTitle(r.title)
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setCategory(if (r.mode == "alarm") NotificationCompat.CATEGORY_ALARM else NotificationCompat.CATEGORY_REMINDER)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setWhen(System.currentTimeMillis())
      .setShowWhen(true)
      .setContentIntent(contentPi)

    when (r.mode) {
      "normal" -> b.setAutoCancel(true)
        .addAction(0, "Done", action(ctx, r.id, ReminderReceiver.ACTION_COMPLETE, 1_000_000))
      "persistent" -> {
        b.setOngoing(true).setAutoCancel(false)
          .setDeleteIntent(action(ctx, r.id, ReminderReceiver.ACTION_DISMISSED, 4_000_000))
          .addAction(0, "Complete", action(ctx, r.id, ReminderReceiver.ACTION_COMPLETE, 1_000_000))
          .addAction(0, "Snooze ${r.snoozeMin}m", action(ctx, r.id, ReminderReceiver.ACTION_SNOOZE, 2_000_000))
      }
      "alarm" -> {
        b.setOngoing(true).setAutoCancel(false)
          .addAction(0, "Stop", action(ctx, r.id, ReminderReceiver.ACTION_STOP, 3_000_000))
          .addAction(0, "Snooze ${r.snoozeMin}m", action(ctx, r.id, ReminderReceiver.ACTION_SNOOZE, 2_000_000))
        if (contentPi != null) b.setFullScreenIntent(contentPi, true)
      }
    }
    return b.build()
  }

  fun show(ctx: Context, r: Reminder) {
    try {
      val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.notify(notifId(r.id), build(ctx, r))
    } catch (e: SecurityException) { /* notification permission denied */ }
  }

  fun cancel(ctx: Context, id: Int) {
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.cancel(notifId(id))
  }
}
