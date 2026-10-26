import crypto from 'crypto';
import pool from '../db.js';
import { normalizeRow } from '../utils/rows.js';
import { normalizeOwnerSetting, resolveLeadOwner } from './leadOwnerService.js';
import { getPublicApiBase } from './whatsappButtonService.js';
import { buildAnalyticsLoader } from './siteTrackerScript.js';

export const DEFAULT_FIELD_MAPPINGS = [
  { crmField: 'nome', selector: "input[name='nome'], input[name='name']", required: true, label: 'Nome' },
  { crmField: 'email', selector: "input[name='email'], input[type='email']", label: 'E-mail' },
  {
    crmField: 'telefone',
    selector: "input[name='telefone'], input[name='phone'], input[type='tel']",
    label: 'Telefone',
  },
  {
    crmField: 'mensagem',
    selector: "textarea[name='mensagem'], textarea[name='message'], textarea",
    label: 'Mensagem',
  },
  { crmField: 'empresa', selector: "input[name='empresa'], input[name='company']", label: 'Empresa' },
];

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

function parseFieldMappings(raw) {
  if (!raw) return [...DEFAULT_FIELD_MAPPINGS];
  if (typeof raw === 'string') {
    try {
      return parseFieldMappings(JSON.parse(raw));
    } catch {
      return [...DEFAULT_FIELD_MAPPINGS];
    }
  }
  if (Array.isArray(raw)) {
    return raw
      .filter((f) => f && f.crmField && f.selector)
      .map((f) => ({
        crmField: String(f.crmField),
        selector: String(f.selector).trim(),
        required: Boolean(f.required),
        label: String(f.label || f.crmField),
      }));
  }
  return [...DEFAULT_FIELD_MAPPINGS];
}

function serializeFieldMappings(mappings) {
  return JSON.stringify(parseFieldMappings(mappings));
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
  const fieldMappings = parseFieldMappings(normalized.fieldMappings);
  return {
    id: String(normalized.id),
    siteUrl: normalized.siteUrl,
    siteName: normalized.siteName || hostFromUrl(normalized.siteUrl),
    monitorCode: normalized.monitorCode,
    formSelector: normalized.formSelector || 'form',
    fieldMappings,
    pipelineId: normalized.pipelineId != null ? String(normalized.pipelineId) : null,
    stageKey: normalized.stageKey || 'prospeccao',
    pipelineName: normalized.pipelineName || '',
    stageTitle: normalized.stageTitle || '',
    active: Boolean(normalized.active),
    ownerUserId: normalized.ownerUserId != null ? String(normalized.ownerUserId) : null,
    ownerRoundRobin: Boolean(normalized.ownerRoundRobin),
    pageViews: Number(normalized.pageViews) || 0,
    formSubmissions: Number(normalized.formSubmissions) || 0,
    lastSeenAt: normalized.lastSeenAt,
    embedSnippet: buildEmbedSnippet(normalized.monitorCode, base),
    scriptUrl: `${base}/api/form/${normalized.monitorCode}.js`,
  };
}

export async function listFormWidgets(userId) {
  const [rows] = await pool.query(
    `SELECT w.id, w.site_url AS siteUrl, w.site_name AS siteName, w.monitor_code AS monitorCode,
            w.form_selector AS formSelector, w.field_mappings AS fieldMappings, w.active,
            w.owner_user_id AS ownerUserId, w.owner_round_robin AS ownerRoundRobin,
            w.page_views AS pageViews, w.form_submissions AS formSubmissions,
            w.last_seen_at AS lastSeenAt, w.created_at AS createdAt,
            w.pipeline_id AS pipelineId, w.stage_key AS stageKey,
            p.nome AS pipelineName, ps.titulo AS stageTitle
     FROM contact_form_widgets w
     LEFT JOIN pipelines p ON p.id = w.pipeline_id AND p.user_id = w.user_id
     LEFT JOIN pipeline_stages ps ON ps.pipeline_id = w.pipeline_id AND ps.stage_key = w.stage_key AND ps.user_id = w.user_id
     WHERE w.user_id = ? ORDER BY w.id DESC`,
    [userId]
  );
  const base = getPublicApiBase();
  return rows.map((r) => mapWidgetRow(r, base));
}

export function buildEmbedSnippet(monitorCode, base = getPublicApiBase()) {
  const url = `${base}/api/form/${monitorCode}.js`;
  return `<!-- VESK CRM - Formulário de contato -->\n<script src="${url}" async defer data-vesk-form="${monitorCode}"></script>`;
}

