export type AttachmentLike = {
  name?: string | null;
  path?: string | null;
};

const isBlobLike = (s: string) => {
  const v = (s || "").trim().toLowerCase();
  return v.startsWith("blob:") || v.startsWith("data:");
};

/**
 * Replace ephemeral `blob:`/`data:` URLs in markdown links/images with stable attachment paths,
 * using the link label (usually the filename) to resolve the correct attachment.
 *
 * Example:
 *  `[a.png](blob:tauri://...)` -> `[a.png](/api/file/...)` when attachments includes {name:"a.png", path:"/api/file/..."}
 */
export function sanitizeBlobLinksWithAttachments(markdown: string, attachments: AttachmentLike[]): string {
  if (!markdown || typeof markdown !== "string") return "";

  const map = new Map<string, string>();
  for (const a of attachments || []) {
    const name = (a?.name || "").trim();
    const path = (a?.path || "").trim();
    if (!name || !path) continue;
    if (isBlobLike(path)) continue;
    map.set(name, path);
  }
  if (map.size === 0) return markdown;

  // Matches `[label](blob:...)` and `![label](blob:...)`.
  // Use non-greedy capture for label to avoid spanning across multiple links.
  return markdown.replace(/(!?\[)([^\]]+?)(\]\()([^)\s]+)(\))/g, (full, open, label, mid, url, close) => {
    if (!isBlobLike(String(url))) return full;
    const resolved = map.get(String(label).trim());
    if (!resolved) return full;
    return `${open}${label}${mid}${resolved}${close}`;
  });
}

