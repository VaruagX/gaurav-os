package expo.modules.reminder

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import org.json.JSONObject

/** Home-screen widget: today's lectures + overall attendance. JS pushes the data; quick-add buttons deep-link into the app. */
class AgendaWidget : AppWidgetProvider() {
  override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) { ids.forEach { mgr.updateAppWidget(it, render(ctx)) } }

  companion object {
    private const val PREFS = "gaurav_os_widget"
    private val LINE_IDS = intArrayOf(R.id.w_l1, R.id.w_l2, R.id.w_l3, R.id.w_l4)

    fun save(ctx: Context, json: String) {
      ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("data", json).apply()
      val mgr = AppWidgetManager.getInstance(ctx)
      for (id in mgr.getAppWidgetIds(ComponentName(ctx, AgendaWidget::class.java))) mgr.updateAppWidget(id, render(ctx))
    }

    private fun link(ctx: Context, uri: String, req: Int): PendingIntent {
      val i = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(ctx.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      return PendingIntent.getActivity(ctx, req, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    fun render(ctx: Context): RemoteViews {
      val v = RemoteViews(ctx.packageName, R.layout.widget_agenda)
      val d = try { JSONObject(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("data", "{}") ?: "{}") } catch (e: Exception) { JSONObject() }
      v.setTextViewText(R.id.w_title, d.optString("title", "GAURAV OS"))
      v.setTextViewText(R.id.w_pct, d.optString("pct", ""))
      val lines = d.optJSONArray("lines")
      for (i in LINE_IDS.indices) {
        val t = lines?.optString(i, "") ?: ""
        v.setTextViewText(LINE_IDS[i], if (t.isBlank() && i == 0) "Open the app once to load today's schedule" else t)
      }
      v.setOnClickPendingIntent(R.id.w_root, link(ctx, "gauravos://attendance", 1))
      v.setOnClickPendingIntent(R.id.w_task, link(ctx, "gauravos://quick/task", 2))
      v.setOnClickPendingIntent(R.id.w_expense, link(ctx, "gauravos://quick/expense", 3))
      v.setOnClickPendingIntent(R.id.w_note, link(ctx, "gauravos://quick/note", 4))
      return v
    }
  }
}
