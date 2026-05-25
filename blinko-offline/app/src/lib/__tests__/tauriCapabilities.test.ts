import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function hasOpenPathPermission(cap: any): boolean {
  const perms: any[] = cap?.permissions ?? [];
  return perms.some((p) => {
    if (typeof p === 'string') return p === 'opener:allow-open-path';
    if (!p || typeof p !== 'object') return false;
    if (p.identifier !== 'opener:allow-open-path') return false;
    const allow = Array.isArray(p.allow) ? p.allow : [];
    return allow.some((entry) => entry?.path === '$DOWNLOAD/**');
  });
}

describe('Tauri capabilities', () => {
  it('allows opener open_path for $DOWNLOAD/**', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const appRoot = path.resolve(here, '../../..'); // app/src/lib/__tests__ -> app
    const capDir = path.resolve(appRoot, 'src-tauri/capabilities');

    const defaultCap = readJson(path.resolve(capDir, 'default.json'));
    const desktopCap = readJson(path.resolve(capDir, 'desktop.json'));
    const mobileCap = readJson(path.resolve(capDir, 'mobile.json'));

    expect(hasOpenPathPermission(defaultCap)).toBe(true);
    expect(hasOpenPathPermission(desktopCap)).toBe(true);
    expect(hasOpenPathPermission(mobileCap)).toBe(true);
  });
});

