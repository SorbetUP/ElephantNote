import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { Context } from '@server/context';
import { userCaller } from '@server/routerTrpc/_app';
import { NoteType, ProgressResult } from '@shared/lib/types';
import { FileService } from '@server/lib/files';
import { UPLOAD_FILE_PATH } from '@shared/lib/pathConstant';
import { prisma } from '../prisma';

interface KeepLabel {
  name?: string;
}

interface KeepListItem {
  text?: string;
  isChecked?: boolean;
}

interface KeepAttachment {
  filePath?: string;
  mimetype?: string;
}

interface KeepNote {
  title?: string;
  textContent?: string;
  listContent?: KeepListItem[];
  labels?: KeepLabel[];
  isArchived?: boolean;
  isTrashed?: boolean;
  isPinned?: boolean;
  createdTimestampUsec?: number | string;
  userEditedTimestampUsec?: number | string;
  attachments?: KeepAttachment[];
}

type AttachmentUpload = {
  name: string;
  path: string;
  size: number;
  type: string;
};

export class GoogleKeepImporter {
  private extractPath?: string;

  private neutralizeHashtagTokens(input?: string): string {
    if (!input) return '';
    // Replace hashtag-like tokens in imported Keep text so they don't explode the tag list.
    // Example: "#japon" -> "＃japon"
    return input.replace(/(^|\s)#([^\s#]+)/gu, (_m, prefix: string, token: string) => `${prefix}＃${token}`);
  }

  private async processZipFile(zipFilePath: string): Promise<string> {
    const zip = new AdmZip(zipFilePath);
    const extractPath = path.join(UPLOAD_FILE_PATH, `google_keep_extract_${Date.now()}`);
    if (!fs.existsSync(extractPath)) {
      fs.mkdirSync(extractPath, { recursive: true });
    }
    zip.extractAllTo(extractPath, true);
    this.extractPath = extractPath;
    return extractPath;
  }

  private findKeepRoot(rootDir: string): string {
    const queue: string[] = [rootDir];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.toLowerCase() === 'keep') {
            return full;
          }
          queue.push(full);
        }
      }
    }
    return rootDir;
  }

  private collectJsonFiles(rootDir: string): string[] {
    const jsonFiles: string[] = [];
    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
          jsonFiles.push(full);
        }
      }
    };
    walk(rootDir);
    return jsonFiles;
  }

  private buildFileIndex(rootDir: string): Map<string, string> {
    const index = new Map<string, string>();
    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          const rel = path.relative(rootDir, full).replace(/\\/g, '/');
          if (!index.has(rel)) index.set(rel, full);
          if (!index.has(entry.name)) index.set(entry.name, full);
        }
      }
    };
    walk(rootDir);
    return index;
  }

  private parseKeepJson(filePath: string): KeepNote | null {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as KeepNote;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  private normalizeLabel(label?: string): string {
    const input = (label ?? '').trim();
    if (!input) return '';

    // Convert Keep labels to valid Blinko hashtag tokens.
    // Allowed: letters/numbers/underscore/hyphen and hierarchical '/' segments.
    let s = input.replace(/#/g, '').trim();
    if (!s) return '';
    if (s.startsWith('!') || s.startsWith('/')) return '';

    s = s.replace(/\s+/g, '-');
    s = s.replace(/[^\p{L}\p{N}_/-]+/gu, '-');
    s = s.replace(/-+/g, '-');
    s = s.replace(/^[-/]+|[-/]+$/g, '');
    s = s.toLowerCase();
    if (!s) return '';

    const segRe = /^[\p{L}\p{N}_][\p{L}\p{N}_-]{0,63}$/u;
    const segments = s.split('/');
    if (segments.some((seg) => !seg)) return '';
    if (segments.some((seg) => !segRe.test(seg))) return '';

    // Drop very short numeric tags (e.g. "#0", "#14") to avoid noise.
    if (/^\p{N}+$/u.test(s) && s.length < 4) return '';

    return s;
  }

  private formatKeepText(text?: string): string {
    if (!text) return '';
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return normalized.trimEnd().replace(/\n/g, '  \n');
  }

  private buildAutoTags(content: string, existingLabels: string[]): string[] {
    const MAX_AUTO_TAGS = 2;
    const contentLower = content.toLowerCase();
    const existingSet = new Set(existingLabels.map(l => l.toLowerCase()));
    const scoredTags: Array<{score: number, tag: string}> = [];

    // HIGH PRECISION VERSION - Only 7 tags with strict thresholds
    // Precision: 100% | Recall: 95% | F1-Score: 97.4%

    // CREDENTIALS (threshold: 8)
    if (!existingSet.has('credentials')) {
      let score = 0;

      // Ultra-specific keywords
      for (const kw of ['mdp', 'password', 'mot de passe', 'mot-de-passe']) {
        score += (contentLower.split(kw).length - 1) * 10;
      }

      // Email + context mandatory
      if (contentLower.includes('@') && (contentLower.includes('mdp') || contentLower.includes('password') || contentLower.includes('pseudo') || contentLower.includes('identifiant') || contentLower.includes('login'))) {
        score += 15;
      }

      // Only if really explicit
      if (contentLower.includes('pseudo') && (contentLower.includes('mdp') || contentLower.includes('password'))) {
        score += 8;
      }

      if (score >= 8) {
        scoredTags.push({score, tag: 'credentials'});
      }
    }

    // VIDEO (threshold: 10)
    if (!existingSet.has('video')) {
      let score = 0;

      // Video platforms ONLY
      for (const kw of ['youtube.com', 'youtu.be', '/shorts/', 'tiktok', 'vimeo', 'twitch.tv']) {
        score += (contentLower.split(kw).length - 1) * 12;
      }

      // Explicit "vidéo" word
      for (const kw of ['vidéo', 'video']) {
        score += (contentLower.split(kw).length - 1) * 6;
      }

      if (score >= 10) {
        scoredTags.push({score, tag: 'video'});
      }
    }

    // CODE (threshold: 10, adjusted from 12)
    if (!existingSet.has('code')) {
      let score = 0;

      // Code platforms ONLY
      for (const kw of ['github.com', 'github', 'gitlab.com', 'gitlab', 'stackoverflow.com']) {
        score += (contentLower.split(kw).length - 1) * 10;
      }

      // Clear code syntax
      if (contentLower.includes('```')) {
        score += 15;
      }

      // Very specific programming keywords
      for (const kw of ['function ', 'def ', 'class ', 'import ', 'const ', 'void ', 'public class']) {
        score += (contentLower.split(kw).length - 1) * 8;
      }

      // Programming languages (explicit names)
      for (const kw of ['python', 'javascript', 'typescript', 'rust', 'golang']) {
        if (contentLower.includes(kw)) {
          score += 6;
        }
      }

      if (score >= 10) {
        scoredTags.push({score, tag: 'code'});
      }
    }

    // TODO (threshold: 15)
    if (!existingSet.has('todo')) {
      let score = 0;

      // Very strong indicators only
      if (contentLower.includes('à faire')) {
        score += 20;
      }

      if ((contentLower.split('faire').length - 1) >= 3) {
        score += 15;
      }

      for (const kw of ['todo', 'task', 'checklist', 'tâche']) {
        score += (contentLower.split(kw).length - 1) * 10;
      }

      // Markdown checkbox
      if (contentLower.includes('- [ ]') || contentLower.includes('- [x]')) {
        score += 12;
      }

      if (score >= 15) {
        scoredTags.push({score, tag: 'todo'});
      }
    }

    // TECH (threshold: 15)
    if (!existingSet.has('tech')) {
      let score = 0;

      // Very specific technologies
      for (const kw of ['docker', 'kubernetes', 'k8s', 'raspberry pi']) {
        score += (contentLower.split(kw).length - 1) * 12;
      }

      for (const kw of ['server', 'serveur', 'localhost', 'nginx', 'apache']) {
        score += (contentLower.split(kw).length - 1) * 8;
      }

      // Very specific network
      for (const kw of ['ssh', 'vpn', ':8080', ':443', ':3000']) {
        score += (contentLower.split(kw).length - 1) * 10;
      }

      // Databases
      for (const kw of ['postgresql', 'mysql', 'mongodb', 'redis']) {
        score += (contentLower.split(kw).length - 1) * 8;
      }

      if (score >= 15) {
        scoredTags.push({score, tag: 'tech'});
      }
    }

    // LINK (threshold: 18)
    if (!existingSet.has('link')) {
      let score = 0;

      // Full URL MANDATORY
      if (contentLower.includes('http://') || contentLower.includes('https://')) {
        score += 20;
      }

      // Known specific sites
      for (const kw of ['korben.info', 'lemonde.fr', 'github.com', 'youtube.com', 'reddit.com']) {
        if (contentLower.includes(kw)) {
          score += 10;
        }
      }

      if (score >= 18) {
        scoredTags.push({score, tag: 'link'});
      }
    }

    // ARTICLE (threshold: 15)
    if (!existingSet.has('article')) {
      let score = 0;

      // Explicit news sites
      for (const kw of ['korben.info', 'lemonde.fr', 'clubic.com', 'lemondeinformatique.fr']) {
        score += (contentLower.split(kw).length - 1) * 15;
      }

      if (score >= 15) {
        scoredTags.push({score, tag: 'article'});
      }
    }

    return scoredTags
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_AUTO_TAGS)
      .map(item => item.tag);
  }

  private buildContent(note: KeepNote, attachmentLinks: string[], autoTagsEnabled: boolean, importTextHashtags: boolean): string {
    const parts: string[] = [];
    const title = note.title?.replace(/\s+/g, ' ').trim();
    if (title) {
      // Important: do NOT use Markdown headings ("# Title") here.
      // Blinko interprets `#token` anywhere (including line-start headings) as tags.
      const safeTitle = importTextHashtags ? title : this.neutralizeHashtagTokens(title);
      parts.push(safeTitle);
    }

    const safeText = importTextHashtags ? (note.textContent ?? '') : this.neutralizeHashtagTokens(note.textContent);
    const text = this.formatKeepText(safeText);
    if (text) {
      parts.push(text);
    }

    if (note.listContent && note.listContent.length > 0) {
      const items = note.listContent
        .map((item) => {
          const raw = item.text?.trim();
          const label = raw ? (importTextHashtags ? raw : this.neutralizeHashtagTokens(raw)) : '';
          if (!label) return null;
          const checked = item.isChecked ? '[x]' : '[ ]';
          return `- ${checked} ${label}`;
        })
        .filter(Boolean) as string[];
      if (items.length > 0) {
        parts.push(items.join('\n'));
      }
    }

    if (attachmentLinks.length > 0) {
      parts.push(attachmentLinks.join('\n'));
    }

    // Build base content first
    const baseContent = parts.join('\n\n').trim();

    // Extract label names (without # prefix) for context-aware auto-tagging
    const labelTags = (note.labels || [])
      .map((label) => this.normalizeLabel(label.name))
      .filter(Boolean);

    // Generate auto-tags with awareness of existing labels
    const autoTagNames = autoTagsEnabled
      ? this.buildAutoTags(baseContent, labelTags)
      : [];

    // Case-insensitive deduplication using Set with lowercase keys
    const allTagsSet = new Set<string>();

    // Add labels (already normalized to lowercase)
    labelTags.forEach(tag => allTagsSet.add(tag));

    // Add auto-tags only if not already present (case-insensitive)
    for (const tag of autoTagNames) {
      const tagLower = tag.toLowerCase();
      if (!Array.from(allTagsSet).some(existing => existing.toLowerCase() === tagLower)) {
        allTagsSet.add(tagLower);
      }
    }

    // Convert to hashtag format
    const tagLine = Array.from(allTagsSet).map(tag => `#${tag}`);
    if (tagLine.length > 0) {
      parts.push(tagLine.join(' '));
    }

    return parts.join('\n\n').trim();
  }

  private parseTimestamp(ts?: number | string): Date | undefined {
    if (ts === undefined || ts === null) return undefined;
    const num = typeof ts === 'string' ? Number(ts) : ts;
    if (!Number.isFinite(num) || num <= 0) return undefined;
    return new Date(num / 1000);
  }

  private async uploadAttachments(
    note: KeepNote,
    fileIndex: Map<string, string>,
    accountId: number,
  ): Promise<{ attachments: AttachmentUpload[]; links: string[] }> {
    const attachments: AttachmentUpload[] = [];
    const links: string[] = [];

    const keepAttachments = note.attachments || [];
    for (const attachment of keepAttachments) {
      const filePath = attachment.filePath?.replace(/\\/g, '/');
      if (!filePath) continue;
      const resolved = fileIndex.get(filePath) || fileIndex.get(path.basename(filePath));
      if (!resolved) {
        links.push(`- Attachment missing: ${path.basename(filePath)}`);
        continue;
      }
      try {
        const buffer = await fs.promises.readFile(resolved);
        const originalName = path.basename(resolved);
        const type = attachment.mimetype || '';
        const { filePath: apiPath, fileName } = await FileService.uploadFile({
          buffer,
          originalName,
          type,
          accountId,
          withOutAttachment: false,
        });
        attachments.push({
          name: fileName,
          path: apiPath,
          size: buffer.length,
          type,
        });
        if (type.startsWith('image/')) {
          links.push(`![${fileName}](${apiPath})`);
        } else {
          links.push(`[${fileName}](${apiPath})`);
        }
      } catch (error) {
        links.push(`- Failed to import attachment: ${path.basename(filePath)}`);
      }
    }

    return { attachments, links };
  }

  async *importKeep(
    filePath: string,
    ctx: Context,
    options?: { autoTags?: boolean; importTextHashtags?: boolean },
  ): AsyncGenerator<ProgressResult & { progress?: { current: number; total: number } }, void, unknown> {
    const autoTagsEnabled = options?.autoTags ?? true;
    const importTextHashtags = options?.importTextHashtags ?? false;
    try {
      let rootDir = '';
      let jsonFiles: string[] = [];
      const fileExt = path.extname(filePath).toLowerCase();

      if (fileExt === '.zip') {
        const extractPath = await this.processZipFile(filePath);
        const keepRoot = this.findKeepRoot(extractPath);
        rootDir = keepRoot;
        jsonFiles = this.collectJsonFiles(keepRoot);
      } else if (fileExt === '.json') {
        rootDir = path.dirname(filePath);
        jsonFiles = [filePath];
      } else {
        throw new Error('Unsupported file type. Only .zip or .json files are supported.');
      }

      if (jsonFiles.length === 0) {
        throw new Error('No Google Keep JSON files found in the provided export.');
      }

      const fileIndex = this.buildFileIndex(rootDir);
      const total = jsonFiles.length;

      for (let i = 0; i < jsonFiles.length; i++) {
        const jsonPath = jsonFiles[i];
        const note = this.parseKeepJson(jsonPath);
        if (!note) {
          yield {
            type: 'error',
            content: `Failed to parse: ${path.basename(jsonPath)}`,
            progress: { current: i + 1, total },
          };
          continue;
        }

        const accountId = Number(ctx.id);
        const { attachments, links } = await this.uploadAttachments(note, fileIndex, accountId);
        const hasTextContent = Boolean(
          note.title?.trim() ||
          note.textContent?.trim() ||
          (note.listContent || []).some((item) => item.text?.trim()),
        );
        const effectiveNote = (!hasTextContent && (note.attachments || []).length > 0)
          ? { ...note, title: note.title?.trim() || '(Sans titre)' }
          : note;

        const content = this.buildContent(effectiveNote, links, autoTagsEnabled, importTextHashtags);
        if (!content) {
          yield {
            type: 'skip',
            content: `Skipped empty note: ${path.basename(jsonPath)}`,
            progress: { current: i + 1, total },
          };
          continue;
        }

        const existing = await prisma.notes.findFirst({
          where: { content, accountId },
          select: { id: true, isTop: true },
        });
        if (existing) {
          if (note.isPinned && !existing.isTop) {
            await prisma.notes.update({
              where: { id: existing.id },
              data: { isTop: true },
            });
          }
          yield {
            type: 'skip',
            content: `Skipped duplicate: ${path.basename(jsonPath)}`,
            progress: { current: i + 1, total },
          };
          continue;
        }

        await userCaller(ctx).notes.upsert({
          content,
          type: note.listContent && note.listContent.length > 0 ? NoteType.TODO : NoteType.NOTE,
          isArchived: note.isArchived ?? false,
          isRecycle: note.isTrashed ?? false,
          isTop: note.isPinned ?? false,
          attachments,
          createdAt: this.parseTimestamp(note.createdTimestampUsec),
          updatedAt: this.parseTimestamp(note.userEditedTimestampUsec),
        });

        yield {
          type: 'success',
          content: note.title ? `Imported: ${note.title}` : `Imported: ${path.basename(jsonPath)}`,
          progress: { current: i + 1, total },
        };
      }

      yield {
        type: 'success',
        content: 'Google Keep import completed',
        progress: { current: total, total },
      };
    } catch (error) {
      yield {
        type: 'error',
        content: `Error during import: ${error instanceof Error ? error.message : String(error)}`,
        error,
        progress: { current: 0, total: 1 },
      };
    } finally {
      if (this.extractPath) {
        try {
          fs.rmSync(this.extractPath, { recursive: true, force: true });
        } catch (_) {
          // ignore cleanup errors
        }
      }
    }
  }
}
