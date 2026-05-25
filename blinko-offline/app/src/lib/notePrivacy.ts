import type { Note } from '@shared/lib/types';

// Treat notes tagged with "credentials" (either via tag relation or inline hashtag)
// as sensitive and mask their body in list/preview renderers.

export function isCredentialsNote(note: Pick<Note, 'content' | 'tags'>): boolean {
  if (note.tags?.some((t: any) => t?.tag?.name === 'credentials')) return true;
  return isCredentialsContent(note.content ?? '');
}

export function isCredentialsContent(content: string): boolean {
  if (!content) return false;
  // Avoid false positives from code blocks and keep this compatible with iOS
  // (no lookbehind). We only consider whitespace-delimited hashtag tokens.
  const withoutCodeBlocks = content.replace(/```[\s\S]*?```/g, ' ');
  const tokens = withoutCodeBlocks.split(/\s+/g);
  return tokens.some((tok) => normalizeHashtagToken(tok) === 'credentials');
}

export function maskCredentialsContent(content: string): string {
  const title = extractMarkdownH1Line(content);
  if (title) return title;

  const fallback = extractFirstNonTagLine(content);
  if (fallback) return `# ${fallback}`;

  return '# (credentials)';
}

export function extractMarkdownH1Line(content: string): string | null {
  if (!content) return null;
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    // Only accept explicit "# <title>"; ignore "#tag" style hashtags.
    if (/^#\s+\S/.test(line)) return line;
  }
  return null;
}

function extractFirstNonTagLine(content: string): string | null {
  if (!content) return null;
  const withoutCodeBlocks = content.replace(/```[\s\S]*?```/g, ' ');
  for (const rawLine of withoutCodeBlocks.split('\n')) {
    let line = rawLine.trim();
    if (!line) continue;

    // Skip hashtag-only / tag lines like "#credentials" or "#foo #bar".
    // If the user explicitly wrote an H1 ("# Title"), it's already handled above.
    if (/^#\S/.test(line)) continue;

    line = cleanupTitleLine(line);
    if (!line) continue;
    return line;
  }
  return null;
}

function cleanupTitleLine(line: string): string {
  return line
    .replace(/^[-*]\s+\[[xX ]\]\s+/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .trim();
}

function normalizeHashtagToken(token: string): string | null {
  if (!token) return null;
  if (!token.startsWith('#')) return null;

  // Strip leading '#', then trim common trailing punctuation.
  let v = token.slice(1);
  v = v.trim();
  while (v && /[)\]}>,.;:*?!。"'\u2019\u201D]$/.test(v)) {
    v = v.slice(0, -1);
  }
  v = v.trim().toLowerCase();
  if (!v) return null;
  return v;
}
