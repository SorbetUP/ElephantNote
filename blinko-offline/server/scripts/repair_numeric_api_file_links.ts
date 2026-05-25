import { prisma } from "../prisma";

type Args = {
  apply: boolean;
  dryRun: boolean;
  limitNotes: number | null;
  accountId: number | null;
};

const parseArgs = (): Args => {
  const argv = process.argv.slice(2);
  const has = (flag: string) => argv.includes(flag);
  const readValue = (flag: string) => {
    const idx = argv.indexOf(flag);
    if (idx === -1) return null;
    const v = argv[idx + 1];
    if (!v || v.startsWith("--")) return null;
    return v;
  };

  const apply = has("--apply");
  const dryRun = !apply || has("--dry-run");

  const limitRaw = readValue("--limit");
  const limitNotes =
    limitRaw && /^\d+$/.test(limitRaw) ? Math.max(0, Number(limitRaw)) : null;

  const accountRaw = readValue("--account-id");
  const accountId =
    accountRaw && /^\d+$/.test(accountRaw) ? Number(accountRaw) : null;

  return { apply, dryRun, limitNotes, accountId };
};

const isLikelyFilename = (value: string) => {
  const v = (value || "").trim();
  if (!v) return false;
  if (v.length > 300) return false;
  if (v.includes("\n")) return false;
  const last = v.split("/").pop() || v;
  return /\.[a-z0-9]{2,8}$/i.test(last);
};

const parseFilename = (
  value: string,
): { prefix: string; ext: string } | null => {
  if (!isLikelyFilename(value)) return null;
  const last = (value || "").trim().split("/").pop() || "";
  const clean = last.split("?")[0]?.trim() || "";
  const m = /^(.+?)(\.[a-z0-9]{2,8})$/i.exec(clean);
  if (!m) return null;
  return { prefix: m[1]!, ext: m[2]!.toLowerCase() };
};

type FoundAttachment = {
  id: number;
  path: string;
  name: string;
  noteId: number | null;
  accountId: number | null;
  updatedAt: Date;
  note: { accountId: number } | null;
};

const isOwnedByAccount = (att: FoundAttachment, accountId: number) => {
  if (att.accountId === accountId) return true;
  if (att.note?.accountId === accountId) return true;
  return false;
};

