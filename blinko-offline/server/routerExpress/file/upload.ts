import express from 'express';
import { FileService } from '../../lib/files';
import { getTokenFromRequest } from '../../lib/helper';
import { Readable, PassThrough } from 'stream';
import busboy from 'busboy';
import cors from 'cors';
import { prisma } from '../../prisma';
import { getServerInstanceId } from '../../lib/serverInstance';

const router = express.Router();

router.options('/', cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: '*',
  maxAge: 86400,
}));

/**
 * @swagger
 * /api/file/upload:
 *   post:
 *     tags: 
 *       - File
 *     summary: Upload File
 *     operationId: uploadFile
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Upload File
 *             required:
 *               - file
 *     responses:
 *       200:
 *         description: Upload Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 Message:
 *                   type: string
 *                 status:
 *                   type: number
 *                 path:
 *                   type: string
 *                 type:
 *                   type: string
 *                 size:
 *                   type: number
 *       401:
 *         description: UNAUTH
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *     security:
 *       - bearer: []
 */
router.post('/', async (req, res) => {
  try {
    req.setTimeout(0); // 0 = no timeout
    res.setTimeout(0); // 0 = no timeout

    const token = await getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: "Content type must be multipart/form-data", contentType });
    }
    if (!contentType.includes('boundary=')) {
      return res.status(400).json({ error: "Malformed multipart/form-data (missing boundary)", contentType });
    }
    
    const bb = busboy({
      headers: req.headers
    });
    
    let busboyErrored = false;
    let fileInfo: {
      stream: PassThrough | null,
      filename: string,
      mimeType: string,
      size: number,
      isUserVoiceRecording?: boolean,
      audioDuration?: string,
      audioDurationSeconds?: number
    } | null = null;
    let fileDone: Promise<void> | null = null;
    let resolveFileDone: (() => void) | null = null;

    let isUserVoiceRecording = false;
    let audioDuration: string | null = null;
    let audioDurationSeconds: number | null = null;
    let syncId: string | null = null;
    let skipSyncEmit = false;

    bb.on('error', (error) => {
      busboyErrored = true;
      console.error('Upload error (busboy):', error);
      if (!res.headersSent) {
        res.status(400).json({ error: 'Malformed multipart/form-data request' });
      }
    });

    bb.on('field', (fieldname, value) => {
      if (fieldname === 'isUserVoiceRecording' && value === 'true') {
        isUserVoiceRecording = true;
      } else if (fieldname === 'audioDuration') {
        audioDuration = value;
      } else if (fieldname === 'audioDurationSeconds') {
        audioDurationSeconds = parseInt(value, 10);
      } else if (fieldname === 'sync_id' || fieldname === 'syncId') {
        syncId = value;
      } else if (fieldname === 'skip_sync_emit' || fieldname === 'skipSyncEmit') {
        skipSyncEmit = value === '1' || value === 'true';
      }
    });

    bb.on('file', (fieldname, stream, info) => {
      if (fieldname !== 'file') {
        stream.resume();
        return;
      }

      const passThrough = new PassThrough();
      const decodedFilename = Buffer.from(info.filename, 'binary').toString('utf-8');
      fileInfo = {
        stream: passThrough,
        filename: decodedFilename.replace(/\s+/g, "_"),
        mimeType: info.mimeType,
        size: 0,
        isUserVoiceRecording,
        audioDuration: audioDuration || undefined,
        audioDurationSeconds: audioDurationSeconds || undefined
      };

      fileDone = new Promise<void>((resolve) => {
        resolveFileDone = resolve;
      });

      stream.on('data', (chunk) => {
        fileInfo!.size += chunk.length;
        passThrough.write(chunk);
      });

      stream.on('end', () => {
        passThrough.end();
        resolveFileDone?.();
      });

      stream.on('error', (error) => {
        console.error('Upload error (stream):', error);
        passThrough.destroy(error as any);
        resolveFileDone?.();
      });
    });
    
    bb.on('finish', async () => {
      if (busboyErrored) return;
      if (fileDone) {
        await fileDone;
      }
      if (!fileInfo || !fileInfo.stream) {
        return res.status(400).json({ error: "No files received.", contentType });
      }
      
      try {
        const webReadableStream = Readable.toWeb(fileInfo.stream) as unknown as ReadableStream;
        
        // Build metadata object
        const metadata: any = {};
        if (fileInfo.isUserVoiceRecording) {
          metadata.isUserVoiceRecording = true;
        }
        if (fileInfo.audioDuration) {
          metadata.audioDuration = fileInfo.audioDuration;
        }
        if (fileInfo.audioDurationSeconds) {
          metadata.audioDurationSeconds = fileInfo.audioDurationSeconds;
        }

	        const filePath = await FileService.uploadFileStream({
	          stream: webReadableStream,
	          originalName: fileInfo.filename,
	          fileSize: fileInfo.size,
	          type: fileInfo.mimeType,
	          accountId: Number(token.id),
	          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
	          syncId
	        });

	        // Emit a sync op for attachments so sync-mode clients can pull metadata and download by sync id.
	        // Inter-server replication uses /changes for metadata; allow skipping this emit.
	        if (!skipSyncEmit) {
	          // We do not include server storage paths in the payload `path`; clients store under their own
	          // attachments dir using a stable "<sync_id>_<filename>" name.
	          try {
	            const accountId = Number(token.id);
	            const instanceId = await getServerInstanceId(prisma);
	            const attachment = syncId
	              ? await prisma.attachments.findFirst({
	                  where: { accountId, syncId },
	                  orderBy: { id: 'desc' },
	                })
	              : await prisma.attachments.findFirst({
	                  where: { accountId, path: filePath.filePath },
	                  orderBy: { id: 'desc' },
	                });

	            if (attachment?.syncId) {
	              const safeName = (fileInfo.filename ?? 'upload.bin').replace(/[\\/]/g, '_');
	              const payload = {
	                id: 0,
	                sync_id: attachment.syncId,
	                note_id: null,
	                filename: attachment.name || safeName,
	                mime: attachment.type || fileInfo.mimeType || 'application/octet-stream',
	                size: Number((attachment.size as any)?.toString?.() ?? attachment.size ?? fileInfo.size ?? 0) || 0,
	                sha256: '',
	                path: `${attachment.syncId}_${safeName}`,
	                created_at: attachment.createdAt?.toISOString?.() ?? new Date().toISOString(),
	                updated_at: attachment.updatedAt?.toISOString?.() ?? new Date().toISOString(),
	                deleted_at: null,
	              };

	              await prisma.syncChanges.create({
	                data: {
	                  accountId,
	                  entityType: 'attachment',
	                  entityId: attachment.syncId,
	                  op: 'upsert',
	                  payloadJson: JSON.stringify(payload),
	                  ts: new Date(),
	                  deviceId: `server-upload:${instanceId}:${accountId}`,
	                },
	              });
	            }
	          } catch (err) {
	            console.error('attachment sync emit error:', err);
	          }
	        }
	        
	        res.set({
	          'Access-Control-Allow-Origin': req.headers.origin || '',
	          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
	          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Credentials': 'true'
        });
        
        res.status(200).json({
          Message: "Success",
          status: 200,
          ...filePath,
          type: fileInfo.mimeType,
          size: fileInfo.size
        });
      } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: "Upload failed" });
      }
    });
    
    req.pipe(bb);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: "Upload failed" });
  }
});

export default router;
