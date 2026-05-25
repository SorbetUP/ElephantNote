import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('Web-only runtime smoke', () => {
  function readAppFile(relFromSrc: string): string {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const appSrc = path.resolve(here, '../..'); // app/src/lib/__tests__ -> app/src
    return fs.readFileSync(path.resolve(appSrc, relFromSrc), 'utf8');
  }

  it('guards platform detection behind __TAURI__ checks', () => {
    const code = readAppFile('lib/tauriHelper.ts');
    expect(code).toContain('function hasTauriRuntime()');
    expect(code).toContain('if (!hasTauriRuntime()) return false;');
    expect(code).toContain('export function isDesktop()');
    expect(code).toContain('export function isAndroid()');
    expect(code).toContain('export function isWindows()');
  });

  it('uses browser download fallback when not in Tauri (static)', () => {
    const code = readAppFile('lib/tauriHelper.ts');
    expect(code).toContain('if (!isInTauri())');
    expect(code).toContain('helper.download.downloadByLink');
    expect(code).toContain('export async function downloadFromLink');
  });

  it('declares web-accessible routes for oauth callback and share pages', () => {
    const code = readAppFile('App.tsx');

    expect(code).toContain('path="/oauth-callback"');
    expect(code).toContain('path="/share/:id"');
    expect(code).toContain('path="/ai-share/:id"');
    expect(code).toContain('<BrowserRouter>');
  });

  it('guards Tauri invoke/listen behind isInTauri() checks (static)', () => {
    const code = readAppFile('App.tsx');

    expect(code).toContain('if (!isInTauri()) return;');
    expect(code).toContain("listen('navigate-to-route'");
    expect(code).toContain('invoke<string | null>("get_local_api_base_url")');
    expect(code).toContain("invoke('sync_now')");
  });
});
