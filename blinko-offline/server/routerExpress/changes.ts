import express from 'express';
import { prisma } from '../prisma';
import { getTokenFromRequest } from '../lib/helper';
import { materializeIncomingOps, rebuildTagsForAccount, seedInitialSyncSnapshot } from '../lib/sync_notes';

const router = express.Router();

router.use(express.json({ limit: '50mb' }));

// Debounced tag rebuild to keep bulk sync imports fast while eventually producing correct tag lists.
const pendingTagRebuild = new Map<number, NodeJS.Timeout>();
function scheduleTagRebuild(accountId: number): void {
  const existing = pendingTagRebuild.get(accountId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(async () => {
    pendingTagRebuild.delete(accountId);
    try {
      await rebuildTagsForAccount(prisma, accountId);
    } catch (err) {
      console.error('tag rebuild error:', err);
    }
  }, 2_000);
  pendingTagRebuild.set(accountId, t);
}

const requireAuth = async (req: any, res: any, next: any) => {
  try {
    const token = await getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = token;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
};

const normalizePayload = (value: any) => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
};

const normalizeNotePayloadJsonForLegacyClients = (payloadJson: string) => {
  // Some client builds expect local-note share fields to exist in the payload (even if empty).
  // This keeps the /changes contract forward-compatible without rewriting historical rows.
  try {
    const obj = JSON.parse(payloadJson ?? '{}');
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return payloadJson;

    const sharePassword = typeof obj.share_password === 'string'
      ? obj.share_password
      : (typeof obj.sharePassword === 'string' ? obj.sharePassword : '');
    const shareEncryptedUrl = obj.share_encrypted_url ?? obj.shareEncryptedUrl ?? null;
    const shareExpiryDate = obj.share_expiry_date ?? obj.shareExpiryDate ?? null;
    const shareMaxView = Number(obj.share_max_view ?? obj.shareMaxView ?? 0) || 0;
    const shareViewCount = Number(obj.share_view_count ?? obj.shareViewCount ?? 0) || 0;

    obj.share_password = sharePassword;
    obj.share_encrypted_url = shareEncryptedUrl;
    obj.share_expiry_date = shareExpiryDate;
    obj.share_max_view = shareMaxView;
    obj.share_view_count = shareViewCount;

    return JSON.stringify(obj);
  } catch {
    return payloadJson;
  }
};

const toSyncOpResponse = (row: any) => ({
  id: row.id,
  entity_type: row.entityType,
  entity_id: row.entityId,
  op: row.op,
  payload_json: row.entityType === 'note' ? normalizeNotePayloadJsonForLegacyClients(row.payloadJson) : row.payloadJson,
  ts: row.ts instanceof Date ? row.ts.toISOString() : row.ts,
  device_id: row.deviceId,
});

router.get('/', requireAuth, async (req: any, res) => {
  const sinceRaw = req.query?.since as string | undefined;
  const since = sinceRaw ? Number(sinceRaw) : undefined;
  if (sinceRaw && Number.isNaN(since)) {
    return res.status(400).json({ error: 'Invalid cursor' });
  }

  const excludeDeviceIdRaw = (req.query?.device_id ?? req.query?.deviceId) as string | undefined;
  const excludeDeviceId = typeof excludeDeviceIdRaw === 'string' && excludeDeviceIdRaw.trim() ? excludeDeviceIdRaw.trim() : undefined;

  const includeSelfRaw = (req.query?.include_self ?? req.query?.includeSelf) as string | undefined;
  const includeSelf = includeSelfRaw === '1' || includeSelfRaw === 'true';

  const limitRaw = (req.query?.limit ?? req.query?.take) as string | undefined;
  const limit = limitRaw ? Number(limitRaw) : 500;
  if (limitRaw && Number.isNaN(limit)) {
    return res.status(400).json({ error: 'Invalid limit' });
  }
  const take = Math.max(0, Math.min(500, limit));

  const accountId = Number(req.user.id);

  // Cursor reset detection: if the client cursor is beyond the remote max id (e.g. remote DB was wiped / truncated),
  // tell the client to re-bootstrap.
  if (since) {
    const latest = await prisma.syncChanges.findFirst({
      where: { accountId },
      orderBy: { id: 'desc' },
      select: { id: true }
    });
    const latestId = latest?.id ?? null;
    if (!latestId || latestId < since) {
      return res.json({
        cursor: latestId ? String(latestId) : null,
        ops: [],
        reset: true
      });
    }
  }

  // First pull: if there's no sync log yet, seed it from existing notes so remote -> local works.
  if (!since) {
    const hasAny = await prisma.syncChanges.count({ where: { accountId } });
    if (hasAny === 0) {
      await seedInitialSyncSnapshot(prisma, accountId);
    }
  }

  // If the client only needs the latest cursor (e.g. after a bootstrap export), allow `limit=0`.
  if (take === 0) {
    const latest = await prisma.syncChanges.findFirst({
      where: { accountId },
      orderBy: { id: 'desc' },
      select: { id: true }
    });
    return res.json({
      cursor: latest?.id ? String(latest.id) : (sinceRaw ?? null),
      ops: [],
      reset: false
    });
  }

  const rows = await prisma.syncChanges.findMany({
    where: {
      accountId,
      ...(since ? { id: { gt: since } } : {}),
      ...(excludeDeviceId && !includeSelf ? { deviceId: { not: excludeDeviceId } } : {})
    },
    orderBy: { id: 'asc' },
    take
  });

  const cursor = rows.length ? String(rows[rows.length - 1].id) : (sinceRaw ?? null);

  return res.json({
    cursor,
    ops: rows.map(toSyncOpResponse),
    reset: false
  });
});

router.post('/', requireAuth, async (req: any, res) => {
  const ops = req.body?.ops;
  if (!Array.isArray(ops)) {
    return res.status(400).json({ error: 'ops must be an array' });
  }

  const accountId = Number(req.user.id);

  const data = ops.map((op: any) => {
    const entityType = op.entity_type ?? op.entityType ?? '';
    const entityId = op.entity_id ?? op.entityId ?? '';
    const deviceId = op.device_id ?? op.deviceId ?? '';
    const payloadJson = normalizePayload(op.payload_json ?? op.payloadJson ?? op.payload);
    const ts = op.ts ? new Date(op.ts) : new Date();
    const opValue = op.op ?? '';

    return {
      accountId,
      entityType,
      entityId,
      op: opValue,
      payloadJson,
      ts: Number.isNaN(ts.getTime()) ? new Date() : ts,
      deviceId,
    };
  });

  if (!data.length) {
    return res.json({ ok: true, count: 0 });
  }

  // Persist ops first. Materialization is best-effort and intentionally not part of an interactive transaction
  // (large imports can exceed Prisma's default interactive transaction timeout).
  await prisma.syncChanges.createMany({ data });

  try {
    const isBulk = data.length > 50;
    // For bulk imports, skip tags to keep /changes reliable and fast.
    await materializeIncomingOps(prisma, accountId, data, { applyTags: !isBulk });
    if (isBulk) {
      scheduleTagRebuild(accountId);
    }
  } catch (err) {
    console.error('sync materialize error:', err);
    // Do not fail the request: ops are stored and can be backfilled later.
  }

  return res.json({ ok: true, count: data.length });
});

export default router;
