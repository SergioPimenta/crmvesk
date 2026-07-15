import pool from '../db.js';
import { sendMail } from '../utils/mailer.js';
import { normalizeRow } from '../utils/rows.js';

async function fetchAsBuffer(url) {
  if (url.startsWith('data:')) {
    const commaIdx = url.indexOf(',');
    const base64 = url.slice(commaIdx + 1);
    return Buffer.from(base64, 'base64');
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar o modelo (${res.status})`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildEmailHtml({ contactName, titulo, valor, fieldValues }) {
  const rows = Object.entries(fieldValues || {})
    .filter(([, v]) => String(v || '').trim())
    .map(([k, v]) => `<tr><td style="padding:2px 10px 2px 0;color:#7a7880;">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
    .join('');

  return `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#1b1c1f;line-height:1.5;">
      <p>Olá${contactName ? `, ${escapeHtml(contactName)}` : ''}!</p>
      <p>Segue em anexo nossa proposta comercial${titulo ? `: <strong>${escapeHtml(titulo)}</strong>` : ''}.</p>
      ${valor ? `<p>Valor: <strong>${escapeHtml(valor)}</strong></p>` : ''}
      ${rows ? `<table style="margin:12px 0;border-collapse:collapse;font-size:13px;">${rows}</table>` : ''}
      <p>Qualquer dúvida, estamos à disposição.</p>
      <p style="margin-top:20px;">Atenciosamente,<br/><strong>Equipe VESK</strong></p>
    </div>
  `;
}

export async function sendProposalEmail(userId, proposalId) {
  const [proposalRows] = await pool.query(
    `SELECT id, titulo, valor, contact_id AS contactId, template_id AS templateId, field_values AS fieldValues
     FROM proposals WHERE id = ? AND user_id = ?`,
    [proposalId, userId]
  );
  const proposal = proposalRows[0] ? normalizeRow(proposalRows[0]) : null;
  if (!proposal) throw new Error('Proposta não encontrada');
  if (!proposal.contactId) throw new Error('A proposta não está vinculada a um contato');

  const [contactRows] = await pool.query('SELECT nome, email FROM contacts WHERE id = ? AND user_id = ?', [
    proposal.contactId,
    userId,
  ]);
  const contact = contactRows[0];
  if (!contact) throw new Error('Contato não encontrado');
  const to = String(contact.email || '').trim();
  if (!to) throw new Error(`O contato "${contact.nome}" não tem e-mail cadastrado`);

  const attachments = [];
  if (proposal.templateId) {
    const [templateRows] = await pool.query(
      'SELECT nome, file_url AS fileUrl, file_name AS fileName, mime_type AS mimeType FROM proposal_templates WHERE id = ? AND user_id = ?',
      [proposal.templateId, userId]
    );
    const template = templateRows[0] ? normalizeRow(templateRows[0]) : null;
    if (template?.fileUrl) {
      const buffer = await fetchAsBuffer(template.fileUrl);
      attachments.push({
        filename: template.fileName || `${template.nome || 'modelo'}.pdf`,
        content: buffer,
        contentType: template.mimeType || undefined,
      });
    }
  }

  const html = buildEmailHtml({
    contactName: contact.nome,
    titulo: proposal.titulo,
    valor: proposal.valor,
    fieldValues: proposal.fieldValues,
  });

  await sendMail({
    to,
    subject: `Proposta comercial — ${proposal.titulo}`,
    html,
    fromName: 'VESK Comercial',
    attachments: attachments.length ? attachments : undefined,
  });

  const [result] = await pool.query('UPDATE proposals SET email_sent_at = NOW() WHERE id = ? AND user_id = ?', [
    proposalId,
    userId,
  ]);
  if (!result.affectedRows) throw new Error('Não foi possível atualizar a proposta');

  const [updated] = await pool.query('SELECT email_sent_at AS emailSentAt FROM proposals WHERE id = ?', [
    proposalId,
  ]);
  const updatedRow = updated[0] ? normalizeRow(updated[0]) : null;
  return { ok: true, to, emailSentAt: updatedRow?.emailSentAt };
}
