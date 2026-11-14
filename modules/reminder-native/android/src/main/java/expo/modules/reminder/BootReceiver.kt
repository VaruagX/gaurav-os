package expo.modules.reminder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Rebuilds all alarms after reboot, app update, clock change or timezone change. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED, "android.intent.action.QUICKBOOT_POWERON",
      Intent.ACTION_MY_PACKAGE_REPLACED, Intent.ACTION_TIMEZONE_CHANGED, Intent.ACTION_TIME_CHANGED -> {
        ReminderNotification.ensureChannels(ctx)
        ReminderAlarmManager.rescheduleAll(ctx)
        PromptManager.rescheduleAll(ctx)
        QuickAddNotification.restore(ctx)
      }
    }
  }
}
