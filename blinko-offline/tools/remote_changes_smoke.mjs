const base = process.env.REMOTE_BASE_URL;
const token = process.env.REMOTE_TOKEN;

if (!base || !token) {
  console.log('remote changes smoke test skipped (REMOTE_BASE_URL/REMOTE_TOKEN not set)');
  process.exit(0);
}

const changesUrl = new URL('/changes?since=0', base).toString();

const run = async () => {
  const res = await fetch(changesUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    throw new Error(`Remote /changes failed: ${res.status}`);
  }
  const body = await res.json();
  if (!('cursor' in body) || !Array.isArray(body.ops)) {
    throw new Error('Remote /changes response invalid');
  }

  const fileSyncId = process.env.REMOTE_FILE_SYNC_ID;
  if (fileSyncId) {
    const fileUrl = new URL(`/api/file/by-sync-id/${fileSyncId}`, base).toString();
    const fileRes = await fetch(fileUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!fileRes.ok) {
      throw new Error(`Remote /api/file/by-sync-id failed: ${fileRes.status}`);
    }
  }

  console.log('remote /changes smoke test ok');
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
