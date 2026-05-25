import { describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  cleanupMacAppBackups,
  parseArgs,
  applyCleanup,
} from "./cleanup_macos_app_backups.mjs";

async function mkTmpDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), "blinko-backup-test-"));
}

async function mkdirp(p) {
  await fs.mkdir(p, { recursive: true });
}

async function touchDir(p, mtimeMs) {
  await mkdirp(p);
  const d = new Date(mtimeMs);
  await fs.utimes(p, d, d);
}

describe("cleanup_macos_app_backups", () => {
  test("parseArgs defaults and flags", () => {
    const d = parseArgs([]);
    expect(d.dir).toBe("/Applications");
    expect(d.app).toBe("Blinko");
    expect(d.keep).toBe(0);
    expect(d.apply).toBe(false);

    const x = parseArgs(["--dir", "/X", "--app", "Foo", "--keep", "2", "--apply"]);
    expect(x.dir).toBe("/X");
    expect(x.app).toBe("Foo");
    expect(x.keep).toBe(2);
    expect(x.apply).toBe(true);
  });

  test("dry-run plan does not delete anything", async () => {
    const dir = await mkTmpDir();
    const base = 1_700_000_000_000;

    await touchDir(path.join(dir, "Blinko.app"), base + 1);
    await touchDir(path.join(dir, "Blinko.app.bak-20260129004403"), base + 2);
    await touchDir(path.join(dir, "Blinko.app.bak-20260205-204759"), base + 3);

    const { plan } = await cleanupMacAppBackups({ dir, app: "Blinko", keep: 0, apply: false });
    expect(plan.keep.length).toBe(0);
    expect(plan.delete.length).toBe(2);

    // Should not delete Blinko.app, and should not delete in dry-run.
    const still1 = await fs.stat(path.join(dir, "Blinko.app"));
    expect(still1.isDirectory()).toBe(true);
    const still2 = await fs.stat(path.join(dir, "Blinko.app.bak-20260129004403"));
    expect(still2.isDirectory()).toBe(true);
  });

  test("apply deletes only planned backups (keeps newest N)", async () => {
    const dir = await mkTmpDir();
    const base = 1_700_000_000_000;

    const b1 = path.join(dir, "Blinko.app.bak-20260129004403");
    const b2 = path.join(dir, "Blinko.app.bak-20260205-204759");
    const b3 = path.join(dir, "Blinko.app.bak-20260205-220702");
    await touchDir(b1, base + 1);
    await touchDir(b2, base + 2);
    await touchDir(b3, base + 3);
    await touchDir(path.join(dir, "Blinko.app"), base + 999);

    const res = await cleanupMacAppBackups({ dir, app: "Blinko", keep: 1, apply: true });
    expect(res.plan.keep.length).toBe(1);
    expect(res.plan.delete.length).toBe(2);

    await applyCleanup(res.plan);

    // newest one should remain (mtimeMs highest)
    await expect(fs.stat(b3)).resolves.toBeTruthy();
    await expect(fs.stat(b2)).rejects.toThrow();
    await expect(fs.stat(b1)).rejects.toThrow();

    // Never deletes the live app.
    await expect(fs.stat(path.join(dir, "Blinko.app"))).resolves.toBeTruthy();
  });

  test("app name filter is respected", async () => {
    const dir = await mkTmpDir();
    const base = 1_700_000_000_000;

    await touchDir(path.join(dir, "Blinko.app.bak-1"), base + 1);
    await touchDir(path.join(dir, "Other.app.bak-1"), base + 2);

    const res = await cleanupMacAppBackups({ dir, app: "Other", keep: 0, apply: false });
    expect(res.plan.delete.length).toBe(1);
    expect(res.plan.delete[0].endsWith("Other.app.bak-1")).toBe(true);
  });
});

