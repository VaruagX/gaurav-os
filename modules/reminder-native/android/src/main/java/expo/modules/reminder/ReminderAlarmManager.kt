package expo.modules.reminder

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build

object ReminderAlarmManager {
  const val SNOOZE_OFFSET = 1_000_000

  private fun alarmManager(ctx: Context) = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  fun canScheduleExact(ctx: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager(ctx).canScheduleExactAlarms()

  private fun pending(ctx: Context, id: Int, snooze: Boolean, create: Boolean): PendingIntent? {
    val code = if (snooze) id + SNOOZE_OFFSET else id
    val intent = Intent(ctx, ReminderReceiver::class.java)
      .setAction(ReminderReceiver.ACTION_FIRE)
      .setData(Uri.parse("gauravos://reminder/$code"))
      .putExtra("id", id)
    var flags = PendingIntent.FLAG_IMMUTABLE
    flags = if (create) flags or PendingIntent.FLAG_UPDATE_CURRENT else flags or PendingIntent.FLAG_NO_CREATE
    return PendingIntent.getBroadcast(ctx, code, intent, flags)
  }

  private fun showIntent(ctx: Context): PendingIntent? {
    val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return null
    return PendingIntent.getActivity(ctx, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  /** Set (replace) a single alarm. Same request code => no duplicates. */
  fun setAlarm(ctx: Context, id: Int, at: Long, snooze: Boolean) {
    val am = alarmManager(ctx)
    val pi = pending(ctx, id, snooze, true)!!
    am.cancel(pi)
    if (canScheduleExact(ctx)) {
      // setAlarmClock is exempt from Doze and OEM battery throttling; best option for a reminder app.
      am.setAlarmClock(AlarmManager.AlarmClockInfo(at, showIntent(ctx) ?: pi), pi)
    } else {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    }
  }

  /** Schedule next occurrence of a reminder. Returns trigger time or null. */
  fun schedule(ctx: Context, r: Reminder): Long? {
    ReminderStore.put(ctx, r)
    cancelAlarms(ctx, r.id)
    if (!r.enabled) return null
    val next = r.nextAfter(System.currentTimeMillis()) ?: return null
    setAlarm(ctx, r.id, next, false)
    return next
  }

  fun snooze(ctx: Context, r: Reminder) {
    setAlarm(ctx, r.id, System.currentTimeMillis() + r.snoozeMin.coerceAtLeast(1) * 60_000L, true)
  }

  private fun cancelAlarms(ctx: Context, id: Int) {
    val am = alarmManager(ctx)
    pending(ctx, id, false, false)?.let { am.cancel(it); it.cancel() }
    pending(ctx, id, true, false)?.let { am.cancel(it); it.cancel() }
  }

  fun cancel(ctx: Context, id: Int) {
    cancelAlarms(ctx, id)
    ReminderStore.remove(ctx, id)
    ReminderNotification.cancel(ctx, id)
  }

  fun cancelAll(ctx: Context) {
    ReminderStore.all(ctx).forEach { cancelAlarms(ctx, it.id); ReminderNotification.cancel(ctx, it.id) }
    ReminderStore.clear(ctx)
  }

  /** Rebuild every alarm from persisted data (boot, app update, time/zone change). */
  fun rescheduleAll(ctx: Context) {
    val now = System.currentTimeMillis()
    for (r in ReminderStore.all(ctx)) {
      if (!r.enabled) continue
      if (r.repeat == "once" && r.onceAt <= now) {
        val already = ReminderStore.lastFired(ctx, r.id) >= r.onceAt
        if (!already && now - r.onceAt < 30 * 60_000L) {
          // Missed while the phone was off / app updated: fire it now.
          ReminderReceiver.fire(ctx, r.id)
        } else if (!already) {
          ReminderStore.addEvent(ctx, r.id, "missed")
          ReminderStore.put(ctx, r.copy(enabled = false))
        }
        continue
      }
      schedule(ctx, r)
    }
  }
}
