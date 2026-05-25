package com.blinko.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

class VoiceNoteWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        // There may be multiple widgets active, so update all of them
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    companion object {
        fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            // Construct the RemoteViews object
            val views = RemoteViews(context.packageName, R.layout.widget_voice_note)

            // Create intent that will launch the app with voice recording shortcut
            val intent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("blinko://shortcut/voice_recording")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)

                // Set the component to ensure it opens our MainActivity
                setClassName(context.packageName, "${context.packageName}.MainActivity")
            }

            val pendingIntent = PendingIntent.getActivity(
                context,
                appWidgetId, // Use widget ID as request code for uniqueness
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // Set click listener for the entire widget
            views.setOnClickPendingIntent(R.id.widget_voice_icon, pendingIntent)
            views.setOnClickPendingIntent(R.id.widget_logo, pendingIntent)

            // Instruct the widget manager to update the widget
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}