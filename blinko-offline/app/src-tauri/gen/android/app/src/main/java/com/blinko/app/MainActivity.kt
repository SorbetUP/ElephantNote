package com.blinko.app

import android.content.Intent
import android.os.Bundle
import android.os.Build
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Log
import android.view.View
import android.view.ViewGroup
import org.json.JSONObject
import com.plugin.blinko.Blinko
import java.io.File
import java.io.FileOutputStream

class MainActivity : TauriActivity() {
    private var hasInjectedShortcut = false
    private var hasInjectedShare = false
    private val blinko = Blinko()

    override fun onCreate(savedInstanceState: Bundle?) {
        // Apply saved theme before super.onCreate to prevent flash
        blinko.applyStartupTheme(this)
        super.onCreate(savedInstanceState)
        enableWebViewBounceEffect()
        handleShortcutIntent()
        handleShareIntent()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        // Reset flags for new intent
        hasInjectedShortcut = false
        hasInjectedShare = false
        handleShortcutIntent()
        handleShareIntent()
    }

    private fun enableWebViewBounceEffect() {
        // Use a small delay to ensure WebView is initialized
        window.decorView.postDelayed({
            try {
                findWebView(window.decorView)?.let { webView ->
                    // Enable bounce/overscroll effect
                    webView.overScrollMode = View.OVER_SCROLL_ALWAYS
                    Log.i("BlinkoApp", "WebView bounce effect enabled")
                }
            } catch (e: Exception) {
                Log.e("BlinkoApp", "Failed to enable WebView bounce effect: ${e.message}")
            }
        }, 500L) // Short delay to ensure WebView is ready
    }

