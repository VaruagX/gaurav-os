package expo.modules.reminder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telecom.Call
import android.telecom.CallScreeningService
import android.telephony.TelephonyManager

/**
 * Bound by the system once the user grants the "Caller ID & spam" (call screening) role. It always ALLOWS the call
 * (we never block anything) and only uses the moment to learn the caller number before the phone rings.
 */
class CallScreeningServiceImpl : CallScreeningService() {
  override fun onCreate() { super.onCreate(); CallAssistantService.prewarm(applicationContext) }

  override fun onScreenCall(details: Call.Details) {
    respondToCall(details, CallResponse.Builder().build())
    try {
      if (details.callDirection == Call.Details.DIRECTION_INCOMING) {
        CallAssistantService.start(applicationContext, details.handle?.schemeSpecificPart)
      }
    } catch (e: Exception) {
      CallAssistantStore.addEvent(applicationContext, null, "failed", "screening: ${e.javaClass.simpleName}")
    }
  }
}

/**
 * Fallback + call-end signal. Without the screening role the number is usually null, so the call is announced
 * as an unknown number. IDLE/OFFHOOK tell a running announcement that the call ended or was answered.
 */
class CallStateReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
    val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
    when (state) {
      TelephonyManager.EXTRA_STATE_RINGING -> {
        @Suppress("DEPRECATION") val number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)
        CallAssistantService.start(ctx, number)
      }
      TelephonyManager.EXTRA_STATE_IDLE -> CallAssistantService.onCallState("IDLE")
      TelephonyManager.EXTRA_STATE_OFFHOOK -> CallAssistantService.onCallState("OFFHOOK")
    }
  }
}
