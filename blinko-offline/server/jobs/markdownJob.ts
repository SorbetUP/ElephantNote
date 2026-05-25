import fs from 'fs';
import path from 'path';
import { Context } from '@server/context';
import AdmZip from 'adm-zip';
import { NoteType, ProgressResult } from '@shared/lib/types';
import { FileService } from '@server/lib/files';
import { UPLOAD_FILE_PATH } from '@shared/lib/pathConstant';
import { userCaller } from '@server/routerTrpc/_app';

export class MarkdownImporter {
    /**
     * Import a single Markdown file
     */
    async importSingleMarkdownFile(filePath: string, ctx: Context): Promise<{ id: number, content: string }> {
        try {
            const content = await fs.promises.readFile(filePath, 'utf8');
            const fileName = path.basename(filePath);
            const caller = userCaller(ctx)
            // Create note using userCaller instead of direct prisma access
            const note = await caller.notes.upsert({
                content: content,
                type: NoteType.BLINKO,
            })
            return { id: note.id, content };
        } catch (error) {
            console.error('Failed to import markdown file:', error);
            throw error;
        }
    }

    /**
     * Process ZIP archive containing Markdown files
     */
    async processZipFile(zipFilePath: string): Promise<string[]> {
        try {
            const zip = new AdmZip(zipFilePath);
            const extractPath = path.join(UPLOAD_FILE_PATH, 'markdown_extract_' + Date.now());

            // Ensure directory exists
            if (!fs.existsSync(extractPath)) {
                fs.mkdirSync(extractPath, { recursive: true });
            }

            // Extract files
            zip.extractAllTo(extractPath, true);

            // Find all MD files
            const markdownFiles: string[] = [];

            const findMarkdownFiles = (dir: string) => {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const filePath = path.join(dir, file);
                    const stat = fs.statSync(filePath);

                    if (stat.isDirectory()) {
                        findMarkdownFiles(filePath);
                    } else if (file.toLowerCase().endsWith('.md')) {
                        markdownFiles.push(filePath);
                    }
                }
            };

            findMarkdownFiles(extractPath);
            return markdownFiles;
        } catch (error) {
            console.error('Failed to process ZIP file:', error);
            throw error;
        }
    }

    /**
     * Import Markdown files
     * Supports both single MD files and ZIP archives containing MD files
     */
    async * importMarkdown(filePath: string, ctx: Context): AsyncGenerator<ProgressResult & { progress?: { current: number; total: number } }, void, unknown> {
        try {
            let markdownFiles: string[] = [];
            const fileExt = path.extname(filePath).toLowerCase();

            // Process different file types
            if (fileExt === '.md') {
                markdownFiles = [filePath];
            } else if (fileExt === '.zip') {
                markdownFiles = await this.processZipFile(filePath);
            } else {
                throw new Error('Unsupported file type. Only .md or .zip files are supported');
            }

            const total = markdownFiles.length;

            // Import each Markdown file
            for (let i = 0; i < markdownFiles.length; i++) {
                const mdFilePath = markdownFiles[i];
                const fileName = path.basename(mdFilePath);

                try {
                    await this.importSingleMarkdownFile(mdFilePath, ctx);

                    yield {
                        type: 'success',
                        content: `Successfully imported: ${fileName}`,
                        progress: { current: i + 1, total }
                    };
                } catch (error) {
                    console.error(`Failed to import markdown file ${fileName}:`, error);

                    yield {
                        type: 'error',
                        content: `Failed to import: ${fileName}`,
                        error,
                        progress: { current: i + 1, total }
                    };
                }
            }

            yield {
                type: 'success',
                content: 'All markdown files imported successfully',
                progress: { current: total, total }
            };
        } catch (error) {
            console.error('Error occurred during markdown import:', error);

            yield {
                type: 'error',
                content: `Error during import: ${error.message}`,
                error,
                progress: { current: 0, total: 1 }
            };
        }
    }
} 