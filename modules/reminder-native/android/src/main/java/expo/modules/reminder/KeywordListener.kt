package expo.modules.reminder

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import java.io.File
import java.io.FileOutputStream

/** Loads the bundled offline model once (in the background) and keeps it in memory. */
object KeywordModel {
  private const val TAG = "GauravCall"
  private const val ASSET = "vosk-model-en-in"
  @Volatile var model: Model? = null
  @Volatile private var loading = false
  val ready: Boolean get() = model != null

  fun ensure(ctx: Context) {
    if (model != null || loading) return
    loading = true
    Thread {
      try {
        val app = ctx.applicationContext
        val dir = File(app.filesDir, ASSET)
        val marker = File(dir, ".done")
        if (!marker.exists()) {
          dir.deleteRecursively()
          copyAsset(app, ASSET, dir)
          marker.writeText("1")
        }
        val t = System.currentTimeMillis()
        model = Model(dir.absolutePath)
        Log.i(TAG, "keyword model loaded in ${System.currentTimeMillis() - t}ms")
      } catch (e: Throwable) {
        Log.w(TAG, "keyword model failed: ${e.javaClass.simpleName} ${e.message}")
      } finally { loading = false }
    }.start()
  }

  private fun copyAsset(ctx: Context, path: String, out: File) {
    val list = ctx.assets.list(path)
    if (list.isNullOrEmpty()) {
      out.parentFile?.mkdirs()
      ctx.assets.open(path).use { i -> FileOutputStream(out).use { o -> i.copyTo(o) } }
    } else {
      out.mkdirs()
      list.forEach { copyAsset(ctx, "$path/$it", File(out, it)) }
    }
  }
}

/**
 * "Hey Siri"-style small-vocabulary listener: streams the microphone continuously through an offline recogniser that
 * only knows yes/no style words, after automatic gain, so quiet or distant speech is still picked up.
 * Audio is dropped (not recognised) while [muted] so the assistant never hears its own announcement.
 */
class KeywordListener(private val ctx: Context, private val onText: (String) -> Unit) {
  companion object {
    private const val TAG = "GauravCall"
    private const val RATE = 16000
    val GRAMMAR = """["yes","yeah","yep","yup","ok","okay","sure","answer","pick up","no","nope","nah","reject","decline","cut","[unk]"]"""
  }

  @Volatile var muted = false
  @Volatile private var running = false
  private var thread: Thread? = null
  private val main = Handler(Looper.getMainLooper())

  fun start(): Boolean {
    val m = KeywordModel.model ?: return false
    if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return false
    val minBuf = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    if (minBuf <= 0) return false
    val rec = try {
      AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minBuf, RATE))
    } catch (e: Exception) { return false }
    if (rec.state != AudioRecord.STATE_INITIALIZED) { rec.release(); return false }
    running = true
    thread = Thread {
      val recognizer = Recognizer(m, RATE.toFloat(), GRAMMAR)
      val buf = ShortArray(RATE / 8) // 125 ms
      var env = 0f
      var lastPartial = ""
      var wasMuted = true
      try {
        rec.startRecording()
        if (rec.recordingState != AudioRecord.RECORDSTATE_RECORDING) { Log.w(TAG, "AudioRecord did not start (mic blocked?)"); return@Thread }
        Log.i(TAG, "keyword listening started")
        while (running) {
          val n = rec.read(buf, 0, buf.size)
          if (n <= 0) { if (n < 0) break else continue }
          if (muted) { wasMuted = true; continue }
          if (wasMuted) { recognizer.reset(); env = 0f; lastPartial = ""; wasMuted = false }
          env = Agc.envelope(env, Agc.peak(buf, n))
          Agc.apply(buf, n, Agc.gain(env))
          val text = if (recognizer.acceptWaveForm(buf, n)) JSONObject(recognizer.result).optString("text") else JSONObject(recognizer.partialResult).optString("partial")
          if (text.isNotBlank() && text != lastPartial) { lastPartial = text; Log.i(TAG, "keyword heard: $text"); main.post { onText(text) } }
        }
      } catch (e: Throwable) { Log.w(TAG, "keyword loop ended: ${e.javaClass.simpleName}") }
      finally {
        try { rec.stop() } catch (e: Exception) {}
        rec.release(); recognizer.close()
      }
    }.also { it.name = "gauravos-keyword"; it.start() }
    return true
  }

  fun stop() { running = false }
}
