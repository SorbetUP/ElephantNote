import fs from "fs/promises";
import path from "path";
import type { PrismaClient } from "@prisma/client";
import { materializeIncomingOps, seedInitialSyncSnapshot } from "./sync_notes";
import {
  ensureServerSyncState,
  getServerSyncSettings,
  updateServerSyncState,
  type ServerSyncEndpoint,
  type ServerSyncEndpointState,
} from "./serverSyncConfig";
import { FileService } from "./files";
import { UPLOAD_FILE_PATH } from "@shared/lib/pathConstant";

type RemoteSyncOp = {
  id: number;
  entity_type: string;
  entity_id: string;
  op: string;
  payload_json: string;
  ts: string;
  device_id: string;
};

type RemoteChanges = {
  cursor: string | null;
  ops: RemoteSyncOp[];
  reset?: boolean;
};

const normalizeBaseUrl = (raw: string) => raw.replace(/\/+$/, "");

const buildUrl = (base: string, pathname: string, query?: Record<string, string>) => {
  const u = new URL(pathname, normalizeBaseUrl(base) + "/");
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      u.searchParams.set(k, v);
    }
  }
  return u.toString();
};

const fetchJson = async <T>(
  url: string,
  opts: { method?: string; token: string; body?: any; timeoutMs?: number } = { token: "" },
): Promise<{ status: number; json: T }> => {
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as T;
    return { status: res.status, json };
  } finally {
    clearTimeout(t);
  }
};

const pullRemoteChanges = async ({
  endpoint,
  since,
  deviceId,
  limit,
}: {
  endpoint: ServerSyncEndpoint;
  since: string | null;
  deviceId: string;
  limit: number;
}): Promise<RemoteChanges> => {
  const url = buildUrl(endpoint.url, "/changes", {
    since: since ?? "0",
    device_id: deviceId,
    include_self: "false",
    limit: String(limit),
  });
  const { status, json } = await fetchJson<RemoteChanges>(url, { token: endpoint.token });
  if (status < 200 || status >= 300 || !json) {
    throw new Error(`Pull ops failed with status ${status}`);
  }
  return json;
};

const peekRemoteCursor = async ({
  endpoint,
  deviceId,
}: {
  endpoint: ServerSyncEndpoint;
  deviceId: string;
}): Promise<string | null> => {
  const url = buildUrl(endpoint.url, "/changes", {
    since: "0",
    device_id: deviceId,
    include_self: "false",
    limit: "0",
  });
  const { status, json } = await fetchJson<RemoteChanges>(url, { token: endpoint.token });
  if (status < 200 || status >= 300 || !json) {
    throw new Error(`Peek cursor failed with status ${status}`);
  }
  return json.cursor ?? null;
};

const pushLocalOps = async ({
  endpoint,
  ops,
  overrideDeviceId,
}: {
  endpoint: ServerSyncEndpoint;
  ops: Array<{
    entityType: string;
    entityId: string;
    op: string;
    payloadJson: string;
    ts: Date;
    deviceId: string;
  }>;
  overrideDeviceId: string;
}): Promise<void> => {
  const url = buildUrl(endpoint.url, "/changes");
  const body = {
    ops: ops.map((o) => ({
      entity_type: o.entityType,
      entity_id: o.entityId,
      op: o.op,
      payload_json: o.payloadJson,
      ts: o.ts.toISOString(),
      // Important: use a stable per-server sync device id so remote can exclude on pull.
      device_id: overrideDeviceId,
    })),
  };
  const { status } = await fetchJson<any>(url, { method: "POST", token: endpoint.token, body, timeoutMs: 60_000 });
  if (status < 200 || status >= 300) {
    throw new Error(`Push ops failed with status ${status}`);
  }
};

const safeJsonParse = (value: string): any => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const sanitizeName = (name: string) => (name || "upload.bin").replace(/[\\/]/g, "_");

const resolveSyncAttachmentRelativePath = (syncId: string, filename: string, payloadPath?: string) => {
  const safe = sanitizeName(filename);
  const fromPayload = typeof payloadPath === "string" ? payloadPath.trim() : "";
  if (fromPayload && !fromPayload.includes("..") && !fromPayload.includes("/") && !fromPayload.includes("\\")) {
    return fromPayload;
  }
  return `${syncId}_${safe}`;
};

const ensureLocalAttachmentBinary = async ({
  prisma,
  accountId,
  syncId,
  filename,
  mime,
  size,
  relativePath,
  remoteEndpoint,
}: {
  prisma: PrismaClient;
  accountId: number;
  syncId: string;
  filename: string;
  mime: string;
  size: number;
  relativePath: string;
  remoteEndpoint: ServerSyncEndpoint;
}): Promise<void> => {
  const existing = await prisma.attachments.findFirst({
    where: { accountId, syncId },
    select: { id: true, path: true },
  });

  if (existing?.path) {
    // If file exists on disk, do nothing.
    try {
      const rel = existing.path.replace("/api/file/", "");
      const abs = FileService.validateAndResolvePath(rel, UPLOAD_FILE_PATH, false);
      await fs.stat(abs);
      return;
    } catch {
      // fallthrough: missing on disk, re-download
    }
  }

  const downloadUrl = buildUrl(remoteEndpoint.url, `/api/file/by-sync-id/${encodeURIComponent(syncId)}`);
  const res = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${remoteEndpoint.token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Download attachment failed (${res.status}) for syncId=${syncId}`);
  }

  const arrayBuf = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuf);

  const abs = FileService.validateAndResolvePath(relativePath, UPLOAD_FILE_PATH, false);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf);

  // Update/insert attachment record to point to this binary.
  await prisma.attachments.updateMany({
    where: { accountId, syncId },
    data: {
      path: `/api/file/${relativePath}`,
      name: sanitizeName(filename),
      type: mime || "application/octet-stream",
      size: size || buf.byteLength,
    },
  });
};

const uploadAttachmentToRemote = async ({
  prisma,
  accountId,
  syncId,
  endpoint,
}: {
  prisma: PrismaClient;
  accountId: number;
  syncId: string;
  endpoint: ServerSyncEndpoint;
}): Promise<void> => {
  const att = await prisma.attachments.findFirst({
    where: { accountId, syncId },
    select: { path: true, name: true, type: true },
  });
  if (!att?.path) return;

  // If remote already has it, skip.
  const probeUrl = buildUrl(endpoint.url, `/api/file/by-sync-id/${encodeURIComponent(syncId)}`);
  const probe = await fetch(probeUrl, { headers: { Authorization: `Bearer ${endpoint.token}` } });
  if (probe.ok) return;
  if (probe.status !== 404) {
    throw new Error(`Remote probe failed (${probe.status}) for syncId=${syncId}`);
  }

  const buffer = await FileService.getFileBuffer(att.path);
  const fileName = sanitizeName(att.name || "upload.bin");
  const mimeType = (att.type || "application/octet-stream").trim() || "application/octet-stream";

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), fileName);
  form.append("sync_id", syncId);
  form.append("skip_sync_emit", "true");

  const uploadUrl = buildUrl(endpoint.url, "/api/file/upload");
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${endpoint.token}` },
    body: form as any,
  });
  if (!res.ok) {
    throw new Error(`Remote upload failed (${res.status}) for syncId=${syncId}`);
  }
};

