import { isDesktop, isInTauri } from '@/lib/tauriHelper';

export type OllamaStatus = {
  managed_supported: boolean;
  managed_installed: boolean;
  managed_bin_path?: string | null;
  resolved_bin_path?: string | null;
  running: boolean;
  pid?: number | null;
  server_version?: string | null;
  managed_version?: string | null;
  latest_version?: string | null;
  last_error?: string | null;
};

export type OllamaModelInfo = {
  name: string;
  size?: number | null;
  modified_at?: string | null;
};

export type OllamaInstallProgress = {
  stage: string;
  message: string;
  percent?: number | null;
};

export type OllamaPullProgress = {
  model: string;
  status?: string | null;
  completed?: number | null;
  total?: number | null;
  digest?: string | null;
  done: boolean;
  raw: any;
};

export type OllamaLog = {
  stream: 'stdout' | 'stderr';
  line: string;
};

const normalizeEndpoint = (endpoint: string | undefined | null): string => {
  let e = (endpoint || '').trim().replace(/\/+$/, '');
  if (!e) return 'http://127.0.0.1:11434';

  // Users sometimes paste `http:// localhost:11434` (or include invisible chars).
  const schemeIdx = e.indexOf('://');
  if (schemeIdx >= 0) {
    const scheme = e.slice(0, schemeIdx).trim();
    const rest = e.slice(schemeIdx + 3).trim();
    e = `${scheme}://${rest}`;
  }
  e = e.replace(/[\s\u200B\uFEFF\u200E\u200F]+/g, '');
  return e || 'http://127.0.0.1:11434';
};

async function inv<T>(cmd: string, payload?: Record<string, any>): Promise<T> {
  if (!isInTauri() || !isDesktop()) {
    throw new Error('Ollama managed mode is only available in the desktop app.');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd as any, payload);
}

export async function ollamaStatus(endpoint?: string): Promise<OllamaStatus> {
  return inv<OllamaStatus>('ollama_status', { endpoint: normalizeEndpoint(endpoint) });
}

export async function ollamaInstallManaged(): Promise<OllamaStatus> {
  return inv<OllamaStatus>('ollama_install_managed');
}

export async function ollamaUpdateManaged(): Promise<OllamaStatus> {
  return inv<OllamaStatus>('ollama_update_managed');
}

export async function ollamaStart(endpoint?: string): Promise<OllamaStatus> {
  return inv<OllamaStatus>('ollama_start', { endpoint: normalizeEndpoint(endpoint) });
}

export async function ollamaStop(): Promise<OllamaStatus> {
  return inv<OllamaStatus>('ollama_stop');
}

export async function ollamaListModels(endpoint?: string): Promise<OllamaModelInfo[]> {
  return inv<OllamaModelInfo[]>('ollama_list_models', { endpoint: normalizeEndpoint(endpoint) });
}

export async function ollamaPullModel(endpoint: string | undefined, model: string): Promise<boolean> {
  return inv<boolean>('ollama_pull_model', { endpoint: normalizeEndpoint(endpoint), model });
}

export async function ollamaDeleteModel(endpoint: string | undefined, model: string): Promise<boolean> {
  return inv<boolean>('ollama_delete_model', { endpoint: normalizeEndpoint(endpoint), model });
}
