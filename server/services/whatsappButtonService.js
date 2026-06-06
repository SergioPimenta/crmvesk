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

async function ensureDefaultPipeline(userId) {
  const [rows] = await pool.query(
    'SELECT id FROM pipelines WHERE user_id = ? ORDER BY is_default DESC, id ASC LIMIT 1',
    [userId]
  );
  if (rows[0]) return Number(rows[0].id);

  const [ins] = await pool.query('INSERT INTO pipelines (user_id, nome, is_default) VALUES (?, ?, TRUE)', [
    userId,
    'Funil padrão',
  ]);
  const pipelineId = ins.insertId;
  const stages = [
    { key: 'prospeccao', titulo: 'Prospecção', cor: '#7a7880' },
    { key: 'qualificacao', titulo: 'Qualificação', cor: '#378add' },
    { key: 'proposta', titulo: 'Proposta', cor: '#ef9f27' },
    { key: 'negociacao', titulo: 'Negociação', cor: '#4ab3b8' },
    { key: 'fechado', titulo: 'Fechado', cor: '#4caf82' },
  ];
  for (let i = 0; i < stages.length; i += 1) {
    const s = stages[i];
    await pool.query(
      'INSERT INTO pipeline_stages (user_id, pipeline_id, stage_key, titulo, cor, pos) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, pipelineId, s.key, s.titulo, s.cor, i]
    );
  }
  return Number(pipelineId);
}

async function resolveWidgetPipeline(userId, pipelineId, stageKey) {
  const pipeId =
    pipelineId !== undefined && pipelineId !== null && pipelineId !== ''
      ? Number(pipelineId)
      : await ensureDefaultPipeline(userId);

  if (!Number.isFinite(pipeId)) throw new Error('Funil inválido');

  const [pipeRows] = await pool.query('SELECT id, nome FROM pipelines WHERE id = ? AND user_id = ? LIMIT 1', [
    pipeId,
    userId,
  ]);
  if (!pipeRows[0]) throw new Error('Funil não encontrado');

  const key = String(stageKey || 'prospeccao').trim() || 'prospeccao';
  const [stageRows] = await pool.query(
    `SELECT stage_key AS stageKey, titulo FROM pipeline_stages
     WHERE user_id = ? AND pipeline_id = ? AND stage_key = ? LIMIT 1`,
    [userId, pipeId, key]
  );
  if (!stageRows[0]) throw new Error('Etapa inválida para o funil selecionado');

  const stage = normalizeRow(stageRows[0]);
  return {
    pipelineId: pipeId,
    pipelineName: pipeRows[0].nome,
    stageKey: stage.stageKey,
    stageTitle: stage.titulo,
  };
}

function mapWidgetRow(row, base) {
  const normalized = normalizeRow(row);
  return {
    id: String(normalized.id),
    siteUrl: normalized.siteUrl,
    siteName: normalized.siteName || hostFromUrl(normalized.siteUrl),
    phone: normalized.phone,
    monitorCode: normalized.monitorCode,
    message: normalized.message || '',
    pipelineId: normalized.pipelineId != null ? String(normalized.pipelineId) : null,
    stageKey: normalized.stageKey || 'prospeccao',
    pipelineName: normalized.pipelineName || '',
    stageTitle: normalized.stageTitle || '',
    active: Boolean(normalized.active),
    pageViews: Number(normalized.pageViews) || 0,
    buttonClicks: Number(normalized.buttonClicks) || 0,
    lastSeenAt: normalized.lastSeenAt,
    embedSnippet: buildEmbedSnippet(normalized.monitorCode, base),
    scriptUrl: `${base}/api/widget/${normalized.monitorCode}.js`,
  };
}

export async function listWidgets(userId) {
  const [rows] = await pool.query(
    `SELECT w.id, w.site_url AS siteUrl, w.site_name AS siteName, w.phone, w.monitor_code AS monitorCode,
            w.message, w.active, w.page_views AS pageViews, w.button_clicks AS buttonClicks,
            w.last_seen_at AS lastSeenAt, w.created_at AS createdAt,
            w.pipeline_id AS pipelineId, w.stage_key AS stageKey,
            p.nome AS pipelineName, ps.titulo AS stageTitle
     FROM whatsapp_button_widgets w
     LEFT JOIN pipelines p ON p.id = w.pipeline_id AND p.user_id = w.user_id
     LEFT JOIN pipeline_stages ps ON ps.pipeline_id = w.pipeline_id AND ps.stage_key = w.stage_key AND ps.user_id = w.user_id
     WHERE w.user_id = ? ORDER BY w.id DESC`,
    [userId]
  );
  const base = getPublicApiBase();
  return rows.map((r) => mapWidgetRow(r, base));
}

