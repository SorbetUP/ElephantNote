import express from 'express';
import path from 'path';
import { FileService } from '../../lib/files';
import { getTokenFromRequest } from '../../lib/helper';
import cors from 'cors';
import { prisma } from '../../prisma';
import { getServerInstanceId } from '../../lib/serverInstance';

const router = express.Router();

router.options('/', cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: '*',
  maxAge: 86400
}));

/**
 * @swagger
 * /api/file/upload-by-url:
 *   post:
 *     tags: 
 *       - File
 *     summary: Upload File by URL
 *     operationId: uploadFileByUrl
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 description: URL of the file to upload
 *             required:
 *               - url
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
 *                 originalURL:
 *                   type: string
 *       400:
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       500:
 *         description: Server Error
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
    const token = await getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (process.env.IS_DEMO) {
      return res.status(401).json({ error: "In Demo App" });
    }

    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: "No URL provided" });
    }

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(400).json({ error: "Failed to fetch file from URL" });
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    const urlPath = new URL(url).pathname;
    const originalName = path.basename(urlPath).replace(/\s+/g, "_");
    const filePath = await FileService.uploadFile({
      buffer,
      originalName,
      type: response.headers.get("content-type") || "",
      accountId: Number(token.id)
    });

    // Best-effort: emit attachment sync op so sync-mode clients can pull and download by sync id.
    try {
      const accountId = Number(token.id);
      const attachment = await prisma.attachments.findFirst({
        where: { accountId, path: filePath.filePath },
        orderBy: { id: 'desc' },
      });
      if (attachment?.syncId) {
        const instanceId = await getServerInstanceId(prisma);
        const safeName = (attachment.name || originalName || 'download').replace(/[\\/]/g, '_');
        const payload = {
          id: 0,
          sync_id: attachment.syncId,
          note_id: null,
          filename: attachment.name || safeName,
          mime: attachment.type || response.headers.get("content-type") || "application/octet-stream",
          size: Number((attachment.size as any)?.toString?.() ?? attachment.size ?? buffer.length ?? 0) || 0,
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
          }
        });
      }
    } catch (err) {
      console.error('attachment sync emit error:', err);
    }

    res.set({
      'Access-Control-Allow-Origin': req.headers.origin || '',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Credentials': 'true'
    });

    return res.status(200).json({
      Message: "Success",
      status: 200,
      ...filePath,
      originalURL: url,
      type: response.headers.get("content-type") || "",
      size: buffer.length
    });
  } catch (error) {
    console.error("Error uploading file from URL:", error);
    return res.status(500).json({ error: "Failed to upload file from URL" });
  }
});

export default router;
