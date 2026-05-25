import crypto from 'crypto';
import { helper } from '@shared/lib/helper';
import type { PrismaClient } from '@prisma/client';
import type { TagTreeNode } from '@shared/lib/helper';
import { getServerInstanceId } from './serverInstance';

export type SyncNotePayload = {
  id?: number;
  sync_id?: string;
  syncId?: string;
  title?: string;
  content?: string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  deleted_at?: string | null;
  deletedAt?: string | null;
  rev?: number;
  device_id?: string;
  deviceId?: string;
  is_archived?: boolean;
  isArchived?: boolean;
  is_recycle?: boolean;
  isRecycle?: boolean;
  is_share?: boolean;
  isShare?: boolean;
  is_top?: boolean;
  isTop?: boolean;
  note_type?: number;
  noteType?: number;
  // Optional share fields for local-mode parity. Old clients ignore unknown fields.
  share_password?: string;
  sharePassword?: string;
  share_encrypted_url?: string | null;
  shareEncryptedUrl?: string | null;
  share_expiry_date?: string | null;
  shareExpiryDate?: string | null;
  share_max_view?: number;
  shareMaxView?: number;
  share_view_count?: number;
  shareViewCount?: number;
};

export function shouldApplyLww(
  localUpdatedAt: Date | null | undefined,
  localDeviceId: string | null | undefined,
  incomingUpdatedAt: Date,
  incomingDeviceId: string,
): boolean {
  if (!localUpdatedAt) return true;
  if (incomingUpdatedAt > localUpdatedAt) return true;
  if (incomingUpdatedAt < localUpdatedAt) return false;
  return (incomingDeviceId ?? '') > (localDeviceId ?? '');
}