export function buildEmbedSnippet(monitorCode, base = getPublicApiBase()) {
  const url = `${base}/api/widget/${monitorCode}.js`;
  return `<!-- VESK CRM - Botão WhatsApp -->\n<script src="${url}" async defer data-vesk-monitor="${monitorCode}"></script>`;
}

export async function createWidget(
  userId,
  { siteUrl, siteName = '', phone, message = '', pipelineId, stageKey }
) {
  const normalizedUrl = normalizeSiteUrl(siteUrl);
  const phoneDigits = digitsOnly(phone);
  if (!normalizedUrl) throw new Error('URL do site inválida');
  if (phoneDigits.length < 10) throw new Error('Número de WhatsApp inválido (use DDI + DDD + número)');

  const pipeline = await resolveWidgetPipeline(userId, pipelineId, stageKey);
  const monitorCode = crypto.randomBytes(16).toString('hex');
  const [result] = await pool.query(
    `INSERT INTO whatsapp_button_widgets (user_id, site_url, site_name, phone, monitor_code, message, pipeline_id, stage_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      normalizedUrl,
      siteName.trim(),
      phoneDigits,
      monitorCode,
      message.trim(),
      pipeline.pipelineId,
      pipeline.stageKey,
    ]
  );

  const widgets = await listWidgets(userId);
  return widgets.find((w) => w.id === String(result.insertId));
}

export async function updateWidget(
  userId,
  id,
  { siteUrl, siteName, phone, message, active, pipelineId, stageKey }
) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) throw new Error('ID inválido');

  const existing = await getWidgetById(userId, numericId);
  if (!existing) throw new Error('Widget não encontrado');

  const normalizedUrl = siteUrl !== undefined ? normalizeSiteUrl(siteUrl) : existing.siteUrl;
  if (!normalizedUrl) throw new Error('URL do site inválida');

  const phoneDigits = phone !== undefined ? digitsOnly(phone) : existing.phone;
  if (phoneDigits.length < 10) throw new Error('Número de WhatsApp inválido');

  const pipeline = await resolveWidgetPipeline(
    userId,
    pipelineId !== undefined ? pipelineId : existing.pipelineId,
    stageKey !== undefined ? stageKey : existing.stageKey
  );

  await pool.query(
    `UPDATE whatsapp_button_widgets
     SET site_url = ?, site_name = ?, phone = ?, message = ?, active = ?,
         pipeline_id = ?, stage_key = ?, updated_at = NOW()
     WHERE id = ? AND user_id = ?`,
    [
      normalizedUrl,
      siteName !== undefined ? String(siteName).trim() : existing.siteName || '',
      phoneDigits,
      message !== undefined ? String(message).trim() : existing.message || '',
      active !== undefined ? !!active : !!existing.active,
      pipeline.pipelineId,
      pipeline.stageKey,
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
    `SELECT id, site_url AS siteUrl, site_name AS siteName, phone, message, active,
            pipeline_id AS pipelineId, stage_key AS stageKey
     FROM whatsapp_button_widgets WHERE id = ? AND user_id = ? LIMIT 1`,
    [id, userId]
  );
  return rows[0] ? normalizeRow(rows[0]) : null;
}

export async function getWidgetByMonitorCode(monitorCode) {
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, site_url AS siteUrl, site_name AS siteName, phone, message, active,
            monitor_code AS monitorCode, pipeline_id AS pipelineId, stage_key AS stageKey
     FROM whatsapp_button_widgets WHERE monitor_code = ? LIMIT 1`,
    [monitorCode]
  );
  const row = rows[0] ? normalizeRow(rows[0]) : null;
  if (!row || !row.active) return null;
  return row;
}

function buildWaLeadMessage(widget, { name, email, phone, siteLabel }) {
  const parts = [`Olá! Meu nome é ${name}.`, `Telefone: ${phone}.`];
  if (email) parts.push(`E-mail: ${email}.`);
  parts.push(widget.message?.trim() || `Vim pelo site ${siteLabel}.`);
  return parts.join(' ');
}