    private fun handleShortcutIntent() {
        if (hasInjectedShortcut) return

        intent?.data?.let { uri ->
            if (uri.scheme == "blinko" && uri.host == "shortcut") {
                uri.pathSegments?.firstOrNull()?.let { action ->
                    hasInjectedShortcut = true
                    // Single injection with reasonable delay for WebView to be ready
                    window.decorView.postDelayed({
                        if (BuildConfig.DEBUG) {
                            when (action) {
                                "set_endpoint" -> {
                                    val endpoint = uri.getQueryParameter("value")?.trim().orEmpty()
                                    if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
                                        injectEndpoint(endpoint)
                                    } else {
                                        Log.w("BlinkoApp", "Ignoring set_endpoint without http(s) value")
                                    }
                                }
                                "open_signin" -> {
                                    injectNavigate("/signin")
                                }
                                "open_settings" -> {
                                    injectNavigate("/settings")
                                }
                                "set_token" -> {
                                    val token = uri.getQueryParameter("token")?.trim().orEmpty()
                                    if (token.isNotEmpty()) {
                                        val id = uri.getQueryParameter("id")?.trim().orEmpty().ifEmpty { "1" }
                                        val name = uri.getQueryParameter("name")?.trim().orEmpty().ifEmpty { "user" }
                                        val role = uri.getQueryParameter("role")?.trim().orEmpty().ifEmpty { "user" }
                                        val nickname = uri.getQueryParameter("nickname")?.trim().orEmpty().ifEmpty { name }
                                        injectToken(token, id, name, nickname, role)
                                    } else {
                                        Log.w("BlinkoApp", "Ignoring set_token without token")
                                    }
                                }
                                else -> injectShortcutAction(action)
                            }
                        } else {
                            injectShortcutAction(action)
                        }
                    }, 1500L)
                }
            }
        }
    }
    
    private fun injectShortcutAction(action: String) {
        try {
            findWebView(window.decorView)?.evaluateJavascript(
                """
                (function() {
                    var key = 'android_shortcut_action';
                    var existing = window.localStorage.getItem(key);
                    if (!existing || existing === 'null' || existing === '') {
                        window.localStorage.setItem(key, '$action');
                        console.log('Injected shortcut action: $action');
                    } else {
                        console.log('Shortcut action already exists: ' + existing);
                    }
                })();
                """.trimIndent(), null
            )
        } catch (e: Exception) {
            // Silently ignore
        }
    }

    private fun injectEndpoint(endpoint: String) {
        try {
            val quoted = JSONObject.quote(endpoint)
            findWebView(window.decorView)?.evaluateJavascript(
                """
                (function() {
                    try {
                        window.localStorage.setItem('blinkoEndpoint', $quoted);
                        // Endpoint swap should drop auth state to avoid using a token from a different server.
                        window.localStorage.removeItem('blinkoToken');
                        console.log('Injected endpoint: ' + $quoted);
                        window.location.reload();
                    } catch (e) {
                        console.log('Failed to inject endpoint: ' + (e && e.message ? e.message : e));
                    }
                })();
                """.trimIndent(),
                null
            )
            Log.i("BlinkoApp", "Injected endpoint into localStorage: $endpoint")
        } catch (e: Exception) {
            Log.w("BlinkoApp", "Failed to inject endpoint: ${e.message}")
        }
    }

    private fun injectNavigate(path: String) {
        try {
            val quoted = JSONObject.quote(path)
            findWebView(window.decorView)?.evaluateJavascript(
                """
                (function() {
                    try {
                        var to = $quoted;
                        if (!to || typeof to !== 'string') return;
                        history.pushState({}, '', to);
                        window.dispatchEvent(new PopStateEvent('popstate'));
                        console.log('Injected navigate: ' + to);
                    } catch (e) {
                        console.log('Failed to inject navigate: ' + (e && e.message ? e.message : e));
                    }
                })();
                """.trimIndent(),
                null
            )
            Log.i("BlinkoApp", "Injected navigate to: $path")
        } catch (e: Exception) {
            Log.w("BlinkoApp", "Failed to inject navigate: ${e.message}")
        }
    }

    private fun injectToken(token: String, userId: String, name: String, nickname: String, role: String) {
        try {
            val tokenQuoted = JSONObject.quote(token)
            val idQuoted = JSONObject.quote(userId)
            val nameQuoted = JSONObject.quote(name)
            val nicknameQuoted = JSONObject.quote(nickname)
            val roleQuoted = JSONObject.quote(role)

            findWebView(window.decorView)?.evaluateJavascript(
                """
                (function() {
                    try {
                        var tokenData = {
                            user: {
                                id: $idQuoted,
                                name: $nameQuoted,
                                nickname: $nicknameQuoted,
                                role: $roleQuoted
                            },
                            token: $tokenQuoted,
                            expires: new Date(Date.now() + 24*60*60*1000).toISOString()
                        };
                        window.localStorage.setItem('blinkoToken', JSON.stringify(tokenData));
                        console.log('Injected token for user: ' + tokenData.user.id);
                        window.location.reload();
                    } catch (e) {
                        console.log('Failed to inject token: ' + (e && e.message ? e.message : e));
                    }
                })();
                """.trimIndent(),
                null
            )
            Log.i("BlinkoApp", "Injected token into localStorage for userId=$userId role=$role")
        } catch (e: Exception) {
            Log.w("BlinkoApp", "Failed to inject token: ${e.message}")
        }
    }
    
    private fun findWebView(view: View): android.webkit.WebView? {
        if (view is android.webkit.WebView) return view
        if (view is android.view.ViewGroup) {
            for (i in 0 until view.childCount) {
                findWebView(view.getChildAt(i))?.let { return it }
            }
        }
        return null
    }

    private fun handleShareIntent() {
        if (hasInjectedShare) return

        val currentIntent = intent ?: return
        val action = currentIntent.action ?: return
        if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return

        hasInjectedShare = true

        // Copy any shared file into app storage before injecting to JS. Otherwise, the WebView/FS
        // plugin can't reliably read a content:// URI.
        Thread {
            val payload = intentToJson(currentIntent)

            val streamUri: Uri? = when (action) {
                Intent.ACTION_SEND -> getSharedUriSingle(currentIntent)
                Intent.ACTION_SEND_MULTIPLE -> getSharedUriMultipleFirst(currentIntent)
                else -> null
            } ?: getClipDataFirstUri(currentIntent)

            if (streamUri != null) {
                try {
                    val name = runCatching { getNameFromUri(streamUri) }.getOrNull()
                    val mime = contentResolver.getType(streamUri) ?: currentIntent.type
                    val localPath = copySharedUriToAppData(streamUri, name)
                    if (localPath != null) {
                        payload.put("stream", localPath)
                        if (!name.isNullOrEmpty()) payload.put("name", name)
                        if (!mime.isNullOrEmpty()) payload.put("content_type", mime)
                        Log.i("BlinkoApp", "Share file copied to: $localPath (${mime ?: "unknown"})")
                    } else {
                        Log.w("BlinkoApp", "Share file copy failed; falling back to text-only/editor open")
                    }
                } catch (e: Exception) {
                    Log.w("BlinkoApp", "Share file handling failed: ${e.message}")
                }
            }

            val payloadStr = payload.toString()
            Log.i("BlinkoApp", "Injecting share payload: $payloadStr")

            runOnUiThread {
                // Single injection with reasonable delay for WebView to be ready
                window.decorView.postDelayed({
                    injectShareData(payloadStr)
                }, 1500L)
            }
        }.start()
    }

    private fun getSharedUriSingle(intent: Intent): Uri? {
        return if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
        }
    }

    private fun getSharedUriMultipleFirst(intent: Intent): Uri? {
        val list: ArrayList<Uri>? = if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
        }
        return list?.firstOrNull()
    }

    private fun getClipDataFirstUri(intent: Intent): Uri? {
        val clipData = intent.clipData ?: return null
        if (clipData.itemCount <= 0) return null
        return clipData.getItemAt(0).uri
    }

    private fun intentToJson(intent: Intent): JSONObject {
        val json = JSONObject()
        Log.i("processing", intent.toUri(0))
        json.put("uri", intent.toUri(0))
        json.put("content_type", intent.type)

        // Get text content
        intent.getStringExtra(Intent.EXTRA_TEXT)?.let { text ->
            // Remove surrounding quotes if present
            val cleanedText = text.trim().let { trimmed ->
                when {
                    trimmed.startsWith("\"") && trimmed.endsWith("\"") -> trimmed.substring(1, trimmed.length - 1)
                    trimmed.startsWith("'") && trimmed.endsWith("'") -> trimmed.substring(1, trimmed.length - 1)
                    trimmed.startsWith("`") && trimmed.endsWith("`") -> trimmed.substring(1, trimmed.length - 1)
                    else -> trimmed
                }
            }
            json.put("text", cleanedText)
        }

        // Get subject
        intent.getStringExtra(Intent.EXTRA_SUBJECT)?.let {
            json.put("subject", it)
        }

        // stream will be resolved (copied to app storage) in handleShareIntent().
        return json
    }

    private fun copySharedUriToAppData(uri: Uri, displayName: String?): String? {
        val safeName = sanitizeFilename(displayName ?: "shared_file")
        val dir = File(filesDir, "share_inbox")
        if (!dir.exists()) dir.mkdirs()
        val target = File(dir, "${System.currentTimeMillis()}_$safeName")

        contentResolver.openInputStream(uri)?.use { input ->
            FileOutputStream(target).use { output ->
                input.copyTo(output)
            }
        } ?: return null

        return target.absolutePath
    }

    private fun sanitizeFilename(input: String): String {
        val trimmed = input.trim().ifEmpty { "shared_file" }
        // Avoid characters that break JS string injection and file systems.
        return trimmed.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001F]"), "_").take(180)
    }

    private fun getNameFromUri(uri: Uri): String? {
        var displayName: String? = null
        val projection = arrayOf(OpenableColumns.DISPLAY_NAME)
        contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val columnIdx = cursor.getColumnIndex(projection[0])
                if (columnIdx >= 0) displayName = cursor.getString(columnIdx)
            }
        }
        if (displayName.isNullOrEmpty()) {
            displayName = uri.lastPathSegment
        }
        return displayName
    }

    private fun injectShareData(shareData: String) {
        try {
            val escapedData = shareData.replace("\\", "\\\\").replace("\"", "\\\"").replace("'", "\\'")
            findWebView(window.decorView)?.evaluateJavascript(
                """
                (function() {
                    var key = 'android_share_data';
                    var existing = window.localStorage.getItem(key);
                    if (!existing || existing === 'null' || existing === '') {
                        window.localStorage.setItem(key, '$escapedData');
                        console.log('Injected share data');
                    } else {
                        console.log('Share data already exists');
                    }
                })();
                """.trimIndent(), null
            )
        } catch (e: Exception) {
            // Silently ignore
        }
    }


}
