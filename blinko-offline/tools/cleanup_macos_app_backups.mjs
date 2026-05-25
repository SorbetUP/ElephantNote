#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const USAGE = `Usage:
  node tools/cleanup_macos_app_backups.mjs [--dir /Applications] [--app Blinko] [--keep N] [--apply]

Notes:
  - By default this is a dry-run (prints what it would delete).
  - Backups are matched as "<App>.app.bak-*".
  - The current "<App>.app" is never deleted by this tool.
`;

export function parseArgs(argv) {
  const out = {
    dir: "/Applications",
    app: "Blinko",
    keep: 0,
    apply: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--dir") out.dir = argv[++i];
    else if (a === "--app") out.app = argv[++i];
    else if (a === "--keep") out.keep = Number(argv[++i] ?? "0");
    else if (a === "--apply" || a === "--delete") out.apply = true;
    else if (a === "--dry-run") out.apply = false;
    else throw new Error(`Unknown arg: ${a}\n\n${USAGE}`);
  }

  if (!Number.isFinite(out.keep) || out.keep < 0) {
    throw new Error(`--keep must be >= 0 (got: ${out.keep})`);
  }
  if (!out.dir || typeof out.dir !== "string") throw new Error("--dir is required");
  if (!out.app || typeof out.app !== "string") throw new Error("--app is required");

  return out;
}

export async function listAppBackups({ dir, app }) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const prefix = `${app}.app.bak-`;

  const candidates = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (!ent.name.startsWith(prefix)) continue;
    candidates.push(path.join(dir, ent.name));
  }

  const withStats = await Promise.all(
    candidates.map(async (p) => {
      const st = await fs.stat(p);
      return { path: p, mtimeMs: st.mtimeMs, name: path.basename(p) };
    })
  );

  withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return withStats;
}

export function planCleanup(backups, keep) {
  const keepList = backups.slice(0, keep).map((b) => b.path);
  const deleteList = backups.slice(keep).map((b) => b.path);
  return { keep: keepList, delete: deleteList };
}

export async function applyCleanup(plan) {
  // rm -rf behavior, but only for items we explicitly planned to delete.
  await Promise.all(plan.delete.map((p) => fs.rm(p, { recursive: true, force: true })));
}

export async function cleanupMacAppBackups(opts) {
  const backups = await listAppBackups(opts);
  const plan = planCleanup(backups, opts.keep);

  return { backups, plan };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    process.exit(0);
  }

  const { backups, plan } = await cleanupMacAppBackups(opts);
  console.log(`dir: ${opts.dir}`);
  console.log(`app: ${opts.app}`);
  console.log(`found backups: ${backups.length}`);
  console.log(`keep: ${plan.keep.length}`);
  console.log(`delete: ${plan.delete.length}`);

  if (plan.delete.length) {
    for (const p of plan.delete) console.log(`DELETE ${p}`);
  }

  if (!opts.apply) {
    console.log("dry-run: no changes made (pass --apply to delete)");
    return;
  }

  await applyCleanup(plan);
  console.log("ok: backups deleted");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err?.stack || err);
    process.exit(1);
  });
}

