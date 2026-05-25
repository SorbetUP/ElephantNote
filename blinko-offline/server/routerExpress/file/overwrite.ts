import express from 'express';
import busboy from 'busboy';
import cors from 'cors';
import { Readable, PassThrough } from 'stream';

import { FileService } from '../../lib/files';
import { getTokenFromRequest } from '../../lib/helper';

const router = express.Router();

router.options(
  '/',
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: '*',
    maxAge: 86400,
  }),
);

/**
 * /api/file/overwrite:
 *   post:
 *     tags:
 *       - File
 *     summary: Overwrite existing file content (same attachment path)
 *     operationId: overwriteFile
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               attachment_path:
 *                 type: string
 *               file:
 *                 type: string
 *                 format: binary
 *             required:
 *               - attachment_path
 *               - file
 *     responses:
 *       200:
 *         description: Overwrite Success
 */
router.post('/', async (req, res) => {
  try {
    req.setTimeout(0);
    res.setTimeout(0);

    const token = await getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data') || !contentType.includes('boundary=')) {
      return res.status(400).json({ error: 'Content type must be multipart/form-data', contentType });
    }

    const bb = busboy({ headers: req.headers });

    let attachmentPath: string | null = null;

    let fileInfo: {
      stream: PassThrough | null;
      filename: string;
      mimeType: string;
      size: number;
    } | null = null;
    let fileDone: Promise<void> | null = null;
    let resolveFileDone: (() => void) | null = null;

    bb.on('field', (fieldname, value) => {
      if (fieldname === 'attachment_path' || fieldname === 'attachmentPath') {
        attachmentPath = value;
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
        filename: decodedFilename.replace(/\s+/g, '_'),
        mimeType: info.mimeType,
        size: 0,
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
        passThrough.destroy(error as any);
        resolveFileDone?.();
      });
    });

    bb.on('finish', async () => {
      if (!attachmentPath) {
        return res.status(400).json({ error: 'Missing attachment_path' });
      }
      if (fileDone) await fileDone;
      if (!fileInfo?.stream) {
        return res.status(400).json({ error: 'No file received' });
      }

      try {
        const webReadableStream = Readable.toWeb(fileInfo.stream) as unknown as ReadableStream;
        const result = await FileService.overwriteFileStream({
          stream: webReadableStream,
          attachmentPath,
          fileSize: fileInfo.size,
          type: fileInfo.mimeType,
          accountId: Number(token.id),
        });

        res.set({
          'Access-Control-Allow-Origin': req.headers.origin || '',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Credentials': 'true',
        });

        return res.status(200).json({
          Message: 'Success',
          status: 200,
          ...result,
          type: fileInfo.mimeType,
          size: fileInfo.size,
        });
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (msg === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden' });
        if (msg === 'FILE_NOT_FOUND') return res.status(404).json({ error: 'File not found' });
        console.error('Overwrite error:', err);
        return res.status(500).json({ error: 'Overwrite failed' });
      }
    });

    req.pipe(bb);
  } catch (error) {
    console.error('Overwrite error:', error);
    return res.status(500).json({ error: 'Overwrite failed' });
  }
});

export default router;

