import { invoke } from '@tauri-apps/api/core'

export async function setStatusBarColor(hexColor: string): Promise<null> {
  await invoke<{value?: string}>('plugin:blinko|setcolor', {
    payload: {
      hex: hexColor,
    },
  })
  return null
}

export async function openAppSettings(): Promise<void> {
  await invoke('plugin:blinko|open_app_settings')
}

export type PresentShareSheetRequest = {
  path: string
  mime?: string | null
  filename?: string | null
}

export async function presentShareSheet(payload: PresentShareSheetRequest): Promise<void> {
  await invoke('plugin:blinko|present_share_sheet', { payload })
}

export async function getPendingSharePayload(): Promise<string | null> {
  const res = await invoke<{ payload?: string | null }>('plugin:blinko|get_pending_share_payload')
  return res?.payload ?? null
}

export async function clearPendingSharePayload(): Promise<void> {
  await invoke('plugin:blinko|clear_pending_share_payload')
}
