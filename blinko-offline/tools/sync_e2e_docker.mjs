import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const composeFile = fileURLToPath(new URL('../test-docker/docker-compose.sync.yml', import.meta.url));

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: opts.cwd ?? repoRoot,
      stdio: opts.stdio ?? 'inherit',
      env: { ...process.env, ...(opts.env ?? {}) },
    });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });

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
    const msg = typeof data === 'object' && data && data.error ? data.error : `HTTP ${res.status}`;
    throw new Error(`${init.method ?? 'GET'} ${url} failed: ${msg}`);
  }
  return data;
};

const pullChangesUntil = async ({ baseUrl, token, predicate, maxPages = 50 }) => {
  let since = '0';
  for (let i = 0; i < maxPages; i++) {
    const pulled = await fetchJson(`${baseUrl}/changes?since=${encodeURIComponent(since)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ops = pulled?.ops ?? [];
    if (Array.isArray(ops) && ops.some(predicate)) {
      return { ok: true, pulled };
    }
    const next = pulled?.cursor ?? null;
    if (!next || next === since || !Array.isArray(ops) || ops.length === 0) {
      break;
    }
    since = String(next);
  }
  return { ok: false, pulled: null };
};

const waitForHealth = async (baseUrl, timeoutMs = 120_000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const data = await fetchJson(`${baseUrl}/health`);
      if (data?.status === 'ok') return;
    } catch {
      // ignore
    }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for health at ${baseUrl}`);
};

const registerIfNeeded = async (baseUrl, name, password) => {
  // On a fresh DB, first register creates superadmin and returns true.
  // On non-fresh DB, may fail if registration disabled; for tests we always start fresh.
  await fetchJson(`${baseUrl}/api/v1/user/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password }),
  });
};

const login = async (baseUrl, name, password) => {
  const data = await fetchJson(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: name, password }),
  });
  if (!data?.token) throw new Error(`Login response missing token at ${baseUrl}`);
  return data.token;
};

const createServerNote = async (baseUrl, token, content) => {
  const data = await fetchJson(`${baseUrl}/api/v1/note/upsert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      content,
      type: -1,
      attachments: [],
    }),
  });
  return data;
};

const listServerNotes = async (baseUrl, token, searchText = '') => {
  const data = await fetchJson(`${baseUrl}/api/v1/note/list`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      tagId: null,
      page: 1,
      size: 30,
      orderBy: 'desc',
      type: -1,
      isArchived: false,
      isRecycle: false,
      searchText,
    }),
  });
  return data;
};

