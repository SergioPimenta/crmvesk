import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import { sendMail } from '../utils/mailer.js';
import { ensureDefaultPipelineForUser } from './userService.js';

const INVITE_TTL_DAYS = 7;

function frontendBaseUrl() {
  const raw = process.env.FRONTEND_URL || process.env.PRODUCTION_APP_URL || 'http://localhost:5173';
  return raw.split(',')[0].trim().replace(/\/$/, '');
}

function buildInviteEmail({ inviterName, name, role, link }) {
  const roleLabel = role === 'admin' ? 'Administrador' : 'Usuário';
  const subject = `${inviterName} convidou você para o VESK CRM`;
  const html = `
    <div style="font-family: Arial, sans-serif; color: #1a1a1a; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #ef6a27;">Você foi convidado para o VESK CRM</h2>
      <p>Olá, ${name}!</p>
      <p><strong>${inviterName}</strong> convidou você para acessar o painel do CRM como <strong>${roleLabel}</strong>.</p>
      <p>Você vai poder ver os mesmos leads, o pipeline, os relatórios e as conversas de WhatsApp da equipe.</p>
      <p style="margin: 24px 0;">
        <a href="${link}" style="background: #ef6a27; color: #fff; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Aceitar convite
        </a>
      </p>
      <p style="font-size: 13px; color: #666;">Este convite expira em ${INVITE_TTL_DAYS} dias. Se o botão não funcionar, copie e cole este link no navegador:<br />${link}</p>
    </div>
  `;
  return { subject, html };
}

export async function listInvites(accountId) {
  const [rows] = await pool.query(
    `SELECT id, name, email, role, status, expires_at AS expiresAt, created_at AS createdAt
     FROM invites
     WHERE account_id = ? AND status = 'pending'
     ORDER BY created_at DESC`,
    [accountId]
  );
  return rows;
}

export async function createInvite({ accountId, invitedBy, inviterName, name, email, role = 'user' }) {
  try {
    const trimmedName = String(name || '').trim();
    const trimmedEmail = String(email || '').trim().toLowerCase();

    if (!trimmedName || !trimmedEmail) {
      throw new Error('Nome e e-mail são obrigatórios');
    }

    if (!['admin', 'user'].includes(role)) {
      throw new Error('Perfil inválido');
    }

    const [existingUsers] = await pool.query('SELECT id FROM users WHERE email = ?', [trimmedEmail]);
    if (existingUsers.length > 0) {
      throw new Error('E-mail já cadastrado');
    }

    // Reenvio: substitui convite pendente anterior para o mesmo e-mail nesta conta.
    await pool.query(
      `DELETE FROM invites WHERE account_id = ? AND email = ? AND status = 'pending'`,
      [accountId, trimmedEmail]
    );

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const [result] = await pool.query(
      `INSERT INTO invites (account_id, invited_by, name, email, role, token, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [accountId, invitedBy, trimmedName, trimmedEmail, role, token, expiresAt]
    );

    const link = `${frontendBaseUrl()}/convite/${token}`;
    const { subject, html } = buildInviteEmail({ inviterName, name: trimmedName, role, link });

    try {
      await sendMail({ to: trimmedEmail, subject, html });
    } catch (mailError) {
      // Convite já foi criado; admin pode reenviar depois. Não falha a requisição por causa do SMTP.
      return {
        success: true,
        emailSent: false,
        emailError: mailError.message,
        invite: { id: result.insertId, name: trimmedName, email: trimmedEmail, role, status: 'pending' },
      };
    }

    return {
      success: true,
      emailSent: true,
      invite: { id: result.insertId, name: trimmedName, email: trimmedEmail, role, status: 'pending' },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function revokeInvite(id, accountId) {
  try {
    const inviteId = Number(id);
    if (!Number.isFinite(inviteId)) {
      throw new Error('Convite inválido');
    }

    const [result] = await pool.query(
      `DELETE FROM invites WHERE id = ? AND account_id = ? AND status = 'pending'`,
      [inviteId, accountId]
    );

    if (!result.rowCount && !result.affectedRows) {
      throw new Error('Convite não encontrado');
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getInviteByToken(token) {
  const [rows] = await pool.query(
    `SELECT i.id, i.name, i.email, i.role, i.status, i.expires_at AS expiresAt, u.name AS accountName
     FROM invites i
     JOIN users u ON u.id = i.account_id
     WHERE i.token = ?`,
    [token]
  );
  return rows[0] || null;
}

export async function acceptInvite(token, password) {
  try {
    if (!password || String(password).length < 6) {
      throw new Error('A senha deve ter pelo menos 6 caracteres');
    }

    const [rows] = await pool.query(
      `SELECT id, account_id, name, email, role, status, expires_at
       FROM invites WHERE token = ?`,
      [token]
    );
    const invite = rows[0];

    if (!invite) {
      throw new Error('Convite inválido');
    }
    if (invite.status !== 'pending') {
      throw new Error('Este convite já foi utilizado ou foi revogado');
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      throw new Error('Este convite expirou. Peça um novo convite ao administrador.');
    }

    const [existingUsers] = await pool.query('SELECT id FROM users WHERE email = ?', [invite.email]);
    if (existingUsers.length > 0) {
      throw new Error('E-mail já cadastrado');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(String(password), salt);
    const accountId = invite.account_id;

    const [result] = await pool.query(
      'INSERT INTO users (name, email, password, role, active, account_id) VALUES (?, ?, ?, ?, TRUE, ?)',
      [invite.name, invite.email, hashedPassword, invite.role, accountId]
    );

    await pool.query(
      `UPDATE invites SET status = 'accepted', accepted_at = NOW() WHERE id = ?`,
      [invite.id]
    );

    await ensureDefaultPipelineForUser(accountId);

    const userId = result.insertId;
    const authToken = jwt.sign(
      { id: userId, role: invite.role, email: invite.email, accountId },
      process.env.JWT_SECRET,
      { expiresIn: '4h' }
    );

    return {
      success: true,
      token: authToken,
      user: { id: userId, name: invite.name, email: invite.email, role: invite.role },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
