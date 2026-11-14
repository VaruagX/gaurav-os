package expo.modules.reminder

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.text.TextUtils
import android.text.TextPaint
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

/**
 * Draws a khata statement (headline balance, stats, transaction rows) to a PNG (one tall image, first N rows)
 * or a paginated A4 PDF. All text (including rupee formatting) is prepared in JS; this only does layout.
 * Design units are 1080 px wide; the PDF scales them to A4 points.
 */
object StatementRenderer {
  private const val UW = 1080f
  private const val ROW_H = 118f
  private const val HEADER_H = 150f
  private const val FOOT_H = 90f

  private val INK = Color.parseColor("#16181D")
  private val MUTED = Color.parseColor("#6B7078")
  private val LINE = Color.parseColor("#E3E3DE")
  private val CARD = Color.parseColor("#F4F4F1")
  private val GREEN = Color.parseColor("#2E8B57")
  private val RED = Color.parseColor("#C4443A")

  private fun tone(t: String?) = when (t) { "green" -> GREEN; "red" -> RED; "grey" -> MUTED; else -> INK }

  private class P(val c: Canvas, val s: Float) {
    private val paint = TextPaint(Paint.ANTI_ALIAS_FLAG)
    fun text(t: String, x: Float, y: Float, size: Float, color: Int, bold: Boolean = false, right: Boolean = false, maxW: Float? = null, strike: Boolean = false) {
      paint.textSize = size * s; paint.color = color
      paint.typeface = if (bold) Typeface.create(Typeface.DEFAULT, Typeface.BOLD) else Typeface.DEFAULT
      paint.isStrikeThruText = strike
      paint.textAlign = if (right) Paint.Align.RIGHT else Paint.Align.LEFT
      val out = if (maxW != null) TextUtils.ellipsize(t, paint, maxW * s, TextUtils.TruncateAt.END).toString() else t
      c.drawText(out, x * s, y * s, paint)
    }
    fun rect(l: Float, t: Float, r: Float, b: Float, color: Int, radius: Float = 0f) {
      paint.style = Paint.Style.FILL; paint.color = color
      c.drawRoundRect(RectF(l * s, t * s, r * s, b * s), radius * s, radius * s, paint)
    }
    fun line(y: Float, x1: Float, x2: Float) { paint.color = LINE; paint.strokeWidth = 2f * s; c.drawLine(x1 * s, y * s, x2 * s, y * s, paint) }
    fun logo(cx: Float, cy: Float, r: Float) {
      paint.style = Paint.Style.STROKE; paint.color = Color.WHITE; paint.strokeWidth = r * 0.28f * s
      val oval = RectF((cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s)
      c.drawArc(oval, -35f, -325f, false, paint)
      c.drawLine(cx * s, cy * s, (cx + r) * s, cy * s, paint)
      paint.style = Paint.Style.FILL
    }
  }

  private fun header(p: P, m: JSONObject, big: Boolean) {
    val h = if (big) HEADER_H else 96f
    p.rect(0f, 0f, UW, h, INK)
    p.logo(80f, h / 2, if (big) 30f else 22f)
    p.text("GAURAV OS", 140f, h / 2 + (if (big) -4f else 6f), if (big) 42f else 34f, Color.WHITE, true)
    if (big) p.text(m.optString("title", "My Khata"), 140f, h / 2 + 36f, 26f, Color.parseColor("#B9BDC4"))
    p.text(m.optString("date"), UW - 60f, h / 2 + 10f, 26f, Color.parseColor("#B9BDC4"), right = true)
  }

  /** Draws the top block; returns the y (in units) where rows start. */
  private fun top(p: P, m: JSONObject): Float {
    header(p, m, true)
    var y = HEADER_H + 40f
    val name = m.optString("name")
    if (name.isNotEmpty()) {
      p.text(name, 60f, y + 44f, 52f, INK, true, maxW = UW - 120f)
      val sub = m.optString("subtitle")
      if (sub.isNotEmpty()) p.text(sub, 60f, y + 88f, 28f, MUTED, maxW = UW - 120f)
      y += 120f
    }
    val hl = m.optJSONObject("headline")
    if (hl != null) {
      p.rect(40f, y, UW - 40f, y + 200f, CARD, 28f)
      p.text(hl.optString("label"), 80f, y + 56f, 26f, MUTED, true)
      p.text(hl.optString("amount"), 80f, y + 150f, 90f, tone(hl.optString("tone")), true, maxW = UW - 160f)
      y += 230f
    }
    val stats = m.optJSONArray("stats")
    if (stats != null && stats.length() > 0) {
      val n = stats.length().coerceAtMost(4)
      val gap = 16f
      val tw = (UW - 80f - gap * (n - 1)) / n
      for (i in 0 until n) {
        val st = stats.getJSONObject(i)
        val x = 40f + i * (tw + gap)
        p.rect(x, y, x + tw, y + 124f, CARD, 22f)
        p.text(st.optString("label"), x + 20f, y + 44f, if (n > 3) 19f else 22f, MUTED, true, maxW = tw - 32f)
        p.text(st.optString("value"), x + 20f, y + 96f, if (n > 3) 31f else 38f, INK, true, maxW = tw - 32f)
      }
      y += 154f
    }
    val sec = m.optString("section")
    if (sec.isNotEmpty()) { p.text(sec, 60f, y + 44f, 24f, MUTED, true); y += 70f }
    return y
  }

