import express from 'express';
import multer from 'multer';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post('/', verifyToken, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    try {
      const { put } = await import('@vercel/blob');
      const blob = await put(req.file.originalname, req.file.buffer, {
        access: 'public',
        token,
      });
      return res.status(200).json({ message: 'File uploaded successfully', url: blob.url });
    } catch (err) {
      console.error('Blob upload failed:', err.message);
    }
  }

  const base64 = req.file.buffer.toString('base64');
  const mime = req.file.mimetype || 'application/octet-stream';
  const dataUrl = `data:${mime};base64,${base64}`;
  res.status(200).json({
    message: 'File uploaded (inline). Configure BLOB_READ_WRITE_TOKEN na Vercel para URL permanente.',
    url: dataUrl,
  });
});

export default router;
