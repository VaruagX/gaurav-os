package expo.modules.reminder

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Telephony
import androidx.core.content.FileProvider
import java.io.File

/** Own FileProvider subclass so its manifest entry never clashes with other libraries' providers. */
class KhataFileProvider : FileProvider()

/**
 * Opens WhatsApp / the SMS app with an image + caption already attached. It NEVER sends: the target app shows its
 * compose screen and the user presses Send. Returns a short status string ("ok" or a reason).
 */
object KhataShare {
  private fun installed(ctx: Context, pkg: String): Boolean = try { ctx.packageManager.getPackageInfo(pkg, 0); true } catch (e: PackageManager.NameNotFoundException) { false }

  fun shareImage(ctx: Context, path: String, channel: String, phoneDigits: String, text: String): String {
    val file = File(path)
    if (!file.exists()) return "image missing"
    val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.khatafiles", file)
    val i = Intent(Intent.ACTION_SEND).setType("image/png")
      .putExtra(Intent.EXTRA_STREAM, uri).putExtra(Intent.EXTRA_TEXT, text)
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    val pkg: String? = when (channel) {
      "whatsapp" -> listOf("com.whatsapp", "com.whatsapp.w4b").firstOrNull { installed(ctx, it) } ?: return "WhatsApp is not installed on this phone."
      else -> Telephony.Sms.getDefaultSmsPackage(ctx) ?: return "No SMS app found on this phone."
    }
    i.setPackage(pkg)
    if (channel == "whatsapp") { if (phoneDigits.isNotEmpty()) i.putExtra("jid", "$phoneDigits@s.whatsapp.net") }
    else { i.putExtra("address", phoneDigits); i.putExtra("sms_body", text) }
    ctx.grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
    return try { ctx.startActivity(i); "ok" } catch (e: ActivityNotFoundException) { "That app could not open the image." } catch (e: SecurityException) { "That app could not open the image." }
  }
}