const startLocalApi = async () => {
  const cwd = fileURLToPath(new URL('../app/src-tauri', import.meta.url));
  const proc = spawn('cargo', ['run', '--bin', 'local_api_server', '--quiet'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let baseUrl;
  // Cold builds (fresh Rust target dir, CI machines) can take >60s before the server prints its URL.
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

const localLogin = async (localBase) => {
  const data = await fetchJson(`${localBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'local', password: 'local' }),
  });
  if (!data?.token) throw new Error('Local API login missing token');
  return data.token;
};

const localRequest = async (localBase, token, path, init = {}) => {
  const headers = new Headers(init.headers ?? {});
  headers.set('Authorization', `Bearer ${token}`);
  return fetchJson(`${localBase}${path}`, { ...init, headers });
};

const verifyGoogleKeepImportPresentInWebBundle = async (baseUrl) => {
  const html = await (await fetch(`${baseUrl}/`)).text();
  const m = html.match(/\/assets\/(index-[^"]+\.js)/);
  if (!m) throw new Error('Failed to locate main index bundle in HTML');
  const jsUrl = `${baseUrl}/assets/${m[1]}`;
  const js = await (await fetch(jsUrl)).text();
  // The UI code references this i18n key literally.
  if (!js.includes('import-from-google-keep')) {
    throw new Error(`Web bundle missing "import-from-google-keep" (Google Keep import UI likely not built/deployed). bundle=${m[1]}`);
  }
};

const main = async () => {
  const debug = { steps: [] };
  const serverA = 'http://127.0.0.1:1111';
  const serverB = 'http://127.0.0.1:1112';

  // Always start from a clean environment to avoid DB contamination.
  await run('docker', ['compose', '-f', composeFile, 'down', '-v'], { cwd: repoRoot });
  await run('docker', ['compose', '-f', composeFile, 'up', '-d', '--build'], { cwd: repoRoot });

  try {
    await waitForHealth(serverA);
    await waitForHealth(serverB);

    // Web bundle sanity: must contain Google Keep import UI key.
    await verifyGoogleKeepImportPresentInWebBundle(serverA);

    // Create users and tokens for server-only mode calls and /changes auth.
    await registerIfNeeded(serverA, 'admin', 'admin');
    const tokenA = await login(serverA, 'admin', 'admin');

    await registerIfNeeded(serverB, 'admin', 'admin');
    const tokenB = await login(serverB, 'admin', 'admin');
    void tokenB; // tokenB reserved for future multi-hub tests

    // Server-only mode: create and list a note.
    const marker = `server-note-${Date.now()}`;
    await createServerNote(serverA, tokenA, marker);
    const notes = await listServerNotes(serverA, tokenA, marker);
    if (!Array.isArray(notes) || !notes.some((n) => (n?.content ?? '').includes(marker))) {
      throw new Error('Server-only note create/list failed');
    }

    // Local sync mode: start local API, configure remote, create note locally, sync, verify remote /changes, then pull remote update.
    const local = await startLocalApi();
    try {
      const localToken = await localLogin(local.baseUrl);

      // Save sync settings and validate connection via backend (no CSP/mixed-content issues).
      await localRequest(local.baseUrl, localToken, '/sync/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'sync',
          remote_endpoints: [{ id: 'default', url: serverA, token: tokenA }],
          allow_insecure_http: true,
        }),
      });

      await localRequest(local.baseUrl, localToken, '/sync/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remote_url: serverA,
          token: tokenA,
          allow_insecure_http: true,
        }),
      });

      const localNoteContent = `local-note-${Date.now()}`;
      const created = await localRequest(local.baseUrl, localToken, '/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 't', content: localNoteContent }),
      });
      const syncId = created?.sync_id;
      if (!syncId) throw new Error('Local note create did not return sync_id');

      await localRequest(local.baseUrl, localToken, '/sync/now', { method: 'POST' });

      const foundPush = await pullChangesUntil({
        baseUrl: serverA,
        token: tokenA,
        predicate: (op) => op?.entity_type === 'note' && (op?.payload_json ?? '').includes(localNoteContent),
        maxPages: 50,
      });
      if (!foundPush.ok) {
        throw new Error('Sync push failed: remote /changes did not receive note op');
      }
      debug.steps.push({
        step: 'after_push',
        sync_id: syncId,
        ops_count: Array.isArray(foundPush.pulled?.ops) ? foundPush.pulled.ops.length : null,
      });

      const remoteNotesAfterPush = await listServerNotes(serverA, tokenA, localNoteContent);
      if (!Array.isArray(remoteNotesAfterPush) || !remoteNotesAfterPush.some((n) => (n?.content ?? '').includes(localNoteContent))) {
        throw new Error('Sync push stored op but did not materialize note into server notes table (UI would not show it)');
      }

      // Remote update: post a newer note payload with the same sync_id, then sync again and assert local updated.
      const updatedContent = `${localNoteContent}-updated-remote`;
      const incoming = {
        ...created,
        content: updatedContent,
        updated_at: new Date(Date.now() + 5000).toISOString(),
        rev: Number(created.rev ?? 1) + 1,
        device_id: 'remote-test',
      };

      await fetchJson(`${serverA}/changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
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

      const remoteAfterInject = (await pullChangesUntil({
        baseUrl: serverA,
        token: tokenA,
        predicate: (op) => op?.entity_id === syncId && (op?.payload_json ?? '').includes(updatedContent),
        maxPages: 50,
      })).pulled;
      debug.steps.push({
        step: 'after_inject',
        sync_id: syncId,
        ops_count: Array.isArray(remoteAfterInject?.ops) ? remoteAfterInject.ops.length : null,
        injected_seen: Array.isArray(remoteAfterInject?.ops)
          ? remoteAfterInject.ops.some((op) => op?.entity_id === syncId && (op?.payload_json ?? '').includes(updatedContent))
          : null,
      });

      await localRequest(local.baseUrl, localToken, '/sync/now', { method: 'POST' });

      const listLocal = await localRequest(local.baseUrl, localToken, '/api/notes', { method: 'GET' });
      const localNotes = listLocal?.data ?? [];
      const matched = Array.isArray(localNotes) ? localNotes.find((n) => n?.sync_id === syncId) : null;
      debug.steps.push({
        step: 'after_pull',
        sync_id: syncId,
        local_found: Boolean(matched),
        local_content: matched?.content ?? null,
        local_updated_at: matched?.updated_at ?? null,
        expected_content: updatedContent,
      });
      if (!Array.isArray(localNotes) || !localNotes.some((n) => n?.sync_id === syncId && n?.content === updatedContent)) {
        const err = new Error('Sync pull failed: local note not updated from remote op');
        // Attach debug context for easier diagnosis in CI/dev.
        // eslint-disable-next-line no-underscore-dangle
        err.__debug = debug;
        throw err;
      }
    } finally {
      local.proc.kill('SIGTERM');
    }

    console.log('sync e2e docker: OK');
  } finally {
    await run('docker', ['compose', '-f', composeFile, 'down', '-v'], { cwd: repoRoot });
  }
};

main().catch((err) => {
  // Surface debug info if present.
  // eslint-disable-next-line no-underscore-dangle
  if (err && err.__debug) {
    // eslint-disable-next-line no-underscore-dangle
    console.error('DEBUG', JSON.stringify(err.__debug, null, 2));
  }
  console.error(err);
  process.exit(1);
});
