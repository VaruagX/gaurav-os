package expo.modules.reminder

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/**
 * Generic scheduled notifications with action buttons (lecture-end "Present / Absent", morning briefing, backup nudge…).
 * JS pushes a whole *group* of prompts; they are persisted here so alarms survive reboots with no JS running.
 * Button taps are queued as events and imported by JS the next time the app opens.
 */
object PromptManager {
  private const val PREFS = "gaurav_os_prompts"
  const val CHANNEL = "gaurav_prompts"
  const val ACTION_FIRE = "expo.modules.reminder.PROMPT_FIRE"
  const val ACTION_TAP = "expo.modules.reminder.PROMPT_ACTION"

  private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private fun am(ctx: Context) = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
  private fun code(id: String) = id.hashCode() and 0x7fffffff
  private fun canExact(ctx: Context) = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am(ctx).canScheduleExactAlarms()

  fun ensureChannel(ctx: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL) == null) {
      val ch = NotificationChannel(CHANNEL, "Smart prompts", NotificationManager.IMPORTANCE_HIGH)
      ch.description = "Lecture attendance questions, morning briefing, backup reminders"
      nm.createNotificationChannel(ch)
    }
  }

  private fun firePi(ctx: Context, id: String, create: Boolean): PendingIntent? {
    val i = Intent(ctx, PromptReceiver::class.java).setAction(ACTION_FIRE).setData(Uri.parse("gauravos://prompt/$id")).putExtra("id", id)
    val flags = PendingIntent.FLAG_IMMUTABLE or (if (create) PendingIntent.FLAG_UPDATE_CURRENT else PendingIntent.FLAG_NO_CREATE)
    return PendingIntent.getBroadcast(ctx, code(id), i, flags)
  }

  private fun nextAfter(p: JSONObject, from: Long): Long? {
    val repeat = p.optString("repeat", "once")
    if (repeat == "once") { val at = p.optLong("onceAt", 0L); return if (at > from) at else null }
    val parts = p.optString("time", "08:00").split(":")
    val hh = parts.getOrNull(0)?.toIntOrNull() ?: return null
    val mm = parts.getOrNull(1)?.toIntOrNull() ?: return null
    val weekday = p.optInt("weekday", 0)
    for (offset in 0..7) {
      val c = Calendar.getInstance(); c.timeInMillis = from; c.add(Calendar.DAY_OF_YEAR, offset)
      c.set(Calendar.HOUR_OF_DAY, hh); c.set(Calendar.MINUTE, mm); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0)
      val iso = ((c.get(Calendar.DAY_OF_WEEK) + 5) % 7) + 1
      if (c.timeInMillis > from && (repeat == "daily" || weekday == iso)) return c.timeInMillis
    }
    return null
  }

  private fun arm(ctx: Context, p: JSONObject, from: Long = System.currentTimeMillis()) {
    val id = p.getString("id")
    val pi = firePi(ctx, id, true)!!
    am(ctx).cancel(pi)
    val at = nextAfter(p, from) ?: return
    if (canExact(ctx)) am(ctx).setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    else am(ctx).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
  }

  private fun groupKey(g: String) = "g_$g"

  /** Replace every prompt of [group] with the ones in [json] (a JSON array). */
  @Synchronized fun setGroup(ctx: Context, group: String, json: String) {
    val p = prefs(ctx)
    val old = try { JSONArray(p.getString(groupKey(group), "[]")) } catch (e: Exception) { JSONArray() }
    for (i in 0 until old.length()) firePi(ctx, old.getJSONObject(i).getString("id"), false)?.let { am(ctx).cancel(it); it.cancel() }
    val arr = try { JSONArray(json) } catch (e: Exception) { JSONArray() }
    p.edit().putString(groupKey(group), arr.toString()).apply()
    for (i in 0 until arr.length()) arm(ctx, arr.getJSONObject(i))
  }

  private fun allPrompts(ctx: Context): List<JSONObject> {
    val out = mutableListOf<JSONObject>()
    for ((k, v) in prefs(ctx).all) if (k.startsWith("g_")) {
      val arr = try { JSONArray(v as String) } catch (e: Exception) { continue }
      for (i in 0 until arr.length()) out.add(arr.getJSONObject(i))
    }
    return out
  }

  fun rescheduleAll(ctx: Context) { ensureChannel(ctx); allPrompts(ctx).forEach { arm(ctx, it) } }

  private fun find(ctx: Context, id: String) = allPrompts(ctx).firstOrNull { it.optString("id") == id }

  private fun viewIntent(ctx: Context, uri: String?, req: Int): PendingIntent? {
    val i = if (!uri.isNullOrBlank()) Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(ctx.packageName)
            else ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
    i ?: return null
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(ctx, req, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  fun fire(ctx: Context, id: String) {
    val p = find(ctx, id) ?: return
    val now = System.currentTimeMillis()
    if (p.optString("repeat") != "once") arm(ctx, p, now + 1000)
    ensureChannel(ctx)
    val text = p.optString("text", "")
    val b = NotificationCompat.Builder(ctx, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_reminder)
      .setContentTitle(p.optString("title", "GAURAV OS"))
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setAutoCancel(true)
      .setWhen(now)
    viewIntent(ctx, p.optString("open").ifBlank { null }, code(id) + 7)?.let { b.setContentIntent(it) }
    val actions = p.optJSONArray("actions") ?: JSONArray()
    for (i in 0 until actions.length()) {
      val a = actions.getJSONObject(i)
      val open = a.optString("open", "")
      if (open.isNotBlank()) {
        viewIntent(ctx, open, code(id) + 100 + i)?.let { b.addAction(0, a.optString("label"), it) }
      } else {
        val ai = Intent(ctx, PromptReceiver::class.java).setAction(ACTION_TAP)
          .setData(Uri.parse("gauravos://promptaction/$id/${a.optString("key")}/$now"))
          .putExtra("id", id).putExtra("key", a.optString("key")).putExtra("firedAt", now)
        val pi = PendingIntent.getBroadcast(ctx, code(id) + 100 + i, ai, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        b.addAction(0, a.optString("label"), pi)
      }
    }
    try {
      (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify("prompt", code(id), b.build())
    } catch (e: SecurityException) { /* notification permission denied */ }
  }

  @Synchronized fun addEvent(ctx: Context, id: String, group: String, action: String, data: String, firedAt: Long) {
    val sp = prefs(ctx)
    val arr = try { JSONArray(sp.getString("events", "[]")) } catch (e: Exception) { JSONArray() }
    arr.put(JSONObject().put("id", id).put("group", group).put("action", action).put("data", data).put("firedAt", firedAt).put("at", System.currentTimeMillis()))
    // Keep the queue bounded: notifications nobody answers must not grow it forever.
    while (arr.length() > 400) arr.remove(0)
    sp.edit().putString("events", arr.toString()).apply()
  }

  @Synchronized fun takeEvents(ctx: Context): String {
    val sp = prefs(ctx)
    val s = sp.getString("events", "[]") ?: "[]"
    sp.edit().putString("events", "[]").apply()
    return s
  }

  fun handleAction(ctx: Context, id: String, key: String, firedAt: Long) {
    val p = find(ctx, id)
    addEvent(ctx, id, p?.optString("group") ?: "", key, p?.optString("data") ?: "", firedAt)
    (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel("prompt", code(id))
  }
}

class PromptReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    val id = intent.getStringExtra("id") ?: return
    when (intent.action) {
      PromptManager.ACTION_FIRE -> PromptManager.fire(ctx, id)
      PromptManager.ACTION_TAP -> PromptManager.handleAction(ctx, id, intent.getStringExtra("key") ?: "", intent.getLongExtra("firedAt", System.currentTimeMillis()))
    }
  }
}
