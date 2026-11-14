package expo.modules.reminder

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/** Native mirror of a reminder. Persisted so alarms can be rebuilt after reboot without JS. */
data class Reminder(
  val id: Int,
  val title: String,
  val message: String,
  val mode: String,          // normal | persistent | alarm
  val speak: Boolean,
  val lang: String,          // BCP-47 tag, e.g. en-US
  val rate: Float,
  val pitch: Float,
  val snoozeMin: Int,
  val repeat: String,        // once | daily | weekly | weekdays
  val time: String,          // HH:mm
  val weekdays: List<Int>,   // ISO: Mon=1 .. Sun=7
  val onceAt: Long,          // epoch millis, used for "once"
  val enabled: Boolean
) {
  fun toJson(): JSONObject = JSONObject().apply {
    put("id", id); put("title", title); put("message", message); put("mode", mode)
    put("speak", speak); put("lang", lang); put("rate", rate.toDouble()); put("pitch", pitch.toDouble())
    put("snoozeMin", snoozeMin); put("repeat", repeat); put("time", time)
    put("weekdays", JSONArray(weekdays)); put("onceAt", onceAt); put("enabled", enabled)
  }

  /** Next trigger strictly after [from], or null if none (finished one-time / no weekdays). */
  fun nextAfter(from: Long): Long? {
    if (repeat == "once") return if (onceAt > from) onceAt else null
    val parts = time.split(":")
    val hh = parts.getOrNull(0)?.toIntOrNull() ?: return null
    val mm = parts.getOrNull(1)?.toIntOrNull() ?: return null
    val days = when (repeat) {
      "daily" -> (1..7).toList()
      else -> weekdays
    }
    if (days.isEmpty()) return null
    val cal = Calendar.getInstance()
    cal.timeInMillis = from
    for (offset in 0..7) {
      val c = Calendar.getInstance()
      c.timeInMillis = from
      c.add(Calendar.DAY_OF_YEAR, offset)
      c.set(Calendar.HOUR_OF_DAY, hh); c.set(Calendar.MINUTE, mm)
      c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0)
      val iso = ((c.get(Calendar.DAY_OF_WEEK) + 5) % 7) + 1
      if (c.timeInMillis > from && days.contains(iso)) return c.timeInMillis
    }
    return null
  }

  companion object {
    fun fromJson(o: JSONObject): Reminder {
      val wd = mutableListOf<Int>()
      val arr = o.optJSONArray("weekdays")
      if (arr != null) for (i in 0 until arr.length()) wd.add(arr.getInt(i))
      return Reminder(
        id = o.getInt("id"),
        title = o.optString("title", "Reminder"),
        message = o.optString("message", ""),
        mode = o.optString("mode", "normal"),
        speak = o.optBoolean("speak", true),
        lang = o.optString("lang", "en-US"),
        rate = o.optDouble("rate", 1.0).toFloat(),
        pitch = o.optDouble("pitch", 1.0).toFloat(),
        snoozeMin = o.optInt("snoozeMin", 10),
        repeat = o.optString("repeat", "once"),
        time = o.optString("time", "08:00"),
        weekdays = wd,
        onceAt = o.optLong("onceAt", 0L),
        enabled = o.optBoolean("enabled", true)
      )
    }
  }
}

/** SharedPreferences-backed store for reminders and the event queue read by JS. */
object ReminderStore {
  private const val PREFS = "gaurav_os_reminders"
  private fun prefs(ctx: Context): SharedPreferences =
    ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  @Synchronized fun put(ctx: Context, r: Reminder) {
    prefs(ctx).edit().putString("r_${r.id}", r.toJson().toString()).apply()
  }

  @Synchronized fun remove(ctx: Context, id: Int) {
    prefs(ctx).edit().remove("r_$id").remove("lf_$id").apply()
  }

  @Synchronized fun get(ctx: Context, id: Int): Reminder? {
    val s = prefs(ctx).getString("r_$id", null) ?: return null
    return try { Reminder.fromJson(JSONObject(s)) } catch (e: Exception) { null }
  }

  @Synchronized fun all(ctx: Context): List<Reminder> =
    prefs(ctx).all.entries.filter { it.key.startsWith("r_") }.mapNotNull {
      try { Reminder.fromJson(JSONObject(it.value as String)) } catch (e: Exception) { null }
    }

  @Synchronized fun clear(ctx: Context) { prefs(ctx).edit().clear().apply() }

  fun lastFired(ctx: Context, id: Int): Long = prefs(ctx).getLong("lf_$id", 0L)
  fun setLastFired(ctx: Context, id: Int, t: Long) { prefs(ctx).edit().putLong("lf_$id", t).apply() }

  /** Event types: fired, completed, snoozed, stopped, missed, voice_failed. */
  @Synchronized fun addEvent(ctx: Context, reminderId: Int, type: String, detail: String = "") {
    val arr = try { JSONArray(prefs(ctx).getString("events", "[]")) } catch (e: Exception) { JSONArray() }
    arr.put(JSONObject().put("reminderId", reminderId).put("type", type)
      .put("at", System.currentTimeMillis()).put("detail", detail))
    prefs(ctx).edit().putString("events", arr.toString()).apply()
  }

  @Synchronized fun takeEvents(ctx: Context): String {
    val s = prefs(ctx).getString("events", "[]") ?: "[]"
    prefs(ctx).edit().putString("events", "[]").apply()
    return s
  }
}
