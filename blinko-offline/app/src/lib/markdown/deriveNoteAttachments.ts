import type { Attachment } from "@shared/lib/types";
import { extractApiFileRefsFromMarkdown } from "./extractApiFileAttachments";

export const deriveNoteAttachments = ({
  content,
  attachments,
  noteId,
}: {
  content: string;
  attachments?: Attachment[];
  noteId?: number;
}): Attachment[] => {
  const base = (attachments ?? []).slice();
  const refs = extractApiFileRefsFromMarkdown(content || "");
  if (refs.length === 0) return base;

  const existingById = new Map<string, Attachment>();
  const existingByPath = new Map<string, Attachment>();

  for (const a of base) {
    const path = String((a as any)?.path || "");
    if (path) existingByPath.set(path, a);
    const id = path.match(/\/api\/file\/(\d+)\b/)?.[1];
    if (id) existingById.set(String(id), a);
  }

  const out: Attachment[] = [];
  const seenKey = new Set<string>();

  // Keep existing attachments first (preserves metadata/order).
  for (const a of base) {
    const key = String((a as any)?.path || (a as any)?.name || "");
    if (!key || seenKey.has(key)) continue;
    seenKey.add(key);
    out.push(a);
  }

  // Add derived attachments for markdown-only references that are not present in note.attachments.
  for (const r of refs) {
    const already = existingById.get(r.id) || existingByPath.get(r.path);
    if (already) continue;
    const key = r.path;
    if (seenKey.has(key)) continue;
    seenKey.add(key);

    out.push({
      name: r.name,
      path: r.path,
      type: "", // allow file-type inference from extension
      size: 0,
      noteId,
    } as any);
  }

  return out;
};

