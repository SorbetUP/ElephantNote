package com.plugin.blinko

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.view.View
import android.view.WindowInsetsController
import android.content.Context
import androidx.core.content.FileProvider
import java.io.File

class Blinko {
    fun setcolor(hex: String, activity: Activity) {
        val color = Color.parseColor(hex)
        val isLightColor = isColorLight(color)

        // Use CSS background colors for consistency
        val finalColor = if (!isLightColor) {
            Color.parseColor("#0B0B0C") // Dark theme background color
        } else {
            Color.WHITE // Light theme background color (hsl(0 0% 100%))
        }

        activity.window.statusBarColor = finalColor
        activity.window.navigationBarColor = finalColor

        // Save theme preference with original hex but apply pure black
        saveThemePreference(activity, !isLightColor, hex)

        // For dark mode with pure black, always use dark appearance (light text/icons)
        // For light mode, use the original color-based logic
        val isDarkMode = !isLightColor
        val useLightAppearance = !isDarkMode && isColorLight(finalColor)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val statusAppearance = if (useLightAppearance) {
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
            } else {
                0
            }

            val navAppearance = if (useLightAppearance) {
                WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            } else {
                0
            }

            activity.window.insetsController?.setSystemBarsAppearance(
                statusAppearance,
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
            )

            activity.window.insetsController?.setSystemBarsAppearance(
                navAppearance,
                WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            )

        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            var flags = 0

            if (useLightAppearance) {
                flags = flags or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && useLightAppearance) {
                flags = flags or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            }

            @Suppress("DEPRECATION")
            activity.window.decorView.systemUiVisibility = flags
        }
    }

    private fun isColorLight(color: Int): Boolean {
        val red = Color.red(color)
        val green = Color.green(color)
        val blue = Color.blue(color)
        val brightness = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
        return brightness > 0.5
    }

    private fun saveThemePreference(activity: Activity, isDarkMode: Boolean, hexColor: String) {
        try {
            val sharedPref = activity.getSharedPreferences("blinko_theme", Context.MODE_PRIVATE)
            with(sharedPref.edit()) {
                putBoolean("dark_mode", isDarkMode)
                putString("last_color", hexColor)
                apply()
            }
            Log.i("Blinko", "Theme preference saved: isDark=$isDarkMode, color=$hexColor")
        } catch (e: Exception) {
            Log.e("Blinko", "Error saving theme preference: ${e.message}")
        }
    }

    fun getSavedTheme(activity: Activity): Map<String, Any> {
        return try {
            val sharedPref = activity.getSharedPreferences("blinko_theme", Context.MODE_PRIVATE)
            val isDarkMode = sharedPref.getBoolean("dark_mode", false)
            val lastColor = sharedPref.getString("last_color", "#FFFFFF") ?: "#FFFFFF"

            mapOf(
                "isDarkMode" to isDarkMode,
                "lastColor" to lastColor
            )
        } catch (e: Exception) {
            Log.e("Blinko", "Error getting saved theme: ${e.message}")
            mapOf(
                "isDarkMode" to false,
                "lastColor" to "#FFFFFF"
            )
        }
    }

    fun applyStartupTheme(activity: Activity) {
        try {
            val savedTheme = getSavedTheme(activity)
            val lastColor = savedTheme["lastColor"] as String
            setcolor(lastColor, activity)
            Log.i("Blinko", "Startup theme applied: $lastColor")
        } catch (e: Exception) {
            Log.e("Blinko", "Error applying startup theme: ${e.message}")
        }
    }

    fun openAppSettings(activity: Activity) {
        try {
            // Try to open app-specific settings
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            val uri = Uri.fromParts("package", activity.packageName, null)
            intent.data = uri
            activity.startActivity(intent)
        } catch (e: Exception) {
            // Fallback to general settings if specific app settings fail
            try {
                val intent = Intent(Settings.ACTION_SETTINGS)
                activity.startActivity(intent)
            } catch (fallbackException: Exception) {
                Log.e("Blinko", "Failed to open settings: ${fallbackException.message}")
            }
        }
    }

    fun presentShareSheet(path: String, mime: String?, filename: String?, activity: Activity) {
        try {
            val file = File(path)
            if (!file.exists() || !file.isFile) {
                Log.w("Blinko", "presentShareSheet: file not found: $path")
                return
            }

            val uri = FileProvider.getUriForFile(
                activity,
                "${activity.packageName}.fileprovider",
                file
            )

            val intent = Intent(Intent.ACTION_SEND).apply {
                type = mime ?: "*/*"
                putExtra(Intent.EXTRA_STREAM, uri)
                if (!filename.isNullOrEmpty()) {
                    putExtra(Intent.EXTRA_SUBJECT, filename)
                }
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            activity.startActivity(Intent.createChooser(intent, filename ?: "Share"))
        } catch (e: Exception) {
            Log.e("Blinko", "presentShareSheet failed: ${e.message}")
        }
    }
}
