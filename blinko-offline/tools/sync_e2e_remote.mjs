import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const remoteBase = process.env.REMOTE_BASE_URL;
const remoteTokenRaw = process.env.REMOTE_TOKEN;

if (!remoteBase || !remoteTokenRaw) {
  console.error('Missing env. Usage: REMOTE_BASE_URL=http://... REMOTE_TOKEN=... node tools/sync_e2e_remote.mjs');
  process.exit(2);
}

const normalizeToken = (value) => String(value ?? '').trim().replace(/^bearer\s+/i, '');
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

const sqliteScalar = (dbPath, sql) => {
  const res = spawnSync('sqlite3', [dbPath, sql], { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`sqlite3 failed: ${res.stderr || res.stdout || `code=${res.status}`}`);
  }
  return String(res.stdout ?? '').trim();
};

const writeTempFile = async ({ bytes, name }) => {
  const outPath = path.join(os.tmpdir(), `blinko_sync_e2e_${Date.now()}_${crypto.randomUUID()}_${name}`);
  const stream = createWriteStream(outPath);
  const chunkSize = 1024 * 1024;
  const chunk = Buffer.alloc(chunkSize, 'x');
  await new Promise((resolve, reject) => {
    let remaining = bytes;
    const write = () => {
      while (remaining > 0) {
        const toWrite = Math.min(chunkSize, remaining);
        const ok = stream.write(chunk.subarray(0, toWrite));
        remaining -= toWrite;
        if (!ok) {
          stream.once('drain', write);
          return;
        }
      }
      stream.end();
    };
    stream.on('error', reject);
    stream.on('finish', resolve);
    write();
  });
  return outPath;
};

const countResponseBytes = async (res) => {
  if (!res.body) return 0;
  const reader = res.body.getReader();
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value?.byteLength ?? 0;
  }
  return total;
};

const pullChangesUntil = async ({ remoteBase, remoteToken, predicate, maxPages = 50 }) => {
  let since = '0';
  for (let i = 0; i < maxPages; i++) {
    const pulled = await fetchJson(`${remoteBase.replace(/\/+$/, '')}/changes?since=${encodeURIComponent(since)}`, {
      headers: { Authorization: `Bearer ${remoteToken}` },
    });
    const ops = pulled?.ops ?? [];
    if (Array.isArray(ops) && ops.some(predicate)) {
      return true;
    }
    const next = pulled?.cursor ?? null;
    if (!next || next === since || !Array.isArray(ops) || ops.length === 0) {
      break;
    }
    since = String(next);
  }
  return false;
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

const main = async () => {
  const allowInsecureHttp = remoteBase.trim().startsWith('http://');
  const local = await startLocalApi();

  try {
    const login = await fetchJson(`${local.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'local', password: 'local' }),
    });
    if (!login?.token) throw new Error('Local API login missing token');
    const localToken = login.token;

    const localRequest = (path, init = {}) => {
      const headers = new Headers(init.headers ?? {});
      headers.set('Authorization', `Bearer ${localToken}`);
      return fetchJson(`${local.baseUrl}${path}`, { ...init, headers });
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

    // --- Attachment sync path (local -> remote) ---
    const attachmentBytes = Number(process.env.SYNC_E2E_ATTACHMENT_BYTES ?? (6 * 1024 * 1024));
    const attachmentName = `sync-e2e-resource-${Date.now()}.bin`;
    const tmpFile = await writeTempFile({ bytes: attachmentBytes, name: attachmentName });

    let localAttachmentId;
    let localAttachmentSyncId;
    try {
      const form = new FormData();
      const buf = await fs.readFile(tmpFile);
      form.set('file', new Blob([buf]), attachmentName);

      const uploadRes = await fetchJson(`${local.baseUrl}/api/file/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localToken}` },
        body: form,
      });

      const filePath = uploadRes?.filePath;
      const m = typeof filePath === 'string' ? filePath.match(/\/api\/file\/(\d+)/) : null;
      if (!m) throw new Error(`Local upload did not return numeric filePath, got: ${filePath}`);
      localAttachmentId = Number(m[1]);

      const dbPath = path.join(os.tmpdir(), 'blinko_local_api_server', 'blinko.sqlite');
      localAttachmentSyncId = sqliteScalar(dbPath, `select sync_id from attachments where id = ${localAttachmentId};`);
      if (!localAttachmentSyncId) throw new Error('Failed to resolve local attachment sync_id from sqlite');
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }

    const localNoteContent = `remote-e2e-${Date.now()}`;
    const created = await localRequest('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 't', content: localNoteContent }),
    });
    const syncId = created?.sync_id;
    if (!syncId) throw new Error('Local note create missing sync_id');

    await localRequest('/sync/now', { method: 'POST' });

    const foundOp = await pullChangesUntil({
      remoteBase,
      remoteToken,
      predicate: (op) => op?.entity_type === 'note' && (op?.payload_json ?? '').includes(localNoteContent),
      maxPages: 50,
    });
    if (!foundOp) {
      throw new Error('Remote /changes did not receive pushed note op');
    }

    // Verify the attachment binary is available by sync id (proof the upload happened).
    const bySync = await fetch(`${remoteBase.replace(/\/+$/, '')}/api/file/by-sync-id/${encodeURIComponent(localAttachmentSyncId)}`, {
      headers: { Authorization: `Bearer ${remoteToken}` },
    });
    if (!bySync.ok) {
      const txt = await bySync.text().catch(() => '');
      throw new Error(`Remote by-sync-id download failed: ${bySync.status} ${txt.slice(0, 200)}`);
    }
    const remoteSize = await countResponseBytes(bySync);
    if (remoteSize <= 0) throw new Error('Remote by-sync-id download returned 0 bytes');

    // Verify it appears in the Resources list (tRPC).
    const input = JSON.stringify({ json: { page: 1, size: 50, searchText: 'sync-e2e-resource' } });
    const list = await fetchJson(`${remoteBase.replace(/\/+$/, '')}/api/trpc/attachments.list?input=${encodeURIComponent(input)}`, {
      headers: { Authorization: `Bearer ${remoteToken}` },
    });
    const arr = list?.result?.data?.json ?? list?.result?.data ?? [];
    if (!Array.isArray(arr) || !arr.some((att) => String(att?.name ?? '').includes('sync-e2e-resource'))) {
      throw new Error('Remote attachments.list did not include uploaded attachment (Resources would look empty)');
    }

    const remoteNotes = await fetchJson(`${remoteBase.replace(/\/+$/, '')}/api/v1/note/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${remoteToken}` },
      body: JSON.stringify({ page: 1, size: 50, orderBy: 'desc', isRecycle: false }),
    });
    if (!Array.isArray(remoteNotes) || !remoteNotes.some((n) => String(n?.content ?? '').includes(localNoteContent))) {
      throw new Error('Remote web API did not materialize note into notes table (UI would not show it)');
    }

    const updatedContent = `${localNoteContent}-updated-remote`;
    const incoming = {
      ...created,
      content: updatedContent,
      updated_at: new Date(Date.now() + 5000).toISOString(),
      rev: Number(created.rev ?? 1) + 1,
      device_id: 'remote-test',
    };

    await fetchJson(`${remoteBase.replace(/\/+$/, '')}/changes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${remoteToken}` },
      body: JSON.stringify({
        ops: [{
          entity_type: 'note',
          entity_id: syncId,
          op: 'update',
          payload_json: JSON.stringify(incoming),
          ts: new Date().toISOString(),
          device_id: 'remote-test',
        }],
      }),
    });

    await localRequest('/sync/now', { method: 'POST' });

    const listLocal = await localRequest('/api/notes', { method: 'GET' });
    const localNotes = listLocal?.data ?? [];
    const matched = Array.isArray(localNotes) ? localNotes.find((n) => n?.sync_id === syncId) : null;
    if (!matched || matched.content !== updatedContent) {
      throw new Error('Sync pull failed: local note not updated from remote op');
    }

    console.log('sync e2e remote: OK');
  } finally {
    local.proc.kill('SIGTERM');
    await delay(500);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