  private fun row(p: P, r: JSONObject, y: Float) {
    val deleted = r.optBoolean("deleted", false)
    val col = if (deleted) MUTED else tone(r.optString("tone"))
    val dateW = if (r.optString("date").isEmpty()) 0f else 170f
    if (dateW > 0f) p.text(r.optString("date"), 60f, y + 50f, 26f, MUTED)
    val tx = 60f + dateW
    val rightW = 300f
    p.text(r.optString("title"), tx, y + 50f, 32f, if (deleted) MUTED else INK, true, maxW = UW - tx - rightW - 60f, strike = deleted)
    val note = r.optString("note")
    if (note.isNotEmpty()) p.text(note, tx, y + 90f, 26f, MUTED, maxW = UW - tx - rightW - 60f)
    p.text(r.optString("amount"), UW - 60f, y + 50f, 34f, col, true, right = true, strike = deleted)
    val bal = r.optString("balance")
    if (bal.isNotEmpty()) p.text(bal, UW - 60f, y + 90f, 24f, MUTED, right = true)
    p.line(y + ROW_H, 60f, UW - 60f)
  }

  private fun cleanOld(dir: File) {
    val cutoff = System.currentTimeMillis() - 24L * 3600_000L
    dir.listFiles()?.forEach { if (it.lastModified() < cutoff) it.delete() }
  }

  /** format: "png" | "pdf". Returns the absolute path of the created file. */
  fun render(ctx: Context, json: String, format: String, maxRows: Int): String {
    val m = JSONObject(json)
    val dir = File(ctx.cacheDir, "khata_share").apply { mkdirs() }
    cleanOld(dir)
    val base = m.optString("fileName", "khata").replace(Regex("[^A-Za-z0-9._-]"), "_").take(60).ifEmpty { "khata" }
    val rows = m.optJSONArray("rows")
    val n = rows?.length() ?: 0
    return if (format == "pdf") pdf(File(dir, "$base.pdf"), m, n) else png(File(dir, "$base.png"), m, n, maxRows)
  }

  private fun topHeight(m: JSONObject): Float {
    var y = HEADER_H + 40f
    if (m.optString("name").isNotEmpty()) y += 120f
    if (m.optJSONObject("headline") != null) y += 230f
    val st = m.optJSONArray("stats"); if (st != null && st.length() > 0) y += 154f
    if (m.optString("section").isNotEmpty()) y += 70f
    return y
  }

  private fun png(file: File, m: JSONObject, n: Int, maxRows: Int): String {
    val shown = minOf(n, maxRows)
    val more = n - shown
    val h = topHeight(m) + shown * ROW_H + (if (more > 0) 70f else 0f) + FOOT_H + 20f
    val bmp = Bitmap.createBitmap(UW.toInt(), h.toInt(), Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp); c.drawColor(Color.WHITE)
    val p = P(c, 1f)
    var y = top(p, m)
    val rows = m.optJSONArray("rows")
    for (i in 0 until shown) { row(p, rows!!.getJSONObject(i), y); y += ROW_H }
    if (more > 0) { p.text("+ $more more transactions in the full statement", 60f, y + 46f, 26f, MUTED); y += 70f }
    p.text(m.optString("footer", "Generated by GAURAV OS"), 60f, y + 56f, 24f, MUTED)
    FileOutputStream(file).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    bmp.recycle()
    return file.absolutePath
  }

  private fun pdf(file: File, m: JSONObject, n: Int): String {
    val pageW = 595; val pageH = 842
    val s = pageW / UW
    val pageUnits = pageH / s
    val doc = PdfDocument()
    val rows = m.optJSONArray("rows")
    var i = 0
    var page = 1
    do {
      val info = PdfDocument.PageInfo.Builder(pageW, pageH, page).create()
      val pg = doc.startPage(info)
      val c = pg.canvas; c.drawColor(Color.WHITE)
      val p = P(c, s)
      var y: Float
      if (page == 1) y = top(p, m) else { header(p, m, false); y = 96f + 30f }
      val limit = pageUnits - FOOT_H - 10f
      while (i < n && y + ROW_H <= limit) { row(p, rows!!.getJSONObject(i), y); y += ROW_H; i++ }
      p.text("${m.optString("footer", "Generated by GAURAV OS")}  ·  Page $page", 60f, pageUnits - 40f, 22f, MUTED)
      doc.finishPage(pg)
      page++
    } while (i < n)
    FileOutputStream(file).use { doc.writeTo(it) }
    doc.close()
    return file.absolutePath
  }
}