export async function createFormWidget(
  userId,
  { siteUrl, siteName = '', formSelector = 'form', fieldMappings, pipelineId, stageKey, ownerUserId, ownerRoundRobin }
) {
  const normalizedUrl = normalizeSiteUrl(siteUrl);
  if (!normalizedUrl) throw new Error('URL do site inválida');

  const pipeline = await resolveWidgetPipeline(userId, pipelineId, stageKey);
  const owner = await normalizeOwnerSetting(userId, { ownerUserId, ownerRoundRobin });
  const mappings = parseFieldMappings(fieldMappings);
  const monitorCode = crypto.randomBytes(16).toString('hex');

  const [result] = await pool.query(
    `INSERT INTO contact_form_widgets
     (user_id, site_url, site_name, monitor_code, form_selector, field_mappings, pipeline_id, stage_key, owner_user_id, owner_round_robin)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      normalizedUrl,
      siteName.trim(),
      monitorCode,
      String(formSelector || 'form').trim() || 'form',
      serializeFieldMappings(mappings),
      pipeline.pipelineId,
      pipeline.stageKey,
      owner.ownerUserId,
      owner.ownerRoundRobin,
    ]
  );

  const widgets = await listFormWidgets(userId);
  return widgets.find((w) => w.id === String(result.insertId));
}

export async function updateFormWidget(
  userId,
  id,
  { siteUrl, siteName, formSelector, fieldMappings, active, pipelineId, stageKey, ownerUserId, ownerRoundRobin }
) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) throw new Error('ID inválido');

  const existing = await getFormWidgetById(userId, numericId);
  if (!existing) throw new Error('Rastreador não encontrado');

  const normalizedUrl = siteUrl !== undefined ? normalizeSiteUrl(siteUrl) : existing.siteUrl;
  if (!normalizedUrl) throw new Error('URL do site inválida');

  const pipeline = await resolveWidgetPipeline(
    userId,
    pipelineId !== undefined ? pipelineId : existing.pipelineId,
    stageKey !== undefined ? stageKey : existing.stageKey
  );
  const owner =
    ownerUserId !== undefined || ownerRoundRobin !== undefined
      ? await normalizeOwnerSetting(userId, { ownerUserId, ownerRoundRobin })
      : { ownerUserId: existing.ownerUserId ?? null, ownerRoundRobin: Boolean(existing.ownerRoundRobin) };

  await pool.query(
    `UPDATE contact_form_widgets
     SET site_url = ?, site_name = ?, form_selector = ?, field_mappings = ?, active = ?,
         pipeline_id = ?, stage_key = ?, owner_user_id = ?, owner_round_robin = ?, updated_at = NOW()
     WHERE id = ? AND user_id = ?`,
    [
      normalizedUrl,
      siteName !== undefined ? String(siteName).trim() : existing.siteName || '',
      formSelector !== undefined ? String(formSelector).trim() || 'form' : existing.formSelector || 'form',
      fieldMappings !== undefined ? serializeFieldMappings(fieldMappings) : serializeFieldMappings(existing.fieldMappings),
      active !== undefined ? !!active : !!existing.active,
      pipeline.pipelineId,
      pipeline.stageKey,
      owner.ownerUserId,
      owner.ownerRoundRobin,
      numericId,
      userId,
    ]
  );

  const widgets = await listFormWidgets(userId);
  return widgets.find((w) => w.id === String(numericId));
}

export async function deleteFormWidget(userId, id) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) throw new Error('ID inválido');
  const [result] = await pool.query('DELETE FROM contact_form_widgets WHERE id = ? AND user_id = ?', [
    numericId,
    userId,
  ]);
  if (result.affectedRows === 0) throw new Error('Rastreador não encontrado');
}

async function getFormWidgetById(userId, id) {
  const [rows] = await pool.query(
    `SELECT id, site_url AS siteUrl, site_name AS siteName, form_selector AS formSelector,
            field_mappings AS fieldMappings, active, pipeline_id AS pipelineId, stage_key AS stageKey,
            owner_user_id AS ownerUserId, owner_round_robin AS ownerRoundRobin
     FROM contact_form_widgets WHERE id = ? AND user_id = ? LIMIT 1`,
    [id, userId]
  );
  if (!rows[0]) return null;
  const normalized = normalizeRow(rows[0]);
  return { ...normalized, fieldMappings: parseFieldMappings(normalized.fieldMappings) };
}

export async function getFormWidgetByMonitorCode(monitorCode) {
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, site_url AS siteUrl, site_name AS siteName, active,
            monitor_code AS monitorCode, form_selector AS formSelector, field_mappings AS fieldMappings,
            pipeline_id AS pipelineId, stage_key AS stageKey,
            owner_user_id AS ownerUserId, owner_round_robin AS ownerRoundRobin
     FROM contact_form_widgets WHERE monitor_code = ? LIMIT 1`,
    [monitorCode]
  );
  const row = rows[0] ? normalizeRow(rows[0]) : null;
  if (!row || !row.active) return null;
  return {
    ...row,
    fieldMappings: parseFieldMappings(row.fieldMappings),
  };
}

