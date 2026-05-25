/**
 * Shared utilities for CLI-based language model providers (Codex, Claude Code).
 */

/**
 * Expands ~ in file paths to the user's home directory.
 */
export function expandHome(p: string): string {
  if (!p.startsWith('~')) return p;
  const home = process.env.HOME;
  if (!home) return p;
  if (p === '~') return home;
  if (p.startsWith('~/')) return `${home}${p.slice(1)}`;
  return p;
}

/**
 * Splits text into chunks of the specified size for streaming.
 */
export function chunkText(text: string, chunkSize = 2048): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Creates a data handler that parses newline-delimited JSON from a stream.
 * Returns a function that can be passed to stream.on('data', ...).
 */
export function forEachJsonLine<T = any>(onLine: (obj: T) => void) {
  let buffer = '';
  return (chunk: Buffer | Uint8Array) => {
    const str = chunk instanceof Buffer ? chunk.toString('utf8') : Buffer.from(chunk).toString('utf8');
    buffer += str;
    while (true) {
      const idx = buffer.indexOf('\n');
      if (idx === -1) break;
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        onLine(JSON.parse(line));
      } catch {
        // ignore non-JSON lines
      }
    }
  };
}
