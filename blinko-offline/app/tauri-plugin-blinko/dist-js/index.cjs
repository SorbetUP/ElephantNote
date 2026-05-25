'use strict';

var core = require('@tauri-apps/api/core');

async function setStatusBarColor(hexColor) {
    await core.invoke('plugin:blinko|setcolor', {
        payload: {
            hex: hexColor,
        },
    });
    return null;
}
async function openAppSettings() {
    await core.invoke('plugin:blinko|open_app_settings');
}

async function presentShareSheet(payload) {
    await core.invoke('plugin:blinko|present_share_sheet', { payload });
}
async function getPendingSharePayload() {
    const res = await core.invoke('plugin:blinko|get_pending_share_payload');
    return (res === null || res === void 0 ? void 0 : res.payload) ?? null;
}
async function clearPendingSharePayload() {
    await core.invoke('plugin:blinko|clear_pending_share_payload');
}

exports.clearPendingSharePayload = clearPendingSharePayload;
exports.getPendingSharePayload = getPendingSharePayload;
exports.openAppSettings = openAppSettings;
exports.presentShareSheet = presentShareSheet;
exports.setStatusBarColor = setStatusBarColor;
