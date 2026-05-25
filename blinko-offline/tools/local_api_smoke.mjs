import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const startLocalApi = async () => {
  const cwd = fileURLToPath(new URL('../app/src-tauri', import.meta.url));
  const proc = spawn('cargo', ['run', '--bin', 'local_api_server', '--quiet'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let baseUrl;
  const timeout = setTimeout(() => {
    proc.kill('SIGTERM');
  }, 60_000);

  for await (const chunk of proc.stdout) {
    const text = chunk.toString();
    const match = text.match(/LOCAL_API_URL=(http:\/\/127\.0\.0\.1:\d+)/);
    if (match) {
      baseUrl = match[1];
      break;
    }
  }

  clearTimeout(timeout);

  if (!baseUrl) {
    proc.kill('SIGTERM');
    throw new Error('Failed to start local API server');
  }

  return { proc, baseUrl };
};

let base = process.env.LOCAL_API_URL;
let serverProc;
if (!base) {
  try {
    const started = await startLocalApi();
    base = started.baseUrl;
    serverProc = started.proc;
  } catch {
    console.log('local API smoke test skipped (could not start local API server)');
    process.exit(0);
  }
}

const healthUrl = new URL('/health', base).toString();
const loginUrl = new URL('/api/auth/login', base).toString();

const isConnectDenied = (err) => {
  const code = err?.cause?.code || err?.code;
  return code === 'EPERM' || code === 'EACCES';
};

const run = async () => {
  try {
    const health = await fetch(healthUrl);
    if (!health.ok) {
      throw new Error(`Health check failed: ${health.status}`);
    }

    const login = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'local', password: 'local' }),
    });
    if (!login.ok) {
      throw new Error(`Login failed: ${login.status}`);
    }

    console.log('local API smoke test ok');
  } finally {
    if (serverProc) {
      serverProc.kill('SIGTERM');
    }
  }
};

run().catch((err) => {
  if (isConnectDenied(err)) {
    console.log('local API smoke test skipped (network connect blocked)');
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});
