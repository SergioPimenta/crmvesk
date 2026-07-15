import pool from '../db.js';
import { normalizeRows } from '../utils/rows.js';

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export function assertTemplateMimeSupported(mime) {
  if (!mime || !ALLOWED_MIMES.has(mime)) {
    throw new Error('Formato não suportado. Envie PDF, Word, PowerPoint ou Excel.');
  }
}

async function uploadTemplateFile(userId, buffer, filename, mimeType) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const safeName = String(filename || 'modelo').replace(/[^\w.\-()+ ]/g, '_');

  if (token) {
    const { put } = await import('@vercel/blob');
    const blob = await put(`proposal-templates/${userId}/${Date.now()}-${safeName}`, buffer, {
      access: 'public',
      token,
      contentType: mimeType || undefined,
    });
    return blob.url;
  }

  const mime = mimeType || 'application/octet-stream';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/** Normaliza a lista de campos: array de strings não vazias, sem duplicatas. */
function normalizeFields(fields) {
  let list = fields;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const f of list) {
    const clean = String(f || '').trim().slice(0, 80);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out.slice(0, 30);
}

export async function listTemplates(userId) {
  const [rows] = await pool.query(
    `SELECT id, nome, descricao, file_url AS fileUrl, file_name AS fileName,
            mime_type AS mimeType, file_size AS fileSize, fields, created_at AS createdAt
     FROM proposal_templates WHERE user_id = ? ORDER BY created_at DESC, id DESC`,
    [userId]
  );
  return normalizeRows(rows).map((r) => ({ ...r, id: String(r.id), fields: normalizeFields(r.fields) }));
}

export async function createTemplate(userId, { nome, descricao, buffer, filename, mimeType, fields }) {
  const cleanNome = String(nome || '').trim();
  if (!cleanNome) throw new Error('Informe o nome do modelo');
  if (!buffer || !buffer.length) throw new Error('Arquivo vazio');

  assertTemplateMimeSupported(mimeType);

  const fileUrl = await uploadTemplateFile(userId, buffer, filename, mimeType);
  const cleanFields = normalizeFields(fields);

  const [result] = await pool.query(
    `INSERT INTO proposal_templates (user_id, nome, descricao, file_url, file_name, mime_type, file_size, fields)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      cleanNome,
      String(descricao || '').trim(),
      fileUrl,
      filename || '',
      mimeType || '',
      buffer.length,
      JSON.stringify(cleanFields),
    ]
  );

  return { id: String(result.insertId) };
}

export async function renameTemplate(userId, id, { nome, descricao, fields }) {
  const cleanNome = String(nome || '').trim();
  if (!cleanNome) throw new Error('Informe o nome do modelo');
  const cleanFields = normalizeFields(fields);

  const [result] = await pool.query(
    'UPDATE proposal_templates SET nome = ?, descricao = ?, fields = ? WHERE id = ? AND user_id = ?',
    [cleanNome, String(descricao || '').trim(), JSON.stringify(cleanFields), id, userId]
  );
  if (!result.affectedRows) throw new Error('Modelo não encontrado');
  return { ok: true };
}

export async function deleteTemplate(userId, id) {
  const [result] = await pool.query('DELETE FROM proposal_templates WHERE id = ? AND user_id = ?', [
    id,
    userId,
  ]);
  if (!result.affectedRows) throw new Error('Modelo não encontrado');
  return { ok: true };
}
