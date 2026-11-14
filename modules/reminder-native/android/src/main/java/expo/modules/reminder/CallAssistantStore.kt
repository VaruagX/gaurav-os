package expo.modules.reminder

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Config pushed from JS + event queue read back by JS. Plain SharedPreferences so receivers work with no JS. */
object CallAssistantStore {
  private const val PREFS = "gaurav_os_call_assistant"
  private fun p(ctx: Context) = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  data class Config(val enabled: Boolean, val lang: String, val timeoutSec: Int, val user: String, val speaker: Boolean, val duckRing: Boolean)

  fun config(ctx: Context): Config {
    val s = p(ctx)
    return Config(
      enabled = s.getBoolean("enabled", false),
      lang = s.getString("lang", "both") ?: "both",
      timeoutSec = s.getInt("timeoutSec", 8).coerceIn(4, 30),
      user = s.getString("user", "Gaurav") ?: "Gaurav",
      speaker = s.getBoolean("speaker", true),
      duckRing = s.getBoolean("duckRing", true)
    )
  }

  fun saveConfig(ctx: Context, json: String) {
    val o = JSONObject(json)
    p(ctx).edit()
      .putBoolean("enabled", o.optBoolean("enabled", false))
      .putString("lang", o.optString("lang", "both"))
      .putInt("timeoutSec", o.optInt("timeoutSec", 8).coerceIn(4, 30))
      .putString("user", o.optString("user", "Gaurav").ifBlank { "Gaurav" })
      .putBoolean("speaker", o.optBoolean("speaker", true))
      .putBoolean("duckRing", o.optBoolean("duckRing", true))
      .apply()
  }

  /** Ring volume saved while we lowered it, so it can always be restored (even after a process death). */
  fun saveRing(ctx: Context, v: Int) { p(ctx).edit().putInt("savedRing", v).apply() }
  fun takeRing(ctx: Context): Int { val v = p(ctx).getInt("savedRing", -1); p(ctx).edit().remove("savedRing").apply(); return v }

  /** outcome: answered | rejected | no_response | call_ended | tts_failed | failed | sim_answer | sim_reject */
  @Synchronized fun addEvent(ctx: Context, name: String?, outcome: String, detail: String = "") {
    val arr = try { JSONArray(p(ctx).getString("events", "[]")) } catch (e: Exception) { JSONArray() }
    arr.put(JSONObject().put("name", name ?: "").put("outcome", outcome).put("detail", detail).put("at", System.currentTimeMillis()))
    p(ctx).edit().putString("events", arr.toString()).apply()
  }

  @Synchronized fun takeEvents(ctx: Context): String {
    val s = p(ctx).getString("events", "[]") ?: "[]"
    p(ctx).edit().putString("events", "[]").apply()
    return s
  }
}
