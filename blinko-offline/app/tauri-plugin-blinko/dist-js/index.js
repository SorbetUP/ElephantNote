import { invoke } from '@tauri-apps/api/core';

async function setStatusBarColor(hexColor) {
    await invoke('plugin:blinko|setcolor', {
        payload: {
            hex: hexColor,
        },
    });
    return null;
}
async function openAppSettings() {
    await invoke('plugin:blinko|open_app_settings');
}

async function presentShareSheet(payload) {
    await invoke('plugin:blinko|present_share_sheet', { payload });
}
async function getPendingSharePayload() {
    const res = await invoke('plugin:blinko|get_pending_share_payload');
    return (res === null || res === void 0 ? void 0 : res.payload) ?? null;
}
async function clearPendingSharePayload() {
    await invoke('plugin:blinko|clear_pending_share_payload');
}

export { clearPendingSharePayload, getPendingSharePayload, openAppSettings, presentShareSheet, setStatusBarColor };
