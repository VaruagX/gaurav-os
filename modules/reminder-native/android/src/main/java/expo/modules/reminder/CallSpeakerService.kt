package expo.modules.reminder

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Optional helper. Android gives normal apps no way to change a phone call's audio route (only the phone app can),
 * so after the call assistant answers a call this taps the Speaker button on the system call screen.
 * It is limited (in call_speaker_service.xml) to dialer packages and only acts while a request is pending.
 */
class CallSpeakerService : AccessibilityService() {
  companion object {
    private const val TAG = "GauravCall"
    @Volatile private var instance: CallSpeakerService? = null
    private val LABEL = Regex("(?i)(loud ?speaker|speaker ?phone|speaker|hands[- ]?free|स्पीकर)")
    private val NOT = Regex("(?i)(earpiece|bluetooth|mute|off)")

    fun isEnabled(ctx: Context): Boolean {
      val flat = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
      val me = ComponentName(ctx, CallSpeakerService::class.java).flattenToString()
      return flat.split(':').any { it.equals(me, true) || it.equals(ctx.packageName + "/" + CallSpeakerService::class.java.name, true) }
    }

    /** Press Speaker as soon as the call screen shows it. [onResult] gets a short human-readable outcome. */
    fun request(onResult: (String) -> Unit): Boolean {
      val s = instance ?: return false
      s.begin(onResult); return true
    }
  }

  private val main = Handler(Looper.getMainLooper())
  private var callback: ((String) -> Unit)? = null
  private var until = 0L
  private var clicked = false

  override fun onServiceConnected() { instance = this; Log.i(TAG, "speaker helper connected") }
  override fun onInterrupt() {}
  override fun onUnbind(intent: android.content.Intent?): Boolean { instance = null; return super.onUnbind(intent) }
  override fun onDestroy() { instance = null; super.onDestroy() }

  fun begin(cb: (String) -> Unit) {
    callback = cb; clicked = false; until = System.currentTimeMillis() + 14_000L
    main.removeCallbacksAndMessages(null)
    tick()
  }

  private fun done(msg: String) {
    val cb = callback; callback = null; until = 0
    Log.i(TAG, "speaker: $msg")
    main.removeCallbacksAndMessages(null)
    cb?.invoke(msg)
  }

  private fun speakerOn(): Boolean {
    val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    @Suppress("DEPRECATION") return am.isSpeakerphoneOn
  }

  private fun tick() {
    if (callback == null) return
    if (System.currentTimeMillis() > until) { done(if (clicked) "tapped Speaker button" else "speaker button not found"); return }
    if (speakerOn()) { done("on speaker"); return }
    if (!clicked && tryClick()) {
      clicked = true
      // Give Telecom a moment to switch, then confirm; if the flag does not reflect it we report the tap honestly.
      main.postDelayed({ if (callback != null) done(if (speakerOn()) "on speaker" else "tapped Speaker button") }, 700)
      return
    }
    main.postDelayed({ tick() }, 200)
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (callback != null && !clicked) main.post { tick() }
  }

  private fun tryClick(): Boolean {
    val roots = ArrayList<AccessibilityNodeInfo>()
    try { windows?.forEach { w -> w.root?.let { roots.add(it) } } } catch (e: Exception) {}
    rootInActiveWindow?.let { roots.add(it) }
    for (r in roots) {
      val n = find(r, 0) ?: continue
      var c: AccessibilityNodeInfo? = n
      while (c != null && !c.isClickable) c = c.parent
      if (c != null && c.performAction(AccessibilityNodeInfo.ACTION_CLICK)) { Log.i(TAG, "tapped speaker node"); return true }
    }
    return false
  }

  private fun find(n: AccessibilityNodeInfo, depth: Int): AccessibilityNodeInfo? {
    if (depth > 25) return null
    val label = "${n.contentDescription ?: ""} ${n.text ?: ""}".trim()
    if (label.isNotEmpty() && LABEL.containsMatchIn(label) && !NOT.containsMatchIn(label)) return n
    for (i in 0 until n.childCount) { n.getChild(i)?.let { c -> find(c, depth + 1)?.let { return it } } }
    return null
  }
}
