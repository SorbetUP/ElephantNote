import { describe, expect, test } from "bun:test";

import { materializeIncomingOps } from "../lib/sync_notes";

describe("sync_notes attachment materialization", () => {
  test("sets depth=0 and perfixPath='' when path is empty (listable placeholder)", async () => {
    const store: any[] = [];
    let nextId = 1;

    const prisma: any = {
      attachments: {
        findFirst: async ({ where }: any) =>
          store.find((r) => r.accountId === where.accountId && r.syncId === where.syncId) ?? null,
        update: async ({ where, data }: any) => {
          const idx = store.findIndex((r) => r.id === where.id);
          if (idx >= 0) store[idx] = { ...store[idx], ...data };
          return store[idx];
        },
        create: async ({ data }: any) => {
          const row = { id: nextId++, ...data };
          store.push(row);
          return row;
        },
        deleteMany: async () => ({ count: 0 }),
      },
    };

    await materializeIncomingOps(
      prisma,
      123,
      [
        {
          entityType: "attachment",
          entityId: "att-1",
          op: "upsert",
          payloadJson: JSON.stringify({
            sync_id: "att-1",
            filename: "a.png",
            mime: "image/png",
            size: 10,
            sha256: "",
            path: "att-1_a.png",
            created_at: new Date("2026-02-15T00:00:00Z").toISOString(),
            updated_at: new Date("2026-02-15T00:00:01Z").toISOString(),
            deleted_at: null,
          }),
          ts: new Date(),
          deviceId: "desktop-test",
        },
      ],
      { applyTags: false },
    );

    expect(store).toHaveLength(1);
    expect(store[0].path).toBe("");
    expect(store[0].depth).toBe(0);
    expect(store[0].perfixPath).toBe("");
  });

  test("does not overwrite existing perfixPath/depth set by server UI", async () => {
    const store: any[] = [
      {
        id: 1,
        accountId: 123,
        syncId: "att-2",
        path: "/api/file/foo/bar.png",
        perfixPath: "foo,bar",
        depth: 2,
        name: "bar.png",
        type: "image/png",
        size: 10,
      },
    ];

    const prisma: any = {
      attachments: {
        findFirst: async ({ where }: any) =>
          store.find((r) => r.accountId === where.accountId && r.syncId === where.syncId) ?? null,
        update: async ({ where, data }: any) => {
          const idx = store.findIndex((r) => r.id === where.id);
          if (idx >= 0) store[idx] = { ...store[idx], ...data };
          return store[idx];
        },
        create: async () => {
          throw new Error("unexpected create");
        },
        deleteMany: async () => ({ count: 0 }),
      },
    };

    await materializeIncomingOps(
      prisma,
      123,
      [
        {
          entityType: "attachment",
          entityId: "att-2",
          op: "upsert",
          payloadJson: JSON.stringify({
            sync_id: "att-2",
            filename: "bar.png",
            mime: "image/png",
            size: 11,
            sha256: "",
            path: "att-2_bar.png",
            created_at: new Date("2026-02-15T00:00:00Z").toISOString(),
            updated_at: new Date("2026-02-15T00:00:01Z").toISOString(),
            deleted_at: null,
          }),
          ts: new Date(),
          deviceId: "desktop-test",
        },
      ],
      { applyTags: false },
    );

    expect(store[0].perfixPath).toBe("foo,bar");
    expect(store[0].depth).toBe(2);
  });
});

