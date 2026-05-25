package com.plugin.blinko

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke

@InvokeArg
class SetColorArgs {
  lateinit var hex: String
}

@InvokeArg
class PresentShareSheetArgs {
  lateinit var path: String
  var mime: String? = null
  var filename: String? = null
}


@TauriPlugin
class BlinkoPlugin(private val activity: Activity): Plugin(activity) {
    private val implementation = Blinko()

    @Command
    fun setcolor(invoke: Invoke) {
        val args = invoke.parseArgs(SetColorArgs::class.java)
        implementation.setcolor(args.hex, activity)
        invoke.resolve()
    }

    @Command
    fun openAppSettings(invoke: Invoke) {
        implementation.openAppSettings(activity)
        invoke.resolve()
    }

    @Command
    fun presentShareSheet(invoke: Invoke) {
        val args = invoke.parseArgs(PresentShareSheetArgs::class.java)
        implementation.presentShareSheet(args.path, args.mime, args.filename, activity)
        invoke.resolve()
    }

    @Command
    fun getPendingSharePayload(invoke: Invoke) {
        val obj = JSObject()
        obj.put("payload", null)
        invoke.resolve(obj)
    }

    @Command
    fun clearPendingSharePayload(invoke: Invoke) {
        invoke.resolve()
    }
}