const resolveAttachmentForNumericLink = async ({
  numericId,
  altOrText,
  noteAccountId,
  cacheByNumericId,
  cacheByAltPrefix,
}: {
  numericId: number;
  altOrText: string;
  noteAccountId: number;
  cacheByNumericId: Map<number, FoundAttachment | null>;
  cacheByAltPrefix: Map<string, FoundAttachment | null>;
}): Promise<FoundAttachment | null> => {
  const cachedDirect = cacheByNumericId.get(numericId);
  if (cachedDirect !== undefined) return cachedDirect;

  const direct = (await prisma.attachments.findUnique({
    where: { id: numericId },
    select: {
      id: true,
      path: true,
      name: true,
      noteId: true,
      accountId: true,
      updatedAt: true,
      note: { select: { accountId: true } },
    },
  })) as FoundAttachment | null;

  if (direct && isOwnedByAccount(direct, noteAccountId)) {
    cacheByNumericId.set(numericId, direct);
    return direct;
  }

  // Fallback: try resolving via ALT/TEXT filename prefix.
  const parsed = parseFilename(altOrText);
  if (!parsed) {
    cacheByNumericId.set(numericId, null);
    return null;
  }

  const cacheKey = `${noteAccountId}:${parsed.prefix.toLowerCase()}${parsed.ext}`;
  const cachedAlt = cacheByAltPrefix.get(cacheKey);
  if (cachedAlt !== undefined) {
    cacheByNumericId.set(numericId, cachedAlt);
    return cachedAlt;
  }

  const candidates = (await prisma.attachments.findMany({
    where: {
      OR: [{ accountId: noteAccountId }, { note: { accountId: noteAccountId } }],
      AND: [
        { name: { startsWith: parsed.prefix, mode: "insensitive" } },
        { name: { endsWith: parsed.ext, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      path: true,
      name: true,
      noteId: true,
      accountId: true,
      updatedAt: true,
      note: { select: { accountId: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 5,
  })) as FoundAttachment[];

  const best = candidates.find((c) => isOwnedByAccount(c, noteAccountId)) || null;
  cacheByAltPrefix.set(cacheKey, best);
  cacheByNumericId.set(numericId, best);
  return best;
};

type Match = {
  kind: "md-image" | "md-link" | "html-img";
  index: number;
  full: string;
  display: string;
  numericId: number;
  qs: string;
  url: string;
  urlStart: number;
  urlEnd: number;
};

const findMatches = (content: string): Match[] => {
  const out: Match[] = [];

  const mdImage = /!\[([^\]]*)\]\(\/api\/file\/(\d+)(\?[^)]*)?\)/g;
  const mdLink = /(?<!!)\[([^\]]*)\]\(\/api\/file\/(\d+)(\?[^)]*)?\)/g;
  const htmlImg =
    /(<img\b[^>]*?\bsrc=["'])(\/api\/file\/(\d+)(\?[^"']*)?)(["'][^>]*>)/gi;

  for (const m of content.matchAll(mdImage)) {
    const full = m[0]!;
    const display = m[1] || "";
    const idStr = m[2] || "";
    const qs = m[3] || "";
    const numericId = Number(idStr);
    if (!Number.isFinite(numericId)) continue;
    const url = `/api/file/${idStr}${qs}`;
    const rel = full.indexOf(url);
    if (m.index == null || rel === -1) continue;
    const urlStart = m.index + rel;
    const urlEnd = urlStart + url.length;
    out.push({
      kind: "md-image",
      index: m.index,
      full,
      display,
      numericId,
      qs,
      url,
      urlStart,
      urlEnd,
    });
  }

  for (const m of content.matchAll(mdLink)) {
    const full = m[0]!;
    const display = m[1] || "";
    const idStr = m[2] || "";
    const qs = m[3] || "";
    const numericId = Number(idStr);
    if (!Number.isFinite(numericId)) continue;
    const url = `/api/file/${idStr}${qs}`;
    const rel = full.indexOf(url);
    if (m.index == null || rel === -1) continue;
    const urlStart = m.index + rel;
    const urlEnd = urlStart + url.length;
    out.push({
      kind: "md-link",
      index: m.index,
      full,
      display,
      numericId,
      qs,
      url,
      urlStart,
      urlEnd,
    });
  }

  for (const m of content.matchAll(htmlImg)) {
    const prefix = m[1] || "";
    const url = m[2] || "";
    const idStr = m[3] || "";
    const qs = m[4] || "";
    const numericId = Number(idStr);
    if (!Number.isFinite(numericId)) continue;
    if (m.index == null) continue;
    const urlStart = m.index + prefix.length;
    const urlEnd = urlStart + url.length;
    out.push({
      kind: "html-img",
      index: m.index,
      full: m[0]!,
      display: "", // no alt/text
      numericId,
      qs,
      url,
      urlStart,
      urlEnd,
    });
  }

  return out;
};

const mergeQuery = (basePath: string, qs: string) => {
  if (!qs) return basePath;
  if (basePath.includes("?")) {
    const suffix = qs.startsWith("?") ? qs.slice(1) : qs;
    return `${basePath}&${suffix}`;
  }
  return `${basePath}${qs}`;
};

async function main() {
  const args = parseArgs();
  const startedAt = Date.now();

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? "apply" : "dry-run",
        limitNotes: args.limitNotes,
        accountId: args.accountId,
      },
      null,
      2,
    ),
  );

  const PAGE_SIZE = 200;

  let lastId = 0;
  let scannedNotes = 0;
  let notesWithMatches = 0;
  let notesModified = 0;
  let linksRepaired = 0;
  let linksUnresolved = 0;
  const unresolved: Array<{ noteId: number; url: string; display: string }> = [];

  while (true) {
    if (args.limitNotes != null && scannedNotes >= args.limitNotes) break;

    const batch = await prisma.notes.findMany({
      where: {
        id: { gt: lastId },
        ...(args.accountId != null ? { accountId: args.accountId } : {}),
        content: { contains: "/api/file/" },
      },
      select: { id: true, accountId: true, content: true, updatedAt: true },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
    });

    if (!batch.length) break;

    for (const note of batch) {
      lastId = note.id;
      scannedNotes++;

      const matches = findMatches(note.content || "");
      if (!matches.length) continue;
      notesWithMatches++;

      const cacheByNumericId = new Map<number, FoundAttachment | null>();
      const cacheByAltPrefix = new Map<string, FoundAttachment | null>();

      const replacements: Array<{
        urlStart: number;
        urlEnd: number;
        nextUrl: string;
        attachment: FoundAttachment | null;
      }> = [];

      const orderedResolvedAttachments: FoundAttachment[] = [];
      const seenResolvedAttachmentIds = new Set<number>();

      for (const m of matches) {
        const attachment = await resolveAttachmentForNumericLink({
          numericId: m.numericId,
          altOrText: m.display,
          noteAccountId: note.accountId,
          cacheByNumericId,
          cacheByAltPrefix,
        });

        if (!attachment) {
          linksUnresolved++;
          if (unresolved.length < 200) {
            unresolved.push({ noteId: note.id, url: m.url, display: m.display });
          }
          continue;
        }

        const nextUrl = mergeQuery(attachment.path, m.qs);
        replacements.push({
          urlStart: m.urlStart,
          urlEnd: m.urlEnd,
          nextUrl,
          attachment,
        });

        if (!seenResolvedAttachmentIds.has(attachment.id)) {
          seenResolvedAttachmentIds.add(attachment.id);
          orderedResolvedAttachments.push(attachment);
        }
      }

      if (!replacements.length) continue;

      // Apply replacements from right to left to preserve indices.
      const sorted = replacements.sort((a, b) => b.urlStart - a.urlStart);
      let nextContent = note.content;
      for (const r of sorted) {
        nextContent =
          nextContent.slice(0, r.urlStart) +
          r.nextUrl +
          nextContent.slice(r.urlEnd);
      }

      if (nextContent === note.content) continue;

      linksRepaired += replacements.length;
      notesModified++;

      if (args.dryRun) continue;

      const tx: any[] = [];
      tx.push(
        prisma.notes.update({
          where: { id: note.id },
          data: { content: nextContent },
        }),
      );

      // Link orphaned attachments to the note (best-effort, never "steal" from another note).
      const linkUpdates: any[] = [];
      let localSortOrder = 0;
      const alreadyLinked = new Set<number>();

      for (const att of orderedResolvedAttachments) {
        if (alreadyLinked.has(att.id)) continue;
        alreadyLinked.add(att.id);
        if (att.noteId != null) continue;
        if (!isOwnedByAccount(att, note.accountId)) continue;

        linkUpdates.push(
          prisma.attachments.update({
            where: { id: att.id },
            data: { noteId: note.id, sortOrder: localSortOrder },
          }),
        );
        localSortOrder++;
      }

      tx.push(...linkUpdates);
      await prisma.$transaction(tx);
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    JSON.stringify(
      {
        scannedNotes,
        notesWithMatches,
        notesModified,
        linksRepaired,
        linksUnresolved,
        unresolvedSample: unresolved,
        durationMs,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("repair_numeric_api_file_links failed:", error);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exitCode = 1;
});

