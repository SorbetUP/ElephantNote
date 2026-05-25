import express from "express";
import { getTokenFromRequest } from "../lib/helper";
import { prisma } from "../prisma";
import {
  ensureServerSyncState,
  getServerSyncSettings,
  getServerSyncState,
  setServerSyncSettings,
} from "../lib/serverSyncConfig";
import { runServerSyncOnce } from "../lib/serverSyncRunner";

const router = express.Router();
router.use(express.json({ limit: "2mb" }));

const requireSuperadmin = async (req: any, res: any, next: any) => {
  const token = await getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  if (token.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
  req.user = token;
  next();
};

router.get("/settings", requireSuperadmin, async (req: any, res) => {
  const accountId = Number(req.user.id);
  const settings = await getServerSyncSettings(prisma, accountId);
  const state = (await getServerSyncState(prisma, accountId)) ?? (await ensureServerSyncState(prisma, accountId));
  return res.json({ settings, state });
});

router.put("/settings", requireSuperadmin, async (req: any, res) => {
  const accountId = Number(req.user.id);
  const next = await setServerSyncSettings(prisma, accountId, req.body ?? {});
  const state = (await getServerSyncState(prisma, accountId)) ?? (await ensureServerSyncState(prisma, accountId));
  return res.json({ settings: next, state });
});

router.get("/status", requireSuperadmin, async (req: any, res) => {
  const accountId = Number(req.user.id);
  const settings = await getServerSyncSettings(prisma, accountId);
  const state = (await getServerSyncState(prisma, accountId)) ?? (await ensureServerSyncState(prisma, accountId));
  return res.json({ enabled: settings.enabled, endpoints: settings.endpoints, state });
});

router.post("/test", requireSuperadmin, async (req: any, res) => {
  const body = req.body ?? {};
  const url = typeof body.url === "string" ? body.url.trim().replace(/\/+$/, "") : "";
  const token = typeof body.token === "string" ? body.token.trim().replace(/^bearer\s+/i, "") : "";

  if (!url || !(url.startsWith("http://") || url.startsWith("https://"))) {
    return res.status(400).json({ error: "Invalid url" });
  }
  if (!token) {
    return res.status(400).json({ error: "Token required" });
  }

  const withTimeout = async (ms: number, fn: (signal: AbortSignal) => Promise<Response>) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);
    try {
      return await fn(controller.signal);
    } finally {
      clearTimeout(t);
    }
  };

  try {
    const healthUrl = new URL("/health", url + "/").toString();
    const healthRes = await withTimeout(10_000, (signal) => fetch(healthUrl, { signal }));
    if (!healthRes.ok) {
      return res.status(400).json({ error: `Remote /health failed (${healthRes.status})` });
    }

    const changesUrl = new URL("/changes", url + "/");
    changesUrl.searchParams.set("since", "0");
    changesUrl.searchParams.set("limit", "0");
    changesUrl.searchParams.set("include_self", "true");
    changesUrl.searchParams.set("device_id", "server-sync-test");
    const changesRes = await withTimeout(15_000, (signal) =>
      fetch(changesUrl.toString(), {
        signal,
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    if (!changesRes.ok) {
      const hint = changesRes.status === 401 ? "Unauthorized" : "Failed";
      return res.status(changesRes.status).json({ error: `Remote /changes ${hint} (${changesRes.status})` });
    }

    return res.json({ ok: true, message: "OK" });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Test failed" });
  }
});

router.post("/now", requireSuperadmin, async (req: any, res) => {
  const accountId = Number(req.user.id);
  const result = await runServerSyncOnce(prisma, { accountId, force: true } as any);
  return res.json({ ok: true, result });
});

export default router;
