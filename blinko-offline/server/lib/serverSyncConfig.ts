import crypto from "crypto";
import type { PrismaClient } from "@prisma/client";
import { getServerInstanceId } from "./serverInstance";

export type ServerSyncEndpoint = {
  id: string;
  url: string;
  token: string;
  enabled?: boolean;
};

export type ServerSyncSettings = {
  enabled: boolean;
  intervalMinutes: number;
  limit: number;
  endpoints: ServerSyncEndpoint[];
};

export type ServerSyncEndpointState = {
  lastPullCursor: string | null; // remote sync_changes id cursor
  lastPushCursor: number | null; // local sync_changes id cursor
  lastSyncAt: string | null; // RFC3339
  status: string | null;
};

export type ServerSyncState = {
  deviceId: string;
  endpoints: Record<string, ServerSyncEndpointState>;
};

const SETTINGS_KEY = "server_sync_settings";
const STATE_KEY = "server_sync_state";

const defaultSettings = (): ServerSyncSettings => ({
  enabled: false,
  intervalMinutes: 5,
  limit: 500,
  endpoints: [],
});

const normalizeUrl = (raw: unknown): string => {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return "";
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    // normalize to origin + optional path (but keep no trailing slash)
    const base = (u.origin + u.pathname).replace(/\/+$/, "");
    return base || "";
  } catch {
    return "";
  }
};

const normalizeId = (raw: unknown): string => {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return "";
  return v.slice(0, 64);
};

const normalizeToken = (raw: unknown): string => {
  const v = typeof raw === "string" ? raw.trim() : "";
  return v;
};

async function getJsonConfig(
  prisma: PrismaClient,
  key: string,
  userId: number,
): Promise<any | null> {
  const row = await prisma.config.findFirst({
    where: { key, userId },
    select: { id: true, config: true },
  });
  if (!row) return null;
  return row.config ?? null;
}

async function upsertJsonConfig(
  prisma: PrismaClient,
  key: string,
  userId: number,
  value: any,
): Promise<void> {
  const existing = await prisma.config.findFirst({
    where: { key, userId },
    select: { id: true },
  });
  if (existing?.id) {
    await prisma.config.update({ where: { id: existing.id }, data: { config: value } });
    return;
  }
  await prisma.config.create({ data: { key, userId, config: value } });
}

export async function getServerSyncSettings(
  prisma: PrismaClient,
  accountId: number,
): Promise<ServerSyncSettings> {
  const raw = await getJsonConfig(prisma, SETTINGS_KEY, accountId);
  const base = defaultSettings();
  if (!raw || typeof raw !== "object") return base;

  const enabled = Boolean((raw as any).enabled);
  const intervalMinutes = Math.max(1, Math.min(60, Number((raw as any).intervalMinutes ?? 5) || 5));
  const limit = Math.max(0, Math.min(500, Number((raw as any).limit ?? 500) || 500));
  const endpointsRaw = Array.isArray((raw as any).endpoints) ? (raw as any).endpoints : [];

  const endpoints: ServerSyncEndpoint[] = [];
  const seen = new Set<string>();
  for (const e of endpointsRaw) {
    const id = normalizeId(e?.id);
    const url = normalizeUrl(e?.url);
    const token = normalizeToken(e?.token);
    const isEnabled = e?.enabled === undefined ? true : Boolean(e.enabled);
    if (!id || !url) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    endpoints.push({ id, url, token, enabled: isEnabled });
  }

  return { enabled, intervalMinutes, limit, endpoints };
}

export async function setServerSyncSettings(
  prisma: PrismaClient,
  accountId: number,
  next: Partial<ServerSyncSettings>,
): Promise<ServerSyncSettings> {
  const current = await getServerSyncSettings(prisma, accountId);
  const merged: ServerSyncSettings = {
    enabled: next.enabled ?? current.enabled,
    intervalMinutes: next.intervalMinutes ?? current.intervalMinutes,
    limit: next.limit ?? current.limit,
    endpoints: Array.isArray(next.endpoints) ? next.endpoints : current.endpoints,
  };

  const endpoints: ServerSyncEndpoint[] = [];
  const seen = new Set<string>();
  for (const e of merged.endpoints) {
    const id = normalizeId(e?.id);
    const url = normalizeUrl(e?.url);
    const token = normalizeToken(e?.token);
    const isEnabled = e?.enabled === undefined ? true : Boolean(e.enabled);
    if (!id || !url) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    endpoints.push({ id, url, token, enabled: isEnabled });
  }

  const value = {
    enabled: Boolean(merged.enabled),
    intervalMinutes: Math.max(1, Math.min(60, Number(merged.intervalMinutes ?? 5) || 5)),
    limit: Math.max(0, Math.min(500, Number(merged.limit ?? 500) || 500)),
    endpoints,
  };

  await upsertJsonConfig(prisma, SETTINGS_KEY, accountId, value);
  return value as ServerSyncSettings;
}

const defaultEndpointState = (): ServerSyncEndpointState => ({
  lastPullCursor: null,
  lastPushCursor: null,
  lastSyncAt: null,
  status: null,
});

export async function getServerSyncState(
  prisma: PrismaClient,
  accountId: number,
): Promise<ServerSyncState | null> {
  const raw = await getJsonConfig(prisma, STATE_KEY, accountId);
  if (!raw || typeof raw !== "object") return null;
  const deviceId = typeof (raw as any).deviceId === "string" ? (raw as any).deviceId : "";
  const endpointsRaw = (raw as any).endpoints;
  const endpoints: Record<string, ServerSyncEndpointState> = {};
  if (endpointsRaw && typeof endpointsRaw === "object") {
    for (const [k, v] of Object.entries(endpointsRaw)) {
      if (!k) continue;
      const obj: any = v || {};
      endpoints[k] = {
        lastPullCursor: typeof obj.lastPullCursor === "string" ? obj.lastPullCursor : null,
        lastPushCursor: typeof obj.lastPushCursor === "number" ? obj.lastPushCursor : null,
        lastSyncAt: typeof obj.lastSyncAt === "string" ? obj.lastSyncAt : null,
        status: typeof obj.status === "string" ? obj.status : null,
      };
    }
  }
  if (!deviceId) return null;
  return { deviceId, endpoints };
}

export async function ensureServerSyncState(
  prisma: PrismaClient,
  accountId: number,
): Promise<ServerSyncState> {
  const existing = await getServerSyncState(prisma, accountId);
  if (existing) return existing;

  const instanceId = await getServerInstanceId(prisma);
  const deviceId = `server-sync:${instanceId}:${accountId}:${crypto.randomUUID()}`;
  const value: ServerSyncState = { deviceId, endpoints: {} };
  await upsertJsonConfig(prisma, STATE_KEY, accountId, value);
  return value;
}

export async function updateServerSyncState(
  prisma: PrismaClient,
  accountId: number,
  updater: (state: ServerSyncState) => ServerSyncState,
): Promise<ServerSyncState> {
  const current = await ensureServerSyncState(prisma, accountId);
  const next = updater(current);
  await upsertJsonConfig(prisma, STATE_KEY, accountId, next);
  return next;
}

export const __internal__ = {
  SETTINGS_KEY,
  STATE_KEY,
  defaultSettings,
  defaultEndpointState,
};
