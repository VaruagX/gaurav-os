package expo.modules.reminder

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.CipherInputStream
import javax.crypto.CipherOutputStream
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** AES-256-GCM file vault. Key lives in the Android Keystore; files live in app-private storage. */
object VaultCrypto {
  private const val ALIAS = "gaurav_os_vault_key"
  private const val IV_LEN = 12

  private fun key(): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    gen.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256).build()
    )
    return gen.generateKey()
  }

  private fun vaultDir(ctx: Context) = File(ctx.filesDir, "vault").apply { mkdirs() }

  /** Encrypts [srcPath] into the vault; returns the stored file name. */
  fun encrypt(ctx: Context, srcPath: String): String {
    val src = File(srcPath.removePrefix("file://"))
    require(src.exists()) { "Source file not found" }
    val name = UUID.randomUUID().toString() + ".enc"
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key())
    FileOutputStream(File(vaultDir(ctx), name)).use { out ->
      out.write(cipher.iv)
      CipherOutputStream(out, cipher).use { co -> FileInputStream(src).use { it.copyTo(co) } }
    }
    return name
  }

  /** Decrypts into the cache dir (temporary) and returns the plain file path. */
  fun decrypt(ctx: Context, stored: String, displayName: String): String {
    require(!stored.contains("/") && !stored.contains("..")) { "Invalid name" }
    val enc = File(vaultDir(ctx), stored)
    require(enc.exists()) { "Vault file missing" }
    val tmpDir = File(ctx.cacheDir, "vault_tmp").apply { mkdirs() }
    val safe = displayName.replace(Regex("[^A-Za-z0-9._ -]"), "_").ifBlank { "document" }
    val out = File(tmpDir, safe)
    FileInputStream(enc).use { fin ->
      val iv = ByteArray(IV_LEN)
      require(fin.read(iv) == IV_LEN) { "Corrupt vault file" }
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
      CipherInputStream(fin, cipher).use { ci -> FileOutputStream(out).use { ci.copyTo(it) } }
    }
    return out.absolutePath
  }

  fun delete(ctx: Context, stored: String): Boolean {
    require(!stored.contains("/") && !stored.contains("..")) { "Invalid name" }
    return File(vaultDir(ctx), stored).delete()
  }

  fun clearTemp(ctx: Context) { File(ctx.cacheDir, "vault_tmp").deleteRecursively() }
}