function safeJsonParse(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseDate(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function splitTitleAndBodyFromServerContent(content: string): { title: string; body: string } {
  const lines = (content ?? '').split('\n');
  const title = (lines[0] ?? '').trim();
  const body = lines.slice(1).join('\n');
  return { title, body };
}

function buildServerContent(title: string, body: string): string {
  const t = (title ?? '').trim();
  if (!t) return body ?? '';
  if (!body) return t;
  return `${t}\n${body}`;
}

const TAG_SEGMENT_RE = /^[\p{L}\p{N}_][\p{L}\p{N}_-]{0,63}$/u;
const TRAILING_PUNCT_RE = /[,*?.。!！?？;；:："'”’)\]}>\u3001]+$/u;

function normalizeHashtagToken(raw: string): string | null {
  const token = (raw ?? '').trim().replace(TRAILING_PUNCT_RE, '');
  if (!token) return null;
  if (token.startsWith('!') || token.startsWith('/')) return null;

  const segments = token.split('/');
  if (segments.some((s) => !s)) return null;
  for (const seg of segments) {
    if (!TAG_SEGMENT_RE.test(seg)) return null;
  }

  if (/^\p{N}+$/u.test(token) && token.length < 4) return null;
  return token;
}

function extractHashtagsForSync(input: string): string[] {
  // Keep in sync with the server's note upsert hashtag extraction.
  const withoutCodeBlocks = (input ?? '').replace(/```[\s\S]*?```/g, '');
  const out: string[] = [];
  const re = /(^|\s)#([^\s#]+)/gu;
  for (const match of withoutCodeBlocks.matchAll(re)) {
    const normalized = normalizeHashtagToken(match[2] ?? '');
    if (normalized) out.push(`#${normalized}`);
  }
  return out;
}

// Expose deterministic helpers for unit tests.
export const __test__ = {
  normalizeHashtagToken,
  extractHashtagsForSync,
};

async function ensureTagsForTree(prisma: PrismaClient, accountId: number, tagTree: TagTreeNode[], parentTagId: number): Promise<number[]> {
  const tagIds: number[] = [];
  for (const node of tagTree) {
    if (!node?.name) continue;

    let tag = await prisma.tag.findFirst({
      where: {
        accountId,
        name: node.name,
        parent: parentTagId,
      },
    });
    if (!tag) {
      tag = await prisma.tag.create({
        data: {
          accountId,
          name: node.name,
          parent: parentTagId,
        },
      });
    }

    tagIds.push(tag.id);
    if (node.children?.length) {
      const childIds = await ensureTagsForTree(prisma, accountId, node.children, tag.id);
      tagIds.push(...childIds);
    }
  }

  return tagIds;
}

async function setNoteTagsFromContent(prisma: PrismaClient, accountId: number, noteId: number, content: string): Promise<void> {
  const tags = extractHashtagsForSync((content ?? '').replace(/\\/g, '') + ' ');
  const tagTree = helper.buildHashTagTreeFromHashString(tags);
  const desiredTagIds = Array.from(new Set(await ensureTagsForTree(prisma, accountId, tagTree, 0)));

  // Remove relations not present anymore
  await prisma.tagsToNote.deleteMany({
    where: {
      noteId,
      ...(desiredTagIds.length ? { tagId: { notIn: desiredTagIds } } : {}),
    },
  });

  // Ensure relations exist
  for (const tagId of desiredTagIds) {
    try {
      await prisma.tagsToNote.create({ data: { noteId, tagId } });
    } catch (err: any) {
      // Ignore unique constraint on composite PK (noteId, tagId)
      if (err?.code !== 'P2002') throw err;
    }
  }
}

function normalizeSyncId(payload: any, fallback?: string): string | null {
  const v = payload?.sync_id ?? payload?.syncId ?? fallback;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s : null;
}

export async function materializeIncomingOps(
  prisma: PrismaClient,
  accountId: number,
  ops: Array<{ entityType: string; entityId: string; op: string; payloadJson: string; ts: Date; deviceId: string }>,
  opts: { applyTags?: boolean } = {},
): Promise<{ notesApplied: number }> {
  const applyTags = opts.applyTags ?? true;
  let notesApplied = 0;

  for (const op of ops) {
    if (op.entityType === 'attachment') {
      const payload = safeJsonParse(op.payloadJson);
      if (!payload || typeof payload !== 'object') continue;

      const syncId = normalizeSyncId(payload, op.entityId);
      if (!syncId) continue;

      const incomingDeletedAt = parseDate((payload as any).deleted_at ?? (payload as any).deletedAt);
      const isDelete = Boolean(incomingDeletedAt) || op.op === 'delete';

      if (isDelete) {
        await prisma.attachments.deleteMany({ where: { accountId, syncId } });
        continue;
      }

      const name = String((payload as any).filename ?? (payload as any).name ?? '').trim();
      const type = String((payload as any).mime ?? (payload as any).type ?? '').trim();
      const size = Number((payload as any).size ?? 0) || 0;

      const existing = await prisma.attachments.findFirst({
        where: { accountId, syncId },
        select: { id: true, perfixPath: true, depth: true },
      });

      const data: any = {
        accountId,
        syncId,
        ...(name ? { name } : {}),
        ...(type ? { type } : {}),
        size,
        // Ensure the attachment is listable in "Resources" even before the binary upload finishes.
        // Do not overwrite a non-empty folder assignment set by the server UI.
        ...(
          existing?.perfixPath && String(existing.perfixPath).trim()
            ? {}
            : { perfixPath: '' }
        ),
        ...(existing?.depth != null ? {} : { depth: 0 }),
        // Keep server storage path untouched; file uploads are handled by /api/file/upload which
        // idempotently updates by syncId.
      };

      if (existing) {
        await prisma.attachments.update({ where: { id: existing.id }, data });
      } else {
        await prisma.attachments.create({ data: { path: '', ...data } });
      }
      continue;
    }

    if (op.entityType !== 'note') continue;

    const payload = safeJsonParse(op.payloadJson);
    if (!payload || typeof payload !== 'object') continue;

    const syncId = normalizeSyncId(payload, op.entityId);
    if (!syncId) continue;

    const incomingUpdatedAt =
      parseDate(payload.updated_at ?? payload.updatedAt) ??
      parseDate(op.ts) ??
      new Date();

    const incomingCreatedAt =
      parseDate(payload.created_at ?? payload.createdAt) ??
      incomingUpdatedAt;

    const incomingDeletedAt = parseDate(payload.deleted_at ?? payload.deletedAt);
    const incomingDeviceId = String(payload.device_id ?? payload.deviceId ?? op.deviceId ?? '');
    const incomingRev = Number(payload.rev ?? 0) || 0;

    const title = String(payload.title ?? '').trim();
    const body = String(payload.content ?? '');
    const content = buildServerContent(title, body);

    const noteType = Number(payload.note_type ?? payload.noteType ?? 0) || 0;
    const isArchived = Boolean(payload.is_archived ?? payload.isArchived ?? false);
    const isShare = Boolean(payload.is_share ?? payload.isShare ?? false);
    const isTop = Boolean(payload.is_top ?? payload.isTop ?? false);

    const isRecycleByPayload = Boolean(payload.is_recycle ?? payload.isRecycle ?? false);
    const isRecycle = Boolean(incomingDeletedAt) || isRecycleByPayload || op.op === 'delete';

    const existing = await prisma.notes.findFirst({
      where: { accountId, syncId },
      select: { id: true, syncUpdatedAt: true, syncDeviceId: true },
    });

    if (existing && !shouldApplyLww(existing.syncUpdatedAt, existing.syncDeviceId, incomingUpdatedAt, incomingDeviceId)) {
      continue;
    }

    const data = {
      accountId,
      content,
      type: noteType,
      isArchived,
      isShare,
      isTop,
      isRecycle,
      syncId,
      syncRev: incomingRev,
      syncDeviceId: incomingDeviceId,
      syncCreatedAt: incomingCreatedAt,
      syncUpdatedAt: incomingUpdatedAt,
      syncDeletedAt: incomingDeletedAt,
      ...(existing ? {} : { createdAt: incomingCreatedAt }),
    };

    const note = existing
      ? await prisma.notes.update({ where: { id: existing.id }, data })
      : await prisma.notes.create({ data });

    // Tags are optional for sync materialization (UI will still show the note).
    // Avoid doing heavy tag writes during large bulk sync imports.
    if (applyTags) {
      await setNoteTagsFromContent(prisma, accountId, note.id, note.content);
    }

    notesApplied += 1;
  }

  return { notesApplied };
}

export async function ensureNoteHasSyncId(prisma: PrismaClient, noteId: number): Promise<{ syncId: string }>{
  const note = await prisma.notes.findUnique({ where: { id: noteId }, select: { syncId: true } });
  const current = note?.syncId?.trim();
  if (current) return { syncId: current };

  const next = crypto.randomUUID();
  await prisma.notes.update({ where: { id: noteId }, data: { syncId: next } });
  return { syncId: next };
}

export async function emitSyncChangeForNote(prisma: PrismaClient, accountId: number, noteId: number, deviceId: string): Promise<void> {
  const note = await prisma.notes.findUnique({
    where: { id: noteId },
    select: {
      id: true,
      type: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      isArchived: true,
      isRecycle: true,
      isShare: true,
      isTop: true,
      sharePassword: true,
      shareEncryptedUrl: true,
      shareExpiryDate: true,
      shareMaxView: true,
      shareViewCount: true,
      syncId: true,
      syncRev: true,
      syncDeviceId: true,
      syncCreatedAt: true,
      syncUpdatedAt: true,
      syncDeletedAt: true,
    },
  });
  if (!note) return;

  const syncId = (note.syncId ?? '').trim();
  if (!syncId) return;

  const { title, body } = splitTitleAndBodyFromServerContent(note.content);
  const payload = {
    id: 0,
    sync_id: syncId,
    title,
    content: body,
    created_at: (note.syncCreatedAt ?? note.createdAt).toISOString(),
    updated_at: (note.syncUpdatedAt ?? note.updatedAt).toISOString(),
    deleted_at: note.syncDeletedAt ? note.syncDeletedAt.toISOString() : null,
    rev: note.syncRev ?? 0,
    device_id: note.syncDeviceId?.trim() || deviceId,
    is_archived: note.isArchived,
    is_recycle: note.isRecycle,
    is_share: note.isShare,
    is_top: note.isTop,
    note_type: note.type,
    share_password: note.sharePassword ?? '',
    share_encrypted_url: note.shareEncryptedUrl ?? null,
    share_expiry_date: note.shareExpiryDate ? note.shareExpiryDate.toISOString() : null,
    share_max_view: Number(note.shareMaxView ?? 0) || 0,
    share_view_count: Number(note.shareViewCount ?? 0) || 0,
  };

  await prisma.syncChanges.create({
    data: {
      accountId,
      entityType: 'note',
      entityId: syncId,
      op: note.isRecycle ? 'delete' : 'upsert',
      payloadJson: JSON.stringify(payload),
      ts: note.syncUpdatedAt ?? note.updatedAt,
      deviceId: deviceId,
    },
  });
}

export async function seedInitialSyncSnapshot(prisma: PrismaClient, accountId: number): Promise<void> {
  // Create a durable sync log from existing notes so new sync clients can do an initial pull.
  const notes = await prisma.notes.findMany({
    where: { accountId },
    select: {
      id: true,
      type: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      isArchived: true,
      isRecycle: true,
      isShare: true,
      isTop: true,
      sharePassword: true,
      shareEncryptedUrl: true,
      shareExpiryDate: true,
      shareMaxView: true,
      shareViewCount: true,
      syncId: true,
      syncRev: true,
      syncDeviceId: true,
      syncCreatedAt: true,
      syncUpdatedAt: true,
      syncDeletedAt: true,
    },
    orderBy: { id: 'asc' },
  });

  if (!notes.length) return;

  const instanceId = await getServerInstanceId(prisma);
  const deviceId = `server-seed:${instanceId}:${accountId}`;

  // Ensure every note has a syncId so it can be replicated.
  for (const note of notes) {
    if (!note.syncId || !note.syncId.trim()) {
      await prisma.notes.update({
        where: { id: note.id },
        data: {
          syncId: crypto.randomUUID(),
          syncDeviceId: note.syncDeviceId?.trim() || deviceId,
          syncCreatedAt: note.syncCreatedAt ?? note.createdAt,
          syncUpdatedAt: note.syncUpdatedAt ?? note.updatedAt,
          syncRev: note.syncRev ?? 1,
          syncDeletedAt: note.syncDeletedAt ?? null,
        },
      });
    }
  }

  // Reload with sync ids to generate ops.
  const seeded = await prisma.notes.findMany({
    where: { accountId, syncId: { not: null } },
    select: {
      id: true,
      type: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      isArchived: true,
      isRecycle: true,
      isShare: true,
      isTop: true,
      sharePassword: true,
      shareEncryptedUrl: true,
      shareExpiryDate: true,
      shareMaxView: true,
      shareViewCount: true,
      syncId: true,
      syncRev: true,
      syncDeviceId: true,
      syncCreatedAt: true,
      syncUpdatedAt: true,
      syncDeletedAt: true,
    },
    orderBy: { id: 'asc' },
  });

  const rows = seeded
    .map((note) => {
      const syncId = note.syncId?.trim();
      if (!syncId) return null;
      const { title, body } = splitTitleAndBodyFromServerContent(note.content);
      return {
        accountId,
        entityType: 'note',
        entityId: syncId,
        op: note.isRecycle ? 'delete' : 'upsert',
        payloadJson: JSON.stringify({
          id: 0,
          sync_id: syncId,
          title,
          content: body,
          created_at: (note.syncCreatedAt ?? note.createdAt).toISOString(),
          updated_at: (note.syncUpdatedAt ?? note.updatedAt).toISOString(),
          deleted_at: note.syncDeletedAt ? note.syncDeletedAt.toISOString() : null,
          rev: note.syncRev ?? 0,
          device_id: note.syncDeviceId?.trim() || deviceId,
          is_archived: note.isArchived,
          is_recycle: note.isRecycle,
          is_share: note.isShare,
          is_top: note.isTop,
          note_type: note.type,
          share_password: note.sharePassword ?? '',
          share_encrypted_url: note.shareEncryptedUrl ?? null,
          share_expiry_date: note.shareExpiryDate ? note.shareExpiryDate.toISOString() : null,
          share_max_view: Number(note.shareMaxView ?? 0) || 0,
          share_view_count: Number(note.shareViewCount ?? 0) || 0,
        }),
        ts: note.syncUpdatedAt ?? note.updatedAt,
        deviceId: note.syncDeviceId?.trim() || deviceId,
      };
    })
    .filter(Boolean) as Array<{ accountId: number; entityType: string; entityId: string; op: string; payloadJson: string; ts: Date; deviceId: string }>;

  if (!rows.length) return;
  await prisma.syncChanges.createMany({ data: rows });

  // Also seed attachment metadata so sync-mode clients can restore resources.
  const attachments = await prisma.attachments.findMany({
    where: { accountId },
    select: {
      id: true,
      syncId: true,
      noteId: true,
      name: true,
      type: true,
      size: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { id: 'asc' },
  });

  if (!attachments.length) return;

  // Ensure every attachment has a syncId for replication.
  for (const att of attachments) {
    if (!att.syncId || !att.syncId.trim()) {
      await prisma.attachments.update({
        where: { id: att.id },
        data: { syncId: crypto.randomUUID() },
      });
    }
  }

  const seededAtts = await prisma.attachments.findMany({
    where: { accountId, syncId: { not: null } },
    select: {
      id: true,
      syncId: true,
      noteId: true,
      name: true,
      type: true,
      size: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { id: 'asc' },
  });

  const attRows = seededAtts
    .map((att) => {
      const syncId = att.syncId?.trim();
      if (!syncId) return null;
      const safeName = (att.name || 'upload.bin').replace(/[\\/]/g, '_');
      return {
        accountId,
        entityType: 'attachment',
        entityId: syncId,
        op: 'upsert',
        payloadJson: JSON.stringify({
          id: 0,
          sync_id: syncId,
          note_id: null,
          filename: att.name || safeName,
          mime: att.type || 'application/octet-stream',
          size: Number((att.size as any)?.toString?.() ?? att.size ?? 0) || 0,
          sha256: '',
          path: `${syncId}_${safeName}`,
          created_at: (att.createdAt ?? new Date()).toISOString(),
          updated_at: (att.updatedAt ?? new Date()).toISOString(),
          deleted_at: null,
        }),
        ts: att.updatedAt ?? att.createdAt ?? new Date(),
        deviceId: deviceId,
      };
    })
    .filter(Boolean) as Array<{ accountId: number; entityType: string; entityId: string; op: string; payloadJson: string; ts: Date; deviceId: string }>;

  if (!attRows.length) return;
  // Avoid huge single inserts.
  for (let i = 0; i < attRows.length; i += 1000) {
    await prisma.syncChanges.createMany({ data: attRows.slice(i, i + 1000) });
  }
}

export async function backfillNotesFromSyncChanges(
  prisma: PrismaClient,
  opts: { accountId?: number; maxOps?: number } = {},
): Promise<{ accounts: number; opsRead: number; notesApplied: number }> {
  const maxOps = opts.maxOps ?? 50_000;
  const accountIds =
    opts.accountId != null
      ? [opts.accountId]
      : (
        await prisma.syncChanges.groupBy({
          by: ['accountId'],
          where: { entityType: 'note' },
          _count: { _all: true },
        })
      ).map((r) => r.accountId);

  let opsRead = 0;
  let notesApplied = 0;

  for (const accountId of accountIds) {
    let cursor = 0;
    for (;;) {
      const rows = await prisma.syncChanges.findMany({
        where: { accountId, entityType: 'note', id: { gt: cursor } },
        orderBy: { id: 'asc' },
        take: 500,
      });
      if (!rows.length) break;

      cursor = rows[rows.length - 1].id;
      opsRead += rows.length;
      if (opsRead > maxOps) {
        return { accounts: accountIds.length, opsRead, notesApplied };
      }

      const chunk = rows.map((r) => ({
        entityType: r.entityType,
        entityId: r.entityId,
        op: r.op,
        payloadJson: r.payloadJson,
        ts: r.ts,
        deviceId: r.deviceId,
      }));
      const res = await materializeIncomingOps(prisma, accountId, chunk);
      notesApplied += res.notesApplied;
    }
  }

  return { accounts: accountIds.length, opsRead, notesApplied };
}

export async function rebuildTagsForAccount(
  prisma: PrismaClient,
  accountId: number,
  opts: { batchSize?: number } = {},
): Promise<{ notesProcessed: number; tagsDeleted: number }> {
  const batchSize = opts.batchSize ?? 200;
  let notesProcessed = 0;

  // Recompute tag relations for all notes.
  let cursor = 0;
  for (;;) {
    const notes = await prisma.notes.findMany({
      where: { accountId, id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: batchSize,
      select: { id: true, content: true },
    });
    if (!notes.length) break;
    cursor = notes[notes.length - 1].id;

    for (const note of notes) {
      await setNoteTagsFromContent(prisma, accountId, note.id, note.content ?? '');
      notesProcessed += 1;
    }
  }

  // Delete unused leaf tags (the tag list endpoint returns all tags, even unused).
  // Keep parent tags that still have children.
  let tagsDeleted = 0;
  for (;;) {
    const parents = await prisma.tag.findMany({
      where: { accountId, parent: { not: 0 } },
      select: { parent: true },
      distinct: ['parent'],
    });
    const parentIds = parents.map((p) => p.parent);

    const unusedLeaf = await prisma.tag.findMany({
      where: {
        accountId,
        tagsToNote: { none: {} },
        ...(parentIds.length ? { id: { notIn: parentIds } } : {}),
      },
      select: { id: true },
      take: 1000,
    });
    if (!unusedLeaf.length) break;

    const ids = unusedLeaf.map((t) => t.id);
    const del = await prisma.tag.deleteMany({ where: { id: { in: ids } } });
    tagsDeleted += del.count ?? 0;
  }

  return { notesProcessed, tagsDeleted };
}
