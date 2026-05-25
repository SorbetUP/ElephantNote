import { isInTauri } from '@/lib/tauriHelper';

export type CliBinaryInfo = {
  found: boolean;
  path?: string | null;
  version?: string | null;
  error?: string | null;
};

export type AiCliDetectResult = {
  codex: CliBinaryInfo;
  claude: CliBinaryInfo;
};

async function inv<T>(cmd: string, payload?: Record<string, any>): Promise<T> {
  if (!isInTauri()) {
    throw new Error('CLI auto-detection is only available in the desktop app.');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd as any, payload);
}

export async function detectAiCliBinaries(): Promise<AiCliDetectResult> {
  return inv<AiCliDetectResult>('detect_ai_cli_binaries');
}

