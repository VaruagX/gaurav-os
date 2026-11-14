package expo.modules.reminder

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class ReminderNativeModule : Module() {
  private val ctx: Context get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private val main = Handler(Looper.getMainLooper())
  private var previewVoice: VoiceEngine? = null
  private var recognizer: SpeechRecognizer? = null
  private var pickPromise: Promise? = null

  private fun launch(intent: Intent) {
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    ctx.startActivity(intent)
  }

  private fun openSafely(vararg intents: Intent): Boolean {
    for (i in intents) {
      try { launch(i); return true } catch (e: Exception) { /* try next */ }
    }
    return false
  }

  override fun definition() = ModuleDefinition {
    Name("ReminderNative")

    // ---- Scheduling -------------------------------------------------------------------
    AsyncFunction("scheduleReminder") { json: String ->
      ReminderNotification.ensureChannels(ctx)
      val r = Reminder.fromJson(JSONObject(json))
      ReminderAlarmManager.schedule(ctx, r)?.toDouble()
    }
    AsyncFunction("cancelReminder") { id: Int ->
      ReminderAlarmManager.cancel(ctx, id)
      if (ReminderService.running) ReminderService.halt(ctx, id)
    }
    AsyncFunction("cancelAllReminders") { ReminderAlarmManager.cancelAll(ctx) }
    AsyncFunction("rescheduleAll") { ReminderAlarmManager.rescheduleAll(ctx) }
    AsyncFunction("getScheduledCount") { ReminderStore.all(ctx).count { it.enabled } }
    AsyncFunction("takePendingEvents") { ReminderStore.takeEvents(ctx) }
    AsyncFunction("isReminderActive") { ReminderService.running }
    AsyncFunction("stopActiveReminder") {
      if (ReminderService.running) ReminderService.haltAll(ctx)
      (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancelAll()
    }

    // ---- Permissions / device state ---------------------------------------------------
    AsyncFunction("getStatus") {
      val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
      mapOf(
        "sdk" to Build.VERSION.SDK_INT,
        "manufacturer" to Build.MANUFACTURER,
        "exactAlarms" to ReminderAlarmManager.canScheduleExact(ctx),
        "notifications" to nm.areNotificationsEnabled(),
        "batteryUnrestricted" to pm.isIgnoringBatteryOptimizations(ctx.packageName),
        "fullScreenIntent" to (Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent())
      )
    }
    AsyncFunction("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
        openSafely(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${ctx.packageName}")), appDetails())
      else true
    }
    AsyncFunction("openNotificationSettings") {
      openSafely(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName), appDetails())
    }
    AsyncFunction("openFullScreenIntentSettings") {
      if (Build.VERSION.SDK_INT >= 34)
        openSafely(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${ctx.packageName}")), appDetails())
      else true
    }
    AsyncFunction("openBatterySettings") {
      openSafely(
        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${ctx.packageName}")),
        Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS), appDetails()
      )
    }
    AsyncFunction("openAutostartSettings") {
      // Xiaomi / Redmi / POCO (MIUI & HyperOS) auto-start page; falls back to app details.
      openSafely(
        Intent().setClassName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
        Intent("miui.intent.action.OP_AUTO_START").addCategory(Intent.CATEGORY_DEFAULT),
        appDetails()
      )
    }
    AsyncFunction("openAppDetails") { openSafely(appDetails()) }

    // ---- Voice -----------------------------------------------------------------------
    AsyncFunction("speak") { text: String, lang: String, rate: Double, pitch: Double, promise: Promise ->
      main.post {
        previewVoice?.shutdown()
        val v = VoiceEngine(ctx); previewVoice = v
        v.speak(text, lang, rate.toFloat(), pitch.toFloat(), false) { ok -> promise.resolve(ok) }
      }
    }
    AsyncFunction("stopSpeaking") { previewVoice?.stop() }
    AsyncFunction("getAvailableLanguages") { candidates: List<String>, promise: Promise ->
      val v = VoiceEngine(ctx)
      v.availableLanguages(candidates) { list -> promise.resolve(list); v.shutdown() }
    }

    // Offline-preferring speech recognition (one utterance). Resolves with the best transcript.
    AsyncFunction("recognizeSpeech") { lang: String, preferOffline: Boolean, promise: Promise ->
      main.post {
        if (!SpeechRecognizer.isRecognitionAvailable(ctx)) {
          promise.reject("E_UNAVAILABLE", "No speech recognition service is installed on this device.", null); return@post
        }
        recognizer?.destroy()
        val sr = SpeechRecognizer.createSpeechRecognizer(ctx); recognizer = sr
        var settled = false
        fun done(block: () -> Unit) { if (!settled) { settled = true; block(); sr.destroy(); if (recognizer === sr) recognizer = null } }
        sr.setRecognitionListener(object : RecognitionListener {
          override fun onReadyForSpeech(p: android.os.Bundle?) {}
          override fun onBeginningOfSpeech() {}
          override fun onRmsChanged(v: Float) {}
          override fun onBufferReceived(b: ByteArray?) {}
          override fun onEndOfSpeech() {}
          override fun onPartialResults(p: android.os.Bundle?) {}
          override fun onEvent(t: Int, p: android.os.Bundle?) {}
          override fun onResults(b: android.os.Bundle?) {
            val list = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            done {
              if (list.isNullOrEmpty()) promise.reject("E_NO_MATCH", "Didn't catch that.", null)
              else promise.resolve(list[0])
            }
          }
          override fun onError(error: Int) {
            val msg = when (error) {
              SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Didn't catch that."
              SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission is required."
              SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Offline speech data for this language is not installed."
              SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "This language is not supported offline."
              else -> "Speech recognition error ($error)."
            }
            done { promise.reject("E_RECOGNIZER_$error", msg, null) }
          }
        })
        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
          .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
          .putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
          .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, preferOffline)
          .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
        sr.startListening(i)
      }
    }
    AsyncFunction("cancelRecognition") { main.post { recognizer?.cancel(); recognizer?.destroy(); recognizer = null } }

    // ---- Plain local notification (budget alerts) -----------------------------------------
    AsyncFunction("postNotification") { id: Int, title: String, text: String ->
      val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel("gaurav_budget") == null) {
        nm.createNotificationChannel(android.app.NotificationChannel("gaurav_budget", "Budget alerts", NotificationManager.IMPORTANCE_DEFAULT))
      }
      val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
      val pi = launch?.let { android.app.PendingIntent.getActivity(ctx, id, it, android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT) }
      try {
        nm.notify(id, androidx.core.app.NotificationCompat.Builder(ctx, "gaurav_budget").setSmallIcon(R.drawable.ic_stat_reminder)
          .setContentTitle(title).setContentText(text).setStyle(androidx.core.app.NotificationCompat.BigTextStyle().bigText(text))
          .setAutoCancel(true).setContentIntent(pi).build())
        true
      } catch (e: SecurityException) { false }
    }

    // ---- Khata statements: image / PDF rendering and "share with image" -------------------
    // ---- Smart prompts / widget / quick add -----------------------------------------------------------
    AsyncFunction("setPrompts") { group: String, json: String -> PromptManager.setGroup(ctx, group, json) }
    AsyncFunction("takePromptEvents") { PromptManager.takeEvents(ctx) }
    AsyncFunction("setWidgetData") { json: String -> AgendaWidget.save(ctx, json) }
    AsyncFunction("setQuickAdd") { on: Boolean -> QuickAddNotification.set(ctx, on) }

    AsyncFunction("recognizeText") { uri: String, promise: Promise -> TextOcr.recognize(ctx, uri, promise) }
    AsyncFunction("renderStatement") { json: String, format: String, maxRows: Int -> StatementRenderer.render(ctx, json, format, maxRows) }
    AsyncFunction("shareImageTo") { path: String, channel: String, phoneDigits: String, text: String -> KhataShare.shareImage(ctx, path, channel, phoneDigits, text) }

    // ---- Contact picker (system picker: no READ_CONTACTS permission needed) ------------
    AsyncFunction("pickContact") { promise: Promise ->
      val act = appContext.currentActivity
      if (act == null) { promise.reject("E_NO_ACTIVITY", "The app must be open to pick a contact.", null); return@AsyncFunction }
      pickPromise?.resolve(null)
      pickPromise = promise
      try {
        act.startActivityForResult(Intent(Intent.ACTION_PICK, android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI), 4721)
      } catch (e: Exception) { pickPromise = null; promise.reject("E_NO_PICKER", "No contacts app is available on this phone.", e) }
    }
    OnActivityResult { _, payload ->
      if (payload.requestCode != 4721) return@OnActivityResult
      val p = pickPromise ?: return@OnActivityResult
      pickPromise = null
      val uri = payload.data?.data
      if (payload.resultCode != android.app.Activity.RESULT_OK || uri == null) { p.resolve(null); return@OnActivityResult }
      try {
        val cols = arrayOf(android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER, android.provider.ContactsContract.CommonDataKinds.Phone.CONTACT_ID)
        ctx.contentResolver.query(uri, cols, null, null, null)?.use { c ->
          if (c.moveToFirst()) p.resolve(mapOf("name" to (c.getString(0) ?: ""), "phone" to (c.getString(1) ?: ""), "contactId" to (c.getString(2) ?: ""))) else p.resolve(null)
        } ?: p.resolve(null)
      } catch (e: Exception) { p.reject("E_PICK", "Could not read the chosen contact.", e) }
    }

    // ---- AI Caller Assistant ---------------------------------------------------------
    AsyncFunction("setCallAssistantConfig") { json: String -> CallAssistantStore.saveConfig(ctx, json) }
    AsyncFunction("takeCallEvents") { CallAssistantStore.takeEvents(ctx) }
    AsyncFunction("getCallAssistantStatus") {
      fun granted(p: String) = androidx.core.content.ContextCompat.checkSelfPermission(ctx, p) == android.content.pm.PackageManager.PERMISSION_GRANTED
      val rm = if (Build.VERSION.SDK_INT >= 29) ctx.getSystemService(Context.ROLE_SERVICE) as android.app.role.RoleManager else null
      mapOf(
        "phoneState" to granted(android.Manifest.permission.READ_PHONE_STATE),
        "contacts" to granted(android.Manifest.permission.READ_CONTACTS),
        "answerCalls" to granted(android.Manifest.permission.ANSWER_PHONE_CALLS),
        "microphone" to granted(android.Manifest.permission.RECORD_AUDIO),
        "roleAvailable" to (rm?.isRoleAvailable(android.app.role.RoleManager.ROLE_CALL_SCREENING) ?: false),
        "roleHeld" to (rm?.isRoleHeld(android.app.role.RoleManager.ROLE_CALL_SCREENING) ?: false),
        "recognizer" to SpeechRecognizer.isRecognitionAvailable(ctx),
        "readyRunning" to CallReadyService.running,
        "speakerHelper" to CallSpeakerService.isEnabled(ctx),
        "keywordReady" to KeywordModel.ready
      )
    }
    AsyncFunction("requestCallScreeningRole") {
      if (Build.VERSION.SDK_INT < 29) return@AsyncFunction false
      val rm = ctx.getSystemService(Context.ROLE_SERVICE) as android.app.role.RoleManager
      val act = appContext.currentActivity ?: return@AsyncFunction false
      if (!rm.isRoleAvailable(android.app.role.RoleManager.ROLE_CALL_SCREENING)) return@AsyncFunction false
      act.startActivityForResult(rm.createRequestRoleIntent(android.app.role.RoleManager.ROLE_CALL_SCREENING), 4711)
      true
    }
    AsyncFunction("openAccessibilitySettings") { openSafely(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS), appDetails()) }
    AsyncFunction("startCallReady") { CallReadyService.start(ctx) }
    AsyncFunction("stopCallReady") { CallReadyService.stop(ctx) }
    AsyncFunction("simulateCall") { name: String -> CallAssistantService.start(ctx, null, true, name) }
    AsyncFunction("isCallAssistantActive") { CallAssistantService.active }

    // ---- Encrypted document vault ------------------------------------------------------
    AsyncFunction("vaultEncrypt") { srcPath: String -> VaultCrypto.encrypt(ctx, srcPath) }
    AsyncFunction("vaultDecrypt") { stored: String, displayName: String -> VaultCrypto.decrypt(ctx, stored, displayName) }
    AsyncFunction("vaultDelete") { stored: String -> VaultCrypto.delete(ctx, stored) }
    AsyncFunction("vaultClearTemp") { VaultCrypto.clearTemp(ctx) }

    OnDestroy { previewVoice?.shutdown(); recognizer?.destroy() }
  }

  private fun appDetails() = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}"))
}
