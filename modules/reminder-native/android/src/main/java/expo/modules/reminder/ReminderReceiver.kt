package expo.modules.reminder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class ReminderReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_FIRE = "expo.modules.reminder.FIRE"
    const val ACTION_COMPLETE = "expo.modules.reminder.COMPLETE"
    const val ACTION_SNOOZE = "expo.modules.reminder.SNOOZE"
    const val ACTION_STOP = "expo.modules.reminder.STOP"
    const val ACTION_DISMISSED = "expo.modules.reminder.DISMISSED"

    /** Fire a reminder: re-arm next occurrence first (so a crash can't lose the series), then play. */
    fun fire(ctx: Context, id: Int) {
      val r = ReminderStore.get(ctx, id) ?: return
      if (!r.enabled) return
      val now = System.currentTimeMillis()
      ReminderStore.setLastFired(ctx, id, now)
      val next = r.nextAfter(now + 1000)
      if (next != null && r.repeat != "once") {
        ReminderAlarmManager.setAlarm(ctx, id, next, false)
      } else if (r.repeat == "once") {
        ReminderStore.put(ctx, r.copy(enabled = false))
      }
      try {
        ReminderService.play(ctx, id)
      } catch (e: Exception) {
        // Foreground service could not start: fall back to a plain notification.
        ReminderNotification.show(ctx, r)
        ReminderStore.addEvent(ctx, id, "fired", "notification-only")
      }
    }
  }

  override fun onReceive(ctx: Context, intent: Intent) {
    val id = intent.getIntExtra("id", -1)
    when (intent.action) {
      ACTION_FIRE -> fire(ctx, id)
      ACTION_COMPLETE -> acknowledge(ctx, id, "completed")
      ACTION_STOP -> acknowledge(ctx, id, "stopped")
      ACTION_SNOOZE -> {
        val r = ReminderStore.get(ctx, id)
        acknowledge(ctx, id, "snoozed")
        if (r != null) ReminderAlarmManager.snooze(ctx, r)
      }
      ACTION_DISMISSED -> {
        // Persistent reminders must survive a swipe-away until acknowledged.
        val r = ReminderStore.get(ctx, id)
        if (r != null && r.mode == "persistent") ReminderNotification.show(ctx, r)
      }
    }
  }

  private fun acknowledge(ctx: Context, id: Int, type: String) {
    ReminderNotification.cancel(ctx, id)
    ReminderStore.addEvent(ctx, id, type)
    if (ReminderService.running) {
      try { ReminderService.halt(ctx, id) } catch (e: Exception) {}
    }
  }
}
