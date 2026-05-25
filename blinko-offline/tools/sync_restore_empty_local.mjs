import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const remoteBase = process.env.REMOTE_BASE_URL;
const remoteTokenRaw = process.env.REMOTE_TOKEN;

if (!remoteBase || !remoteTokenRaw) {
  console.error('Missing env. Usage: REMOTE_BASE_URL=http://... REMOTE_TOKEN=... node tools/sync_restore_empty_local.mjs');
  process.exit(2);
}

const normalizeToken = (value) => String(value ?? '').trim().replace(/^bearer\\s+/i, '');
const remoteToken = normalizeToken(remoteTokenRaw);

const fetchJson = async (url, init = {}) => {
  const res = await fetch(url, init);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      typeof data === 'object' && data && data.error ? data.error
        : typeof data === 'string' ? data.slice(0, 200)
          : `HTTP ${res.status}`;
    throw new Error(`${init.method ?? 'GET'} ${url} failed: ${res.status} ${msg}`);
  }
  return data;
};

const startLocalApi = async () => {
  const cwd = fileURLToPath(new URL('../app/src-tauri', import.meta.url));
  const proc = spawn('cargo', ['run', '--bin', 'local_api_server', '--quiet'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let baseUrl;
  const timeoutMs = Number(process.env.LOCAL_API_START_TIMEOUT_MS ?? 300_000);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !baseUrl) {
    const chunk = await new Promise((resolve) => {
      proc.stdout.once('data', resolve);
      setTimeout(() => resolve(null), 2000);
    });
    if (!chunk) continue;
    const text = chunk.toString();
    const match = text.match(/LOCAL_API_URL=(http:\/\/127\.0\.0\.1:\d+)/);
    if (match) baseUrl = match[1];
  }
  if (!baseUrl) {
    proc.kill('SIGTERM');
    throw new Error(`Failed to start local API server within ${timeoutMs}ms`);
  }

  const errBuf = [];
  proc.stderr.on('data', (d) => errBuf.push(d.toString()));
  return { proc, baseUrl, errBuf };
};

const sqliteScalar = (dbPath, sql) => {
  const res = spawnSync('sqlite3', [dbPath, sql], { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`sqlite3 failed: ${res.stderr || res.stdout || `code=${res.status}`}`);
  }
  return String(res.stdout ?? '').trim();
};

const main = async () => {
  const allowInsecureHttp = remoteBase.trim().startsWith('http://');
  const local = await startLocalApi();

  const tmpRoot = path.join(os.tmpdir(), 'blinko_local_api_server');
  const dbPath = path.join(tmpRoot, 'blinko.sqlite');
  const attachmentsDir = path.join(tmpRoot, 'attachments');

  try {
    const login = await fetchJson(`${local.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'local', password: 'local' }),
    });
    if (!login?.token) throw new Error('Local API login missing token');
    const localToken = login.token;

    const localRequest = (p, init = {}) => {
      const headers = new Headers(init.headers ?? {});
      headers.set('Authorization', `Bearer ${localToken}`);
      return fetchJson(`${local.baseUrl}${p}`, { ...init, headers });
    };

    await localRequest('/sync/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'sync',
        remote_endpoints: [{ id: 'default', url: remoteBase.trim().replace(/\/+$/, ''), token: remoteToken }],
        allow_insecure_http: allowInsecureHttp,
      }),
    });

    await localRequest('/sync/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        remote_url: remoteBase.trim().replace(/\/+$/, ''),
        token: remoteToken,
        allow_insecure_http: allowInsecureHttp,
      }),
    });

    // Fresh DB should pull remote snapshot.
    await localRequest('/sync/now', { method: 'POST' });

    if (!fs.existsSync(dbPath)) {
      throw new Error(`Expected sqlite db at ${dbPath} but it does not exist`);
    }

    const noteCount = Number(sqliteScalar(dbPath, "select count(*) from notes where deleted_at is null;")) || 0;
    const tagCount = Number(sqliteScalar(dbPath, "select count(*) from tags;")) || 0;
    const attachmentCount = Number(sqliteScalar(dbPath, "select count(*) from attachments where deleted_at is null;")) || 0;
    const badTagCount = Number(sqliteScalar(
      dbPath,
      "select count(*) from tags where name like '/%' or name like '%usr%bin%env%' or (name not glob '*[^0-9]*' and length(name) < 4);"
    )) || 0;

    const diskAttachmentCount = fs.existsSync(attachmentsDir)
      ? fs.readdirSync(attachmentsDir).filter((f) => !f.startsWith('.')).length
      : 0;

    if (noteCount <= 0) throw new Error(`Expected >0 notes after restore, got ${noteCount}`);
    if (badTagCount !== 0) throw new Error(`Expected 0 bad tags after restore, got ${badTagCount}`);
    if (attachmentCount <= 0) throw new Error(`Expected >0 attachments after restore, got ${attachmentCount}`);
    if (diskAttachmentCount <= 0) throw new Error(`Expected >0 attachment files on disk after restore, got ${diskAttachmentCount}`);

    console.log(`sync restore empty local: OK (notes=${noteCount}, tags=${tagCount}, attachments=${attachmentCount}, disk_files=${diskAttachmentCount})`);
  } finally {
    local.proc.kill('SIGTERM');
    await delay(500);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