export async function recordFormPing(monitorCode, event = 'view') {
  const widget = await getFormWidgetByMonitorCode(monitorCode);
  if (!widget) return false;

  if (event === 'submit') {
    await pool.query(
      `UPDATE contact_form_widgets SET form_submissions = form_submissions + 1, last_seen_at = NOW(), updated_at = NOW()
       WHERE monitor_code = ?`,
      [monitorCode]
    );
  } else {
    await pool.query(
      `UPDATE contact_form_widgets SET page_views = page_views + 1, last_seen_at = NOW(), updated_at = NOW()
       WHERE monitor_code = ?`,
      [monitorCode]
    );
  }
  return true;
}

function pickField(body, key, max = 0) {
  const value = String(body?.[key] || '').trim();
  return max ? value.slice(0, max) : value;
}

// Remove query/hash (utm, fbclid, igshid do Instagram) para a URL caber nas colunas VARCHAR
function cleanPageUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    return (u.origin + u.pathname).slice(0, 200);
  } catch {
    return raw.split(/[?#]/)[0].slice(0, 200);
  }
}

// Guarda o envio que falhou (com o corpo original) para o lead não se perder.
export async function recordFailedSubmission(monitorCode, body, err, req = {}) {
  try {
    await pool.query(
      `INSERT INTO contact_form_failed_submissions (monitor_code, payload, error_message, user_agent, referer)
       VALUES (?, ?, ?, ?, ?)`,
      [
        String(monitorCode || '').slice(0, 64),
        JSON.stringify(body ?? {}).slice(0, 20000),
        String(err?.message || err || '').slice(0, 2000),
        String(req.headers?.['user-agent'] || '').slice(0, 512),
        String(req.headers?.referer || '').slice(0, 512),
      ]
    );
  } catch (logErr) {
    console.error('[form] falha ao registrar envio com erro:', logErr?.message);
  }
}

export async function submitFormLead(monitorCode, body = {}) {
  const widget = await getFormWidgetByMonitorCode(monitorCode);
  if (!widget) throw new Error('Rastreador não encontrado ou inativo');

  const nome = pickField(body, 'nome', 160);
  const email = pickField(body, 'email', 160);
  const telefone = digitsOnly(pickField(body, 'telefone')).slice(0, 80);
  const mensagem = pickField(body, 'mensagem', 2000);
  const empresa = pickField(body, 'empresa', 120);
  const pageUrl = cleanPageUrl(body?.pageUrl);

  if (!nome && !email && telefone.length < 10) {
    throw new Error('Informe ao menos nome, e-mail ou telefone');
  }

  const contactName = (nome || email.split('@')[0] || `Lead ${telefone.slice(-4)}`).slice(0, 160);
  const userId = Number(widget.userId);
  if (!Number.isFinite(userId)) throw new Error('Rastreador sem proprietário válido');

  const siteLabel = widget.siteName || hostFromUrl(widget.siteUrl) || 'site';
  const parts = [`Formulário de contato · ${siteLabel}`];
  if (pageUrl) parts.push(pageUrl);
  if (empresa) parts.push(`Empresa: ${empresa}`);
  if (mensagem) parts.push(`Msg: ${mensagem.slice(0, 120)}`);
  parts.push(new Date().toLocaleDateString('pt-BR'));
  const ultimaInteracao = parts.join(' · ');

  const pipeline = await resolveWidgetPipeline(userId, widget.pipelineId, widget.stageKey);
  const ownerId = await resolveLeadOwner(userId, widget);

  const [contactIns] = await pool.query(
    `INSERT INTO contacts (user_id, created_by, nome, email, telefone, tipo, etapa, ultima_interacao, precisa_followup)
     VALUES (?, ?, ?, ?, ?, 'Lead', ?, ?, TRUE)`,
    [userId, ownerId, contactName, email, telefone, pipeline.stageTitle || 'Prospecção', ultimaInteracao.slice(0, 255)]
  );
  const contactId = contactIns.insertId;

  const dealTitle = empresa ? `${contactName} · ${empresa}` : contactName;
  await pool.query(
    `INSERT INTO deals (user_id, created_by, pipeline_id, contact_id, titulo, valor, prob, stage_key) VALUES (?, ?, ?, ?, ?, '', '20%', ?)`,
    [userId, ownerId, pipeline.pipelineId, contactId, dealTitle, pipeline.stageKey]
  );

  const quando = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const assunto = `Formulário de contato · ${siteLabel}`.slice(0, 200);
  const fromLabel = (email ? `${contactName} <${email}>` : contactName).slice(0, 160);
  const previewParts = [];
  if (mensagem) previewParts.push(mensagem);
  if (telefone) previewParts.push(`Telefone: ${telefone}`);
  if (empresa) previewParts.push(`Empresa: ${empresa}`);
  if (pageUrl) previewParts.push(`Página: ${pageUrl}`);
  const preview = (previewParts.join('\n') || `Novo lead enviado por ${siteLabel}`).slice(0, 255);

  await pool.query(
    `INSERT INTO emails (user_id, created_by, contact_id, company_id, de, assunto, preview, quando, status)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'Não lido')`,
    [userId, ownerId, contactId, fromLabel, assunto, preview, quando]
  );

  await recordFormPing(monitorCode, 'submit');

  return {
    ok: true,
    contact: { nome: contactName, email, telefone, mensagem, empresa },
  };
}

function escapeJsString(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n');
}

export function buildFormTrackingScript(widget) {
  const base = getPublicApiBase();
  const code = widget.monitorCode;
  const formSelector = escapeJsString(widget.formSelector || 'form');
  const fieldsJson = JSON.stringify(widget.fieldMappings || DEFAULT_FIELD_MAPPINGS);

  return `(function(){
  if (window.__veskFormLoaded && window.__veskFormLoaded['${code}']) return;
  window.__veskFormLoaded = window.__veskFormLoaded || {};
  window.__veskFormLoaded['${code}'] = true;

  var API = '${base}';
  var CODE = '${code}';
  var FORM_SEL = '${formSelector}';
  var FIELDS = ${fieldsJson};

  // vesk_preview=1: página aberta no mapa de calor do CRM — não conta visualização.
  var PREVIEW = /[?&]vesk_preview=1/.test(location.search);

  function ping(event) {
    if (PREVIEW) return;
    try {
      var img = new Image();
      img.src = API + '/api/form/' + CODE + '/ping?event=' + event + '&t=' + Date.now();
    } catch (e) {}
  }

  // Monitoramento do site (Sites no CRM); início e envio do formulário são detectados por ele.
  ${buildAnalyticsLoader(base, code)}

  function extractValue(selector) {
    if (!selector) return '';
    var parts = String(selector).split(',');
    for (var i = 0; i < parts.length; i++) {
      var sel = parts[i].trim();
      if (!sel) continue;
      var el = document.querySelector(sel);
      if (!el) continue;
      if (el.type === 'checkbox') return el.checked ? (el.value || 'sim') : '';
      if (el.type === 'radio') {
        var checked = document.querySelector(sel + ':checked');
        return checked ? (checked.value || '').trim() : '';
      }
      return String(el.value || '').trim();
    }
    return '';
  }

  function collectPayload() {
    var payload = { pageUrl: location.href };
    for (var i = 0; i < FIELDS.length; i++) {
      var f = FIELDS[i];
      if (f && f.crmField) payload[f.crmField] = extractValue(f.selector);
    }
    return payload;
  }

  // text/plain evita preflight CORS (WebViews como a do Instagram falham com keepalive + preflight).
  function sendLead() {
    var url = API + '/api/form/' + CODE + '/submit';
    var body = JSON.stringify(collectPayload());
    var sent = false;

    try {
      if (navigator.sendBeacon) {
        sent = navigator.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
      }
    } catch (e) {}
    if (sent) return;

    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: body,
        keepalive: true
      }).catch(xhrFallback);
    } catch (e) {
      xhrFallback();
    }

    function xhrFallback() {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
        xhr.send(body);
      } catch (e) {}
    }
  }

  function attachForm(form) {
    if (!form || form.__veskFormTracked) return;
    form.__veskFormTracked = true;
    form.addEventListener('submit', function() {
      sendLead();
    }, true);
  }

  function scan() {
    var forms = [];
    try {
      if (FORM_SEL && FORM_SEL !== 'form') {
        var nodes = document.querySelectorAll(FORM_SEL);
        for (var i = 0; i < nodes.length; i++) {
          if (nodes[i].tagName === 'FORM') forms.push(nodes[i]);
        }
      }
    } catch (e) {}
    if (forms.length === 0) {
      forms = Array.prototype.slice.call(document.querySelectorAll('form'));
    }
    for (var j = 0; j < forms.length; j++) attachForm(forms[j]);
  }

  ping('view');

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  var observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(function() { scan(); }) : null;
  if (observer && document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();`;
}