export async function runServerSyncOnce(prisma: PrismaClient, opts: { accountId?: number } = {}) {
  const accountIds =
    opts.accountId != null
      ? [opts.accountId]
      : (
          await prisma.config.findMany({
            where: { key: "server_sync_settings", userId: { not: null } },
            select: { userId: true },
          })
        )
          .map((r) => r.userId)
          .filter((v): v is number => typeof v === "number");

  const results: any[] = [];

  const force = (opts as any)?.force === true;

  for (const accountId of Array.from(new Set(accountIds))) {
    const settings = await getServerSyncSettings(prisma, accountId);
    if (!settings.enabled) continue;
    if (!settings.endpoints.length) continue;

    const state = await ensureServerSyncState(prisma, accountId);

    for (const endpoint of settings.endpoints) {
      if (endpoint.enabled === false) continue;

      const endpointId = endpoint.id;
      const prev: ServerSyncEndpointState = state.endpoints[endpointId] ?? {
        lastPullCursor: null,
        lastPushCursor: null,
        lastSyncAt: null,
        status: null,
      };

      const started = Date.now();
      try {
        if (!endpoint.url || !endpoint.url.trim() || !endpoint.token || !endpoint.token.trim()) {
          await updateServerSyncState(prisma, accountId, endpointId, {
            ...prev,
            lastSyncAt: new Date().toISOString(),
            status: "error: Missing url or token",
          });
          continue;
        }

        if (!force && settings.intervalMinutes && settings.intervalMinutes > 0 && prev.lastSyncAt) {
          const last = Date.parse(prev.lastSyncAt);
          if (Number.isFinite(last)) {
            const minMs = settings.intervalMinutes * 60_000;
            if (Date.now() - last < minMs) {
              continue;
            }
          }
        }

        // If local sync log is empty, seed it once so we can push a snapshot.
        const hasAny = await prisma.syncChanges.count({ where: { accountId } });
        if (hasAny === 0) {
          await seedInitialSyncSnapshot(prisma, accountId);
        }

        // Pull
        const pulled = await pullRemoteChanges({
          endpoint,
          since: prev.lastPullCursor,
          deviceId: state.deviceId,
          limit: settings.limit,
        });

        if (pulled.reset) {
          // Remote reset detected -> push local snapshot (from 0).
          let pushCursor = 0;
          for (;;) {
            const chunk = await prisma.syncChanges.findMany({
              where: { accountId, id: { gt: pushCursor } },
              orderBy: { id: "asc" },
              take: 500,
            });
            if (!chunk.length) break;
            pushCursor = chunk[chunk.length - 1]!.id;
            await pushLocalOps({
              endpoint,
              ops: chunk.map((r) => ({
                entityType: r.entityType,
                entityId: r.entityId,
                op: r.op,
                payloadJson: r.payloadJson,
                ts: r.ts,
                deviceId: r.deviceId,
              })),
              overrideDeviceId: state.deviceId,
            });
          }
          const nextRemoteCursor = await peekRemoteCursor({ endpoint, deviceId: state.deviceId });
          await updateServerSyncState(prisma, accountId, (s) => ({
            ...s,
            endpoints: {
              ...s.endpoints,
              [endpointId]: {
                ...prev,
                lastPullCursor: nextRemoteCursor,
                lastPushCursor: pushCursor,
                lastSyncAt: new Date().toISOString(),
                status: "remote_reset_reseeded",
              },
            },
          }));
          results.push({ accountId, endpointId, ok: true, reset: true, durationMs: Date.now() - started });
          continue;
        }

        const incomingOps = (pulled.ops || []).map((o) => ({
          accountId,
          entityType: o.entity_type,
          entityId: o.entity_id,
          op: o.op,
          payloadJson: typeof o.payload_json === "string" ? o.payload_json : JSON.stringify(o.payload_json ?? {}),
          ts: new Date(o.ts),
          deviceId: o.device_id,
        }));

        if (incomingOps.length) {
          await prisma.syncChanges.createMany({ data: incomingOps });
          await materializeIncomingOps(
            prisma,
            accountId,
            incomingOps.map((o) => ({
              entityType: o.entityType,
              entityId: o.entityId,
              op: o.op,
              payloadJson: o.payloadJson,
              ts: o.ts,
              deviceId: o.deviceId,
            })),
            { applyTags: incomingOps.length <= 50 },
          );

          // Fetch binaries for attachment upserts.
          for (const op of incomingOps) {
            if (op.entityType !== "attachment" || op.op === "delete") continue;
            const payload = safeJsonParse(op.payloadJson);
            const syncId = String(payload?.sync_id ?? payload?.syncId ?? op.entityId ?? "").trim();
            if (!syncId) continue;
            const filename = String(payload?.filename ?? payload?.name ?? "").trim() || "upload.bin";
            const mime = String(payload?.mime ?? payload?.type ?? "").trim() || "application/octet-stream";
            const size = Number(payload?.size ?? 0) || 0;
            const relativePath = resolveSyncAttachmentRelativePath(syncId, filename, payload?.path);
            await ensureLocalAttachmentBinary({
              prisma,
              accountId,
              syncId,
              filename,
              mime,
              size,
              relativePath,
              remoteEndpoint: endpoint,
            });
          }
        }

        // Push
        let pushCursor = prev.lastPushCursor ?? 0;
        for (;;) {
          const chunk = await prisma.syncChanges.findMany({
            where: { accountId, id: { gt: pushCursor } },
            orderBy: { id: "asc" },
            take: 200,
          });
          if (!chunk.length) break;
          pushCursor = chunk[chunk.length - 1]!.id;

          await pushLocalOps({
            endpoint,
            ops: chunk.map((r) => ({
              entityType: r.entityType,
              entityId: r.entityId,
              op: r.op,
              payloadJson: r.payloadJson,
              ts: r.ts,
              deviceId: r.deviceId,
            })),
            overrideDeviceId: state.deviceId,
          });

          // Ensure remote receives binaries for attachment upserts.
          for (const r of chunk) {
            if (r.entityType !== "attachment" || r.op === "delete") continue;
            await uploadAttachmentToRemote({ prisma, accountId, syncId: r.entityId, endpoint });
          }
        }

        await updateServerSyncState(prisma, accountId, (s) => ({
          ...s,
          endpoints: {
            ...s.endpoints,
            [endpointId]: {
              ...prev,
              lastPullCursor: pulled.cursor ?? prev.lastPullCursor,
              lastPushCursor: pushCursor,
              lastSyncAt: new Date().toISOString(),
              status: "ok",
            },
          },
        }));

        results.push({
          accountId,
          endpointId,
          ok: true,
          pulled: incomingOps.length,
          durationMs: Date.now() - started,
        });
      } catch (err: any) {
        const msg = String(err?.message || err || "unknown error");
        await updateServerSyncState(prisma, accountId, (s) => ({
          ...s,
          endpoints: {
            ...s.endpoints,
            [endpointId]: {
              ...prev,
              lastSyncAt: new Date().toISOString(),
              status: `error: ${msg}`,
            },
          },
        }));
        results.push({ accountId, endpointId, ok: false, error: msg, durationMs: Date.now() - started });
        continue;
      }
    }
  }

  return results;
}
