import crypto from 'crypto';
import pool from '../db.js';
import { normalizeRow } from '../utils/rows.js';

const publicBase = () =>
  process.env.WHATSAPP_WEBHOOK_PUBLIC_URL ||
  process.env.PUBLIC_URL ||
  'http://localhost:3001';

export function getPublicApiBase() {
  return String(publicBase()).replace(/\/$/, '');
}

function digitsOnly(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function normalizeSiteUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    return u.origin + u.pathname.replace(/\/$/, '');
  } catch {
    return '';
  }
}

function hostFromUrl(url) {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export async function listWidgets(userId) {
  const [rows] = await pool.query(
    `SELECT id, site_url AS siteUrl, site_name AS siteName, phone, monitor_code AS monitorCode,
            message, active, page_views AS pageViews, button_clicks AS buttonClicks,
            last_seen_at AS lastSeenAt, created_at AS createdAt
     FROM whatsapp_button_widgets WHERE user_id = ? ORDER BY id DESC`,
    [userId]
  );
  const base = getPublicApiBase();
  return rows.map((r) => {
    const row = normalizeRow(r);
    return {
      id: String(row.id),
      siteUrl: row.siteUrl,
      siteName: row.siteName || hostFromUrl(row.siteUrl),
      phone: row.phone,
      monitorCode: row.monitorCode,
      message: row.message || '',
      active: Boolean(row.active),
      pageViews: Number(row.pageViews) || 0,
      buttonClicks: Number(row.buttonClicks) || 0,
      lastSeenAt: row.lastSeenAt,
      embedSnippet: buildEmbedSnippet(row.monitorCode, base),
      scriptUrl: `${base}/api/widget/${row.monitorCode}.js`,
    };
  });
}

export function buildEmbedSnippet(monitorCode, base = getPublicApiBase()) {
  const url = `${base}/api/widget/${monitorCode}.js`;
  return `<!-- VESK CRM - Botão WhatsApp -->\n<script src="${url}" async defer data-vesk-monitor="${monitorCode}"></script>`;
}

export async function createWidget(userId, { siteUrl, siteName = '', phone, message = '' }) {
  const normalizedUrl = normalizeSiteUrl(siteUrl);
  const phoneDigits = digitsOnly(phone);
  if (!normalizedUrl) throw new Error('URL do site inválida');
  if (phoneDigits.length < 10) throw new Error('Número de WhatsApp inválido (use DDI + DDD + número)');

  const monitorCode = crypto.randomBytes(16).toString('hex');
  const [result] = await pool.query(
    `INSERT INTO whatsapp_button_widgets (user_id, site_url, site_name, phone, monitor_code, message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, normalizedUrl, siteName.trim(), phoneDigits, monitorCode, message.trim()]
  );

  const widgets = await listWidgets(userId);
  return widgets.find((w) => w.id === String(result.insertId));
}

export async function updateWidget(userId, id, { siteUrl, siteName, phone, message, active }) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) throw new Error('ID inválido');

  const existing = await getWidgetById(userId, numericId);
  if (!existing) throw new Error('Widget não encontrado');

  const normalizedUrl = siteUrl !== undefined ? normalizeSiteUrl(siteUrl) : existing.siteUrl;
  if (!normalizedUrl) throw new Error('URL do site inválida');

  const phoneDigits = phone !== undefined ? digitsOnly(phone) : existing.phone;
  if (phoneDigits.length < 10) throw new Error('Número de WhatsApp inválido');

  await pool.query(
    `UPDATE whatsapp_button_widgets
     SET site_url = ?, site_name = ?, phone = ?, message = ?, active = ?, updated_at = NOW()
     WHERE id = ? AND user_id = ?`,
    [
      normalizedUrl,
      siteName !== undefined ? String(siteName).trim() : existing.siteName || '',
      phoneDigits,
      message !== undefined ? String(message).trim() : existing.message || '',
      active !== undefined ? !!active : !!existing.active,
      numericId,
      userId,
    ]
  );

  const widgets = await listWidgets(userId);
  return widgets.find((w) => w.id === String(numericId));
}

export async function deleteWidget(userId, id) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) throw new Error('ID inválido');
  const [result] = await pool.query('DELETE FROM whatsapp_button_widgets WHERE id = ? AND user_id = ?', [
    numericId,
    userId,
  ]);
  if (result.affectedRows === 0) throw new Error('Widget não encontrado');
}

async function getWidgetById(userId, id) {
  const [rows] = await pool.query(
    `SELECT id, site_url AS siteUrl, site_name AS siteName, phone, message, active
     FROM whatsapp_button_widgets WHERE id = ? AND user_id = ? LIMIT 1`,
    [id, userId]
  );
  return rows[0] ? normalizeRow(rows[0]) : null;
}

export async function getWidgetByMonitorCode(monitorCode) {
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, site_url AS siteUrl, phone, message, active, monitor_code AS monitorCode
     FROM whatsapp_button_widgets WHERE monitor_code = ? LIMIT 1`,
    [monitorCode]
  );
  const row = rows[0] ? normalizeRow(rows[0]) : null;
  if (!row || !row.active) return null;
  return row;
}

export async function recordPing(monitorCode, event = 'view') {
  const widget = await getWidgetByMonitorCode(monitorCode);
  if (!widget) return false;

  if (event === 'click') {
    await pool.query(
      `UPDATE whatsapp_button_widgets SET button_clicks = button_clicks + 1, last_seen_at = NOW(), updated_at = NOW()
       WHERE monitor_code = ?`,
      [monitorCode]
    );
  } else {
    await pool.query(
      `UPDATE whatsapp_button_widgets SET page_views = page_views + 1, last_seen_at = NOW(), updated_at = NOW()
       WHERE monitor_code = ?`,
      [monitorCode]
    );
  }
  return true;
}

export function buildWidgetScript(widget) {
  const base = getPublicApiBase();
  const code = widget.monitorCode;
  const phone = digitsOnly(widget.phone);
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(widget.message || 'Olá! Vim pelo site.')}`;

  return `(function(){
  if (window.__veskWaLoaded && window.__veskWaLoaded['${code}']) return;
  window.__veskWaLoaded = window.__veskWaLoaded || {};
  window.__veskWaLoaded['${code}'] = true;

  var API = '${base}';
  var CODE = '${code}';
  var WA_URL = '${waUrl}';

  function ping(event) {
    try {
      var img = new Image();
      img.src = API + '/api/widget/' + CODE + '/ping?event=' + event + '&t=' + Date.now();
    } catch (e) {}
  }

  ping('view');

  var btn = document.createElement('a');
  btn.href = WA_URL;
  btn.target = '_blank';
  btn.rel = 'noopener noreferrer';
  btn.setAttribute('aria-label', 'Falar no WhatsApp');
  btn.title = 'WhatsApp';
  btn.id = 'vesk-wa-btn-' + CODE;

  var style = document.createElement('style');
  style.textContent = '#vesk-wa-btn-' + CODE + '{position:fixed;bottom:24px;right:24px;z-index:2147483646;width:56px;height:56px;border-radius:50%;background:#25D366;box-shadow:0 4px 16px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .2s,box-shadow .2s;text-decoration:none;}#vesk-wa-btn-' + CODE + ':hover{transform:scale(1.08);box-shadow:0 6px 20px rgba(0,0,0,.3);}#vesk-wa-btn-' + CODE + ' svg{width:32px;height:32px;fill:#fff;}';

  btn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  btn.addEventListener('click', function() { ping('click'); });

  document.head.appendChild(style);
  function mountBtn() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', mountBtn, { once: true });
      return;
    }
    document.body.appendChild(btn);
  }
  mountBtn();
})();`;
}
