import jwt from 'jsonwebtoken';
import pool from '../db.js';
import { normalizeRows } from '../utils/rows.js';
import { logger } from '../utils/logger.js';
import { decryptToken, encryptToken } from './googleCrypto.js';

// OAuth 2.0 do Google por usuário. Sem a biblioteca googleapis: só `fetch` contra os endpoints oficiais.
export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'openid', 'email'];
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/** Erro de autorização: a conexão foi revogada/expirou e o usuário precisa reconectar. */
export class GoogleAuthError extends Error {
  constructor(message = 'A conexão com o Google expirou. Conecte novamente.') {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const base = (
    process.env.WHATSAPP_WEBHOOK_PUBLIC_URL ||
    process.env.PRODUCTION_APP_URL ||
    `http://localhost:${process.env.PORT || 3001}`
  ).replace(/\/+$/, '');
  return {
    configured: Boolean(clientId && clientSecret),
    clientId,
    clientSecret,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || `${base}/api/google/callback`,
  };
}

/** `state` assinado: liga o retorno do Google ao usuário que iniciou a conexão (anti-CSRF), válido por 10 min. */
export const signState = (userId) =>
  jwt.sign({ purpose: 'google-oauth', uid: Number(userId) }, process.env.JWT_SECRET, { expiresIn: '10m' });

export function verifyState(state) {
  try {
    const p = jwt.verify(String(state), process.env.JWT_SECRET);
    return p?.purpose === 'google-oauth' && Number.isInteger(p.uid) ? p.uid : null;
  } catch {
    return null;
  }
}

export function buildAuthUrl(userId) {
  const cfg = googleConfig();
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: signState(userId),
  });
  return `${AUTH_URL}?${q.toString()}`;
}

async function tokenRequest(params) {
  const cfg = googleConfig();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...params }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.error === 'invalid_grant') throw new GoogleAuthError();
    throw new Error(`Google: ${data.error_description || data.error || res.status}`);
  }
  return data;
}

/** Troca o `code` do retorno do OAuth por tokens e grava a conta do usuário (criptografada). */
export async function connectAccount(userId, code) {
  const cfg = googleConfig();
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri });
  if (!t.refresh_token) throw new Error('O Google não devolveu permissão de acesso contínuo. Tente conectar novamente.');
  const idPayload = t.id_token ? jwt.decode(t.id_token) : null;
  const email = String(idPayload?.email || '').slice(0, 255);
  const expires = new Date(Date.now() + Number(t.expires_in || 3600) * 1000).toISOString();
  await pool.query(
    `INSERT INTO google_accounts (user_id, email, refresh_token_enc, access_token_enc, access_expires_at, scope, calendar_id,
                                  sync_token, last_synced_at, connected_at)
     VALUES (?, ?, ?, ?, ?, ?, 'primary', NULL, NULL, NOW())
     ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, refresh_token_enc = EXCLUDED.refresh_token_enc,
       access_token_enc = EXCLUDED.access_token_enc, access_expires_at = EXCLUDED.access_expires_at,
       scope = EXCLUDED.scope, sync_token = NULL, connected_at = NOW()`,
    [userId, email, encryptToken(t.refresh_token), encryptToken(t.access_token), expires, String(t.scope || '')]
  );
  return { email };
}

export async function getAccount(userId) {
  const [rows] = await pool.query('SELECT * FROM google_accounts WHERE user_id = ?', [userId]);
  return rows[0] ? normalizeRows(rows)[0] : null;
}

export async function removeAccount(userId) {
  await pool.query('DELETE FROM google_accounts WHERE user_id = ?', [userId]);
}

// Colunas sem alias voltam em snake_case; aceita as duas formas para não depender do normalizeRow.
const col = (row, camel, snake) => row[camel] ?? row[snake];

/**
 * Access token válido do usuário (renova com o refresh token quando faltar menos de 1 min).
 * Lança GoogleAuthError — e já apaga a conexão — se o Google recusar o refresh token.
 */
export async function getAccessToken(userId) {
  const account = await getAccount(userId);
  if (!account) throw new GoogleAuthError('Conta Google não conectada.');
  const cached = col(account, 'accessTokenEnc', 'access_token_enc');
  const expiresAt = col(account, 'accessExpiresAt', 'access_expires_at');
  if (cached && expiresAt && new Date(expiresAt).getTime() - Date.now() > 60_000) {
    const token = decryptToken(cached);
    if (token) return { accessToken: token, account };
  }
  const refreshToken = decryptToken(col(account, 'refreshTokenEnc', 'refresh_token_enc'));
  if (!refreshToken) {
    await removeAccount(userId);
    throw new GoogleAuthError();
  }
  let t;
  try {
    t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
  } catch (err) {
    if (err instanceof GoogleAuthError) await removeAccount(userId);
    throw err;
  }
  const expires = new Date(Date.now() + Number(t.expires_in || 3600) * 1000).toISOString();
  await pool.query('UPDATE google_accounts SET access_token_enc = ?, access_expires_at = ? WHERE user_id = ?', [
    encryptToken(t.access_token),
    expires,
    userId,
  ]);
  return { accessToken: t.access_token, account };
}

/** Revoga o acesso no Google (melhor esforço) e apaga a conexão local. */
export async function disconnectAccount(userId) {
  const account = await getAccount(userId);
  if (!account) return;
  const refreshToken = decryptToken(col(account, 'refreshTokenEnc', 'refresh_token_enc'));
  if (refreshToken) {
    try {
      await fetch(REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }).toString(),
      });
    } catch (err) {
      logger.warn('google revoke failed', { err: err.message });
    }
  }
  await removeAccount(userId);
}
