
let cachedEndpoint: string | null = null;
let localHttpUnavailable = false;

export function isLocalEndpoint(endpoint: string): boolean {
    return endpoint.startsWith('http://127.0.0.1') || endpoint.startsWith('http://localhost');
}

function isHttpUrl(value: string): boolean {
    return value.startsWith('http://') || value.startsWith('https://');
}

function safeToUrl(path: string, base: string): string | null {
    try {
        return new URL(path, base).toString();
    } catch {
        return null;
    }
}

function normalizeStoredEndpoint(raw: string | null): string {
    if (!raw) return '';
    let value = raw.replace(/\"/g, '').trim();
    if (!value) return '';

    if (!value.startsWith('http://') && !value.startsWith('https://')) {
        if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(value)) {
            value = `http://${value.replace(/^\/+/, '')}`;
        } else {
            return '';
        }
    }

    try {
        return new URL(value).origin;
    } catch {
        return '';
    }
}

export function getBlinkoEndpoint(path: string = ''): string {
    const safePath = typeof path === 'string' ? path : '';
    const isTauri = !!(window as any).__TAURI__;
    const stored = normalizeStoredEndpoint(window.localStorage.getItem('blinkoEndpoint'));
    let base = '';
    if (isTauri) {
        if (cachedEndpoint) {
            base = cachedEndpoint;
        } else if (stored && isHttpUrl(stored) && !isLocalEndpoint(stored)) {
            base = stored;
        } else {
            base = '';
        }
    } else {
        base = cachedEndpoint || stored || window.location.origin;
    }

    if (isTauri && base && !isHttpUrl(base)) {
        base = '';
    }
    if (isTauri && !base) {
        return safePath;
    }
    if (isHttpUrl(safePath)) {
        return safePath;
    }

    const primary = base ? safeToUrl(safePath, base) : null;
    if (primary) return primary;

    const fallback = safeToUrl(safePath, window.location.origin);
    if (fallback) return fallback;

    return safePath;
}

export function getAssetBaseUrl(): string {
    const base = getBlinkoEndpoint('').replace(/\/$/, '');
    if (base.startsWith('http://') || base.startsWith('https://')) {
        return base;
    }
    if (typeof window !== 'undefined' && !(window as any).__TAURI__ && window.location?.origin) {
        return window.location.origin;
    }
    return '';
}

export function isTauriAndEndpointUndefined(): boolean {
    const isTauri = !!(window as any).__TAURI__;
    const blinkoEndpoint = normalizeStoredEndpoint(window.localStorage.getItem('blinkoEndpoint'));
    return isTauri && (!blinkoEndpoint || !isHttpUrl(blinkoEndpoint) || localHttpUnavailable);
}

export function saveBlinkoEndpoint(endpoint: string): void {
    if (!endpoint) return;
    const normalized = normalizeStoredEndpoint(endpoint);
    if (!normalized || !isHttpUrl(normalized)) return;
    window.localStorage.setItem('blinkoEndpoint', normalized);
    cachedEndpoint = normalized;
}

export function getSavedEndpoint(): string {
    return normalizeStoredEndpoint(window.localStorage.getItem('blinkoEndpoint'));
}

export function isLocalMode(): boolean {
    const stored = getSavedEndpoint();
    const base = cachedEndpoint || stored || '';
    const isTauri = !!(window as any).__TAURI__;
    if (isTauri && !base) return true;
    if (isTauri && base && !isHttpUrl(base)) return true;
    return isLocalEndpoint(base);
}

export function setLocalHttpUnavailable(value: boolean): void {
    localHttpUnavailable = value;
}

export function isLocalHttpUnavailable(): boolean {
    return localHttpUnavailable;
}

export async function resolveBaseUrl(): Promise<string> {
    try {
        if (cachedEndpoint) {
            return cachedEndpoint;
        }
        const stored = getSavedEndpoint();
        const isTauri = !!(window as any).__TAURI__;
        if (isTauri) {
            if (stored && isHttpUrl(stored) && !isLocalEndpoint(stored)) {
                cachedEndpoint = stored;
                return cachedEndpoint;
            }
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                const baseUrl = await invoke<string | null>('get_local_api_base_url');
                if (baseUrl) {
                    saveBlinkoEndpoint(baseUrl);
                    return baseUrl;
                }
            } catch (error) {
                console.error('Failed to resolve local api base url:', error);
            }
            setLocalHttpUnavailable(true);
            return '';
        }
        if (stored && isHttpUrl(stored)) {
            cachedEndpoint = stored;
            return cachedEndpoint;
        } else if (stored) {
            window.localStorage.removeItem('blinkoEndpoint');
        }
        cachedEndpoint = window.location.origin;
        return cachedEndpoint;
    } catch (error) {
        console.error(error);
        return window.location.origin;
    }
}
