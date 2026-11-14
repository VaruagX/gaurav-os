package expo.modules.reminder

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import org.json.JSONArray
import org.json.JSONObject
import kotlin.concurrent.thread

/** Offline text recognition (bundled ML Kit Latin model). Resolves a JSON array of {text,left,top,right,bottom} per line. */
object TextOcr {
  private const val TAG = "TextOcr"
  private const val MAX_SIDE = 3000

  private fun load(ctx: Context, uriStr: String): Bitmap {
    val uri = Uri.parse(uriStr)
    val resolver = ctx.contentResolver
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    (resolver.openInputStream(uri) ?: throw IllegalStateException("Cannot open the selected image.")).use { BitmapFactory.decodeStream(it, null, bounds) }
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / sample > MAX_SIDE) sample *= 2
    val opts = BitmapFactory.Options().apply { inSampleSize = sample }
    var bmp = (resolver.openInputStream(uri) ?: throw IllegalStateException("Cannot open the selected image."))
      .use { BitmapFactory.decodeStream(it, null, opts) } ?: throw IllegalStateException("The selected file is not a readable image.")
    val orientation = try {
      resolver.openInputStream(uri)?.use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) } ?: ExifInterface.ORIENTATION_NORMAL
    } catch (e: Exception) { ExifInterface.ORIENTATION_NORMAL }
    val deg = when (orientation) { ExifInterface.ORIENTATION_ROTATE_90 -> 90f; ExifInterface.ORIENTATION_ROTATE_180 -> 180f; ExifInterface.ORIENTATION_ROTATE_270 -> 270f; else -> 0f }
    if (deg != 0f) bmp = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, Matrix().apply { postRotate(deg) }, true)
    return bmp
  }

  fun recognize(ctx: Context, uri: String, promise: Promise) {
    thread(name = "text-ocr") {
      try {
        val bmp = load(ctx, uri)
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        recognizer.process(InputImage.fromBitmap(bmp, 0))
          .addOnSuccessListener { result ->
            val out = JSONArray()
            for (block in result.textBlocks) for (line in block.lines) {
              val b = line.boundingBox ?: continue
              out.put(JSONObject().put("text", line.text).put("left", b.left).put("top", b.top).put("right", b.right).put("bottom", b.bottom))
            }
            recognizer.close()
            promise.resolve(out.toString())
          }
          .addOnFailureListener { e ->
            Log.e(TAG, "recognition failed", e); recognizer.close()
            promise.reject("E_OCR", "Text recognition failed: ${e.javaClass.simpleName}: ${e.message}", e)
          }
      } catch (t: Throwable) {
        Log.e(TAG, "ocr error", t)
        promise.reject("E_OCR", "${t.javaClass.simpleName}: ${t.message}", t)
      }
    }
  }
}
