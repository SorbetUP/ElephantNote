export type ApiFileRef = {
  id: string;
  path: string; // normalized to `/api/file/<id>`
  name: string;
  isImage: boolean;
};

const normalizeApiFilePath = (url: string, id: string) => `/api/file/${id}`;

export const extractApiFileRefsFromMarkdown = (markdown: string): ApiFileRef[] => {
  const s = (markdown || "").toString();
  if (!s) return [];

  // Prefer extracting explicit markdown image syntax to preserve names.
  // Example: ![excalidraw-123.png](/api/file/532)
  const byId: Map<string, ApiFileRef> = new Map();

  const imgRe = /!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g;
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = imgRe.exec(s))) {
    const altRaw = (m[1] ?? "").trim();
    const urlRaw = (m[2] ?? "").trim();
    const id = urlRaw.match(/\/api\/file\/(\d+)\b/)?.[1];
    if (!id) continue;

    const name = altRaw || `api-file-${id}.png`;
    byId.set(id, {
      id,
      path: normalizeApiFilePath(urlRaw, id),
      name,
      isImage: true,
    });
  }

  // Also detect plain `/api/file/<id>` references (links, HTML, etc).
  // Keep image info if already detected via markdown image syntax.
  const anyRe = /\/api\/file\/(\d+)\b/g;
  // eslint-disable-next-line no-cond-assign
  while ((m = anyRe.exec(s))) {
    const id = m[1];
    if (!id) continue;
    if (byId.has(id)) continue;
    byId.set(id, {
      id,
      path: normalizeApiFilePath("", id),
      name: `api-file-${id}`,
      isImage: false,
    });
  }

  return Array.from(byId.values());
};