export async function submitWidgetLead(monitorCode, { nome, email = '', telefone, pageUrl = '' }) {
  const widget = await getWidgetByMonitorCode(monitorCode);
  if (!widget) throw new Error('Widget não encontrado ou inativo');

  const name = String(nome || '').trim();
  const emailStr = String(email || '').trim();
  const phoneDigits = digitsOnly(telefone);
  if (!name) throw new Error('Nome é obrigatório');
  if (phoneDigits.length < 10) throw new Error('Telefone inválido');

  const userId = Number(widget.userId);
  if (!Number.isFinite(userId)) throw new Error('Widget sem proprietário válido');

  const siteLabel = widget.siteName || hostFromUrl(widget.siteUrl) || 'site';
  const ultimaInteracao = `Lead via botão WhatsApp · ${siteLabel}${pageUrl ? ` · ${pageUrl}` : ''} · ${new Date().toLocaleDateString('pt-BR')}`;

  const pipeline = await resolveWidgetPipeline(userId, widget.pipelineId, widget.stageKey);

  const [contactIns] = await pool.query(
    `INSERT INTO contacts (user_id, nome, email, telefone, tipo, etapa, ultima_interacao, precisa_followup)
     VALUES (?, ?, ?, ?, 'Lead', ?, ?, TRUE)`,
    [userId, name, emailStr, phoneDigits, pipeline.stageTitle || 'Prospecção', ultimaInteracao]
  );
  const contactId = contactIns.insertId;

  await pool.query(
    `INSERT INTO deals (user_id, pipeline_id, contact_id, titulo, valor, prob, stage_key) VALUES (?, ?, ?, ?, '', '20%', ?)`,
    [userId, pipeline.pipelineId, contactId, name, pipeline.stageKey]
  );

  await recordPing(monitorCode, 'click');

  const waText = buildWaLeadMessage(widget, { name, email: emailStr, phone: phoneDigits, siteLabel });
  const waUrl = `https://wa.me/${digitsOnly(widget.phone)}?text=${encodeURIComponent(waText)}`;

  return { ok: true, waUrl, contact: { nome: name, email: emailStr, telefone: phoneDigits } };
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

function escapeJsString(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n');
}

export function buildWidgetScript(widget) {
  const base = getPublicApiBase();
  const code = widget.monitorCode;
  const greeting = escapeJsString(
    widget.message?.trim() || 'Olá, gostaria de um atendimento personalizado?'
  );

  return `(function(){
  if (window.__veskWaLoaded && window.__veskWaLoaded['${code}']) return;
  window.__veskWaLoaded = window.__veskWaLoaded || {};
  window.__veskWaLoaded['${code}'] = true;

  var API = '${base}';
  var CODE = '${code}';
  var GREETING = '${greeting}';
  var PFX = 'vesk-wa-' + CODE;

  function ping(event) {
    try {
      var img = new Image();
      img.src = API + '/api/widget/' + CODE + '/ping?event=' + event + '&t=' + Date.now();
    } catch (e) {}
  }

  function maskPhone(v) {
    var d = String(v || '').replace(/\\D/g, '').slice(0, 11);
    if (d.length <= 2) return d.length ? '(' + d : '';
    if (d.length <= 7) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }

  ping('view');

  var style = document.createElement('style');
  style.textContent =
    '#' + PFX + '-btn{position:fixed;bottom:24px;right:24px;z-index:2147483646;width:56px;height:56px;border-radius:50%;background:#25D366;border:none;box-shadow:0 4px 16px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .2s,box-shadow .2s;padding:0;}' +
    '#' + PFX + '-btn:hover{transform:scale(1.08);box-shadow:0 6px 20px rgba(0,0,0,.3);}' +
    '#' + PFX + '-btn svg{width:32px;height:32px;fill:#fff;}' +
    '#' + PFX + '-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483647;display:none;align-items:flex-end;justify-content:flex-end;padding:24px;box-sizing:border-box;}' +
    '#' + PFX + '-overlay.open{display:flex;}' +
    '#' + PFX + '-panel{width:100%;max-width:340px;background:#f7f6f2;border-radius:14px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.28);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}' +
    '#' + PFX + '-head{background:#128C7E;color:#fff;text-align:center;font-weight:700;font-size:18px;padding:14px 16px;}' +
    '#' + PFX + '-body{padding:16px;}' +
    '#' + PFX + '-bubble{background:#fff;border-radius:12px;padding:12px 14px;font-size:14px;line-height:1.45;color:#333;margin-bottom:14px;box-shadow:0 1px 4px rgba(0,0,0,.08);}' +
    '.' + PFX + '-field{margin-bottom:12px;}' +
    '.' + PFX + '-field label{display:block;font-size:13px;font-weight:600;color:#444;margin-bottom:6px;}' +
    '.' + PFX + '-field input{width:100%;box-sizing:border-box;border:none;border-radius:10px;padding:12px 14px;font-size:14px;background:#e8f5e9;color:#222;outline:none;}' +
    '.' + PFX + '-field input:focus{box-shadow:0 0 0 2px #128C7E55;}' +
    '.' + PFX + '-actions{display:flex;gap:10px;margin-top:6px;}' +
    '.' + PFX + '-btn-primary{flex:1;background:#128C7E;color:#fff;border:none;border-radius:999px;padding:12px 16px;font-size:14px;font-weight:700;cursor:pointer;}' +
    '.' + PFX + '-btn-primary:disabled{opacity:.65;cursor:not-allowed;}' +
    '.' + PFX + '-btn-secondary{flex:1;background:#9e9e9e;color:#fff;border:none;border-radius:999px;padding:12px 16px;font-size:14px;font-weight:600;cursor:pointer;}' +
    '.' + PFX + '-hint{font-size:11px;color:#888;text-align:center;margin-top:12px;}' +
    '.' + PFX + '-error{color:#c0392b;font-size:12px;margin:8px 0 0;display:none;}' +
    '.' + PFX + '-error.show{display:block;}';

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.id = PFX + '-btn';
  btn.setAttribute('aria-label', 'Falar no WhatsApp');
  btn.title = 'WhatsApp';
  btn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  var overlay = document.createElement('div');
  overlay.id = PFX + '-overlay';
  overlay.innerHTML =
    '<div id="' + PFX + '-panel" role="dialog" aria-modal="true" aria-label="WhatsApp">' +
      '<div id="' + PFX + '-head">WhatsApp</div>' +
      '<div id="' + PFX + '-body">' +
        '<div id="' + PFX + '-bubble"></div>' +
        '<div class="' + PFX + '-field"><label for="' + PFX + '-nome">Nome*:</label><input id="' + PFX + '-nome" type="text" placeholder="Digite seu nome aqui" autocomplete="name"></div>' +
        '<div class="' + PFX + '-field"><label for="' + PFX + '-tel">Telefone*:</label><input id="' + PFX + '-tel" type="tel" placeholder="(00) 00000-0000" autocomplete="tel"></div>' +
        '<div class="' + PFX + '-field"><label for="' + PFX + '-email">E-mail:</label><input id="' + PFX + '-email" type="email" placeholder="seu@email.com.br" autocomplete="email"></div>' +
        '<div class="' + PFX + '-error" id="' + PFX + '-error"></div>' +
        '<div class="' + PFX + '-actions">' +
          '<button type="button" class="' + PFX + '-btn-primary" id="' + PFX + '-submit">Iniciar conversa</button>' +
          '<button type="button" class="' + PFX + '-btn-secondary" id="' + PFX + '-cancel">Cancelar</button>' +
        '</div>' +
        '<div class="' + PFX + '-hint">*Campos marcados com * são obrigatórios</div>' +
      '</div>' +
    '</div>';

  var bubble = overlay.querySelector('#' + PFX + '-bubble');
  var inputNome = overlay.querySelector('#' + PFX + '-nome');
  var inputTel = overlay.querySelector('#' + PFX + '-tel');
  var inputEmail = overlay.querySelector('#' + PFX + '-email');
  var errorEl = overlay.querySelector('#' + PFX + '-error');
  var submitBtn = overlay.querySelector('#' + PFX + '-submit');
  var cancelBtn = overlay.querySelector('#' + PFX + '-cancel');
  bubble.textContent = GREETING;

  function showError(msg) {
    errorEl.textContent = msg || '';
    errorEl.classList.toggle('show', !!msg);
  }

  function openPanel() {
    showError('');
    overlay.classList.add('open');
    inputNome.focus();
  }

  function closePanel() {
    overlay.classList.remove('open');
    showError('');
  }

  inputTel.addEventListener('input', function() {
    inputTel.value = maskPhone(inputTel.value);
  });

  btn.addEventListener('click', function() {
    openPanel();
  });

  cancelBtn.addEventListener('click', closePanel);
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closePanel();
  });

  submitBtn.addEventListener('click', function() {
    var nome = (inputNome.value || '').trim();
    var telefone = (inputTel.value || '').replace(/\\D/g, '');
    var email = (inputEmail.value || '').trim();
    if (!nome) return showError('Informe seu nome.');
    if (telefone.length < 10) return showError('Informe um telefone válido.');
    showError('');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando…';
    fetch(API + '/api/widget/' + CODE + '/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: nome, telefone: telefone, email: email, pageUrl: location.href })
    })
      .then(function(res) {
        return res.json().then(function(data) {
          if (!res.ok) throw new Error((data && data.message) || 'Erro ao enviar');
          return data;
        });
      })
      .then(function(data) {
        closePanel();
        if (data.waUrl) window.open(data.waUrl, '_blank', 'noopener,noreferrer');
      })
      .catch(function(err) {
        showError(err.message || 'Não foi possível enviar. Tente novamente.');
      })
      .finally(function() {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Iniciar conversa';
      });
  });

  document.head.appendChild(style);
  function mount() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
      return;
    }
    document.body.appendChild(btn);
    document.body.appendChild(overlay);
  }
  mount();
})();`;
}
