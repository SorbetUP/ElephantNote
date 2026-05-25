import crypto from "crypto";
import type { PrismaClient } from "@prisma/client";

const INSTANCE_ID_KEY = "server_instance_id";

let cachedInstanceId: string | null = null;
let inflight: Promise<string> | null = null;

const normalizeInstanceId = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  if (v.length > 128) return null;
  return v;
};

export async function getServerInstanceId(prisma: PrismaClient): Promise<string> {
  if (cachedInstanceId) return cachedInstanceId;
  if (inflight) return await inflight;

  inflight = (async () => {
    const existing = await prisma.config.findFirst({
      where: { key: INSTANCE_ID_KEY, userId: null },
      select: { id: true, config: true },
    });

    const fromDb = normalizeInstanceId((existing?.config as any)?.value);
    if (fromDb) {
      cachedInstanceId = fromDb;
      return fromDb;
    }

    const next = crypto.randomUUID();
    if (existing?.id) {
      await prisma.config.update({
        where: { id: existing.id },
        data: { config: { value: next } },
      });
    } else {
      await prisma.config.create({
        data: { key: INSTANCE_ID_KEY, userId: null, config: { value: next } },
      });
    }
    cachedInstanceId = next;
    return next;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

