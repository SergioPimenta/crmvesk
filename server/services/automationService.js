import pool from '../db.js';
import { normalizeRow } from '../utils/rows.js';

const DEFAULT_WELCOME_MESSAGE =
  'Olá! Recebemos sua mensagem e em breve alguém da nossa equipe vai te atender por aqui. 😊';

export async function getAutomationSettings(accountId) {
  const [rows] = await pool.query(
    `SELECT account_id, welcome_message_enabled AS welcomeMessageEnabled,
            welcome_message_text AS welcomeMessageText
     FROM automation_settings WHERE account_id = ?`,
    [accountId]
  );

  if (!rows[0]) {
    return { welcomeMessageEnabled: false, welcomeMessageText: DEFAULT_WELCOME_MESSAGE };
  }

  const row = normalizeRow(rows[0]);
  return {
    welcomeMessageEnabled: Boolean(row.welcomeMessageEnabled),
    welcomeMessageText: row.welcomeMessageText || DEFAULT_WELCOME_MESSAGE,
  };
}

export async function saveAutomationSettings(accountId, { welcomeMessageEnabled, welcomeMessageText }) {
  const enabled = Boolean(welcomeMessageEnabled);
  const text = String(welcomeMessageText ?? '').trim().slice(0, 1000);

  if (enabled && !text) {
    throw new Error('Escreva a mensagem de boas-vindas antes de ativar');
  }

  await pool.query(
    `INSERT INTO automation_settings (account_id, welcome_message_enabled, welcome_message_text)
     VALUES (?, ?, ?)
     ON CONFLICT (account_id) DO UPDATE SET
       welcome_message_enabled = EXCLUDED.welcome_message_enabled,
       welcome_message_text = EXCLUDED.welcome_message_text,
       updated_at = NOW()`,
    [accountId, enabled, text]
  );

  return getAutomationSettings(accountId);
}

export function renderWelcomeMessage(template, { name } = {}) {
  const firstName = String(name || '').trim().split(/\s+/)[0] || '';
  return String(template || '').replace(/\{\{\s*nome\s*\}\}/gi, firstName);
}
