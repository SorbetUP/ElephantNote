// Centralized lazy import for Tauri event APIs.
// This keeps desktop-only code paths from eagerly loading Tauri modules.

export async function getTauriListen() {
  const mod = await import('@tauri-apps/api/event');
  return mod.listen;
}

