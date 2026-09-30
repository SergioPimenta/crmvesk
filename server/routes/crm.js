import express from 'express';
import multer from 'multer';
import pool from '../db.js';
import { verifyToken } from '../middleware/auth.js';
import { archiveRows } from '../utils/archive.js';
import { isWorkspaceMember } from '../services/leadOwnerService.js';
import activitiesRouter from './activities.js';
import { normalizeRow, normalizeRows } from '../utils/rows.js';
import {
  listTemplates,
  createTemplate,
  renameTemplate,
  deleteTemplate,
} from '../services/proposalTemplateService.js';
import { sendProposalEmail } from '../services/proposalEmailService.js';

const router = express.Router();

router.use(verifyToken);

const templateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

// Usuários comuns só enxergam/alteram o que eles mesmos criaram; administradores enxergam tudo do workspace.
// Registros sem dono (created_by NULL — dados anteriores, leads de formulário/widget) ficam só para administradores.
const isAdmin = (req) => req.userRole === 'admin';
const ownSql = (req, alias = '') => (isAdmin(req) ? '' : ` AND ${alias}created_by = ?`);
const ownParams = (req) => (isAdmin(req) ? [] : [req.authUserId]);

const asId = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toStageKey = (s) => {
  if (!s) return '';
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
};

const ensureDefaultPipeline = async (userId) => {
  const [rows] = await pool.query('SELECT id, nome FROM pipelines WHERE user_id = ? ORDER BY is_default DESC, id ASC LIMIT 1', [userId]);
  if (rows.length > 0) return rows[0];

  const [ins] = await pool.query('INSERT INTO pipelines (user_id, nome, is_default) VALUES (?, ?, TRUE)', [userId, 'Funil padrão']);
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

  return { id: pipelineId, nome: 'Funil padrão' };
};

async function clearContactNovoOnDealMove(userId, dealBefore, newStageKey) {
  if (!dealBefore || dealBefore.stageKey === newStageKey) return;

  let contactId = dealBefore.contactId ?? dealBefore.contatoId;
  if (!contactId && dealBefore.titulo) {
    const [cRows] = await pool.query(
      `SELECT id FROM contacts WHERE user_id = ? AND nome = ? AND precisa_followup = TRUE
       ORDER BY id DESC LIMIT 1`,
      [userId, dealBefore.titulo]
    );
    contactId = cRows[0]?.id;
  }
  if (!contactId) return;

  const pipelineId = dealBefore.pipelineId;
  let etapa = 'Prospecção';
  if (pipelineId) {
    const [stageRows] = await pool.query(
      `SELECT titulo FROM pipeline_stages WHERE user_id = ? AND pipeline_id = ? AND stage_key = ? LIMIT 1`,
      [userId, pipelineId, newStageKey]
    );
    if (stageRows[0]?.titulo) etapa = stageRows[0].titulo;
  }

  await pool.query(
    `UPDATE contacts SET precisa_followup = FALSE, etapa = ?, updated_at = NOW()
     WHERE id = ? AND user_id = ? AND precisa_followup = TRUE`,
    [etapa, contactId, userId]
  );
}

async function getDealForUser(req, id) {
  const [rows] = await pool.query(
    `SELECT stage_key AS stageKey, contact_id AS contactId, titulo, pipeline_id AS pipelineId
     FROM deals WHERE id = ? AND user_id = ?${ownSql(req)} LIMIT 1`,
    [id, req.userId, ...ownParams(req)]
  );
  return rows[0] ? normalizeRow(rows[0]) : null;
}

// Pipelines
router.get('/pipelines', async (req, res) => {
  await ensureDefaultPipeline(req.userId);
  const [rows] = await pool.query('SELECT id, nome, is_default AS isDefault FROM pipelines WHERE user_id = ? ORDER BY is_default DESC, id DESC', [
    req.userId,
  ]);
  res.json(normalizeRows(rows));
});

router.post('/pipelines', async (req, res) => {
  const { nome } = req.body ?? {};
  if (!nome) return res.status(400).json({ message: 'Nome é obrigatório' });
  const [result] = await pool.query('INSERT INTO pipelines (user_id, nome, is_default) VALUES (?, ?, FALSE)', [req.userId, nome]);
  res.status(201).json({ id: result.insertId });
});

router.put('/pipelines/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { nome } = req.body ?? {};
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });
  if (!nome) return res.status(400).json({ message: 'Nome é obrigatório' });
  await pool.query('UPDATE pipelines SET nome = ? WHERE id = ? AND user_id = ?', [nome, id, req.userId]);
  res.status(204).send();
});

router.delete('/pipelines/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });

  const [[countRow]] = await pool.query('SELECT COUNT(*) AS total FROM pipelines WHERE user_id = ?', [req.userId]);
  if (Number(countRow.total) <= 1) {
    return res.status(400).json({ message: 'Não é possível excluir o único funil.' });
  }

  const [[pipeline]] = await pool.query('SELECT id, is_default AS isDefault FROM pipelines WHERE id = ? AND user_id = ?', [
    id,
    req.userId,
  ]);
  if (!pipeline) return res.status(404).json({ message: 'Funil não encontrado' });

  await pool.query('DELETE FROM deals WHERE pipeline_id = ? AND user_id = ?', [id, req.userId]);
  await pool.query('DELETE FROM pipelines WHERE id = ? AND user_id = ?', [id, req.userId]);

  if (pipeline.isDefault) {
    const [[nextDefault]] = await pool.query(
      'SELECT id FROM pipelines WHERE user_id = ? ORDER BY id ASC LIMIT 1',
      [req.userId]
    );
    if (nextDefault) {
      await pool.query('UPDATE pipelines SET is_default = 0 WHERE user_id = ?', [req.userId]);
      await pool.query('UPDATE pipelines SET is_default = 1 WHERE id = ? AND user_id = ?', [nextDefault.id, req.userId]);
    }
  }

  res.status(204).send();
});

// Stages
router.get('/pipelines/:id/stages', async (req, res) => {
  const pipelineId = Number(req.params.id);
  if (!Number.isFinite(pipelineId)) return res.status(400).json({ message: 'ID inválido' });
  const [rows] = await pool.query(
    'SELECT id, pipeline_id AS pipelineId, stage_key AS stageKey, titulo, cor, pos FROM pipeline_stages WHERE user_id = ? AND pipeline_id = ? ORDER BY pos ASC, id ASC',
    [req.userId, pipelineId]
  );
  res.json(normalizeRows(rows));
});

router.post('/pipelines/:id/stages', async (req, res) => {
  const pipelineId = Number(req.params.id);
  const { titulo, cor = '#7a7880', stageKey } = req.body ?? {};
  if (!Number.isFinite(pipelineId)) return res.status(400).json({ message: 'ID inválido' });
  if (!titulo) return res.status(400).json({ message: 'Título é obrigatório' });

  const [pipelineRows] = await pool.query('SELECT id FROM pipelines WHERE id = ? AND user_id = ? LIMIT 1', [
    pipelineId,
    req.userId,
  ]);
  if (!pipelineRows[0]) return res.status(404).json({ message: 'Funil não encontrado' });

  let key = toStageKey(stageKey || titulo);
  if (!key) return res.status(400).json({ message: 'StageKey inválido' });

  const [dupRows] = await pool.query(
    'SELECT id FROM pipeline_stages WHERE user_id = ? AND pipeline_id = ? AND stage_key = ? LIMIT 1',
    [req.userId, pipelineId, key]
  );
  if (dupRows.length > 0) {
    key = `${key}_${Date.now()}`;
  }

  const [maxRows] = await pool.query(
    'SELECT COALESCE(MAX(pos), -1) AS maxPos FROM pipeline_stages WHERE user_id = ? AND pipeline_id = ?',
    [req.userId, pipelineId]
  );
  const pos = Number(maxRows[0]?.maxPos ?? -1) + 1;

  const [result] = await pool.query(
    'INSERT INTO pipeline_stages (user_id, pipeline_id, stage_key, titulo, cor, pos) VALUES (?, ?, ?, ?, ?, ?)',
    [req.userId, pipelineId, key, titulo, cor, pos]
  );
  res.status(201).json({ id: result.insertId, stageKey: key, pos });
});

router.put('/pipelines/:id/stages/:stageId', async (req, res) => {
  const pipelineId = Number(req.params.id);
  const stageId = Number(req.params.stageId);
  const { titulo, cor = '#7a7880', pos } = req.body ?? {};
  if (!Number.isFinite(pipelineId) || !Number.isFinite(stageId)) return res.status(400).json({ message: 'ID inválido' });
  if (!titulo) return res.status(400).json({ message: 'Título é obrigatório' });
  await pool.query(
    'UPDATE pipeline_stages SET titulo = ?, cor = ?, pos = ? WHERE id = ? AND pipeline_id = ? AND user_id = ?',
    [titulo, cor, Number.isFinite(Number(pos)) ? Number(pos) : 0, stageId, pipelineId, req.userId]
  );
  res.status(204).send();
});

router.delete('/pipelines/:id/stages/:stageId', async (req, res) => {
  const pipelineId = Number(req.params.id);
  const stageId = Number(req.params.stageId);
  if (!Number.isFinite(pipelineId) || !Number.isFinite(stageId)) {
    return res.status(400).json({ message: 'ID inválido' });
  }

  const [[countRow]] = await pool.query(
    'SELECT COUNT(*) AS total FROM pipeline_stages WHERE user_id = ? AND pipeline_id = ?',
    [req.userId, pipelineId]
  );
  if (Number(countRow.total) <= 1) {
    return res.status(400).json({ message: 'O funil precisa ter pelo menos uma etapa.' });
  }

  const [[stage]] = await pool.query(
    'SELECT id, stage_key AS stageKey FROM pipeline_stages WHERE id = ? AND pipeline_id = ? AND user_id = ?',
    [stageId, pipelineId, req.userId]
  );
  if (!stage) return res.status(404).json({ message: 'Etapa não encontrada' });

  const [[fallback]] = await pool.query(
    'SELECT stage_key AS stageKey FROM pipeline_stages WHERE user_id = ? AND pipeline_id = ? AND id != ? ORDER BY pos ASC, id ASC LIMIT 1',
    [req.userId, pipelineId, stageId]
  );
  if (fallback?.stageKey) {
    await pool.query('UPDATE deals SET stage_key = ? WHERE user_id = ? AND pipeline_id = ? AND stage_key = ?', [
      fallback.stageKey,
      req.userId,
      pipelineId,
      stage.stageKey,
    ]);
  }

  await pool.query('DELETE FROM pipeline_stages WHERE id = ? AND pipeline_id = ? AND user_id = ?', [
    stageId,
    pipelineId,
    req.userId,
  ]);

  res.status(204).send();
});

// Companies
router.get('/companies', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, nome, segmento, etapa, proxima_acao AS proximaAcao, prioridade FROM companies WHERE user_id = ?${ownSql(req)} ORDER BY id DESC`,
    [req.userId, ...ownParams(req)]
  );
  res.json(normalizeRows(rows));
});

router.post('/companies', async (req, res) => {
  const { nome, segmento = '', etapa = 'Prospecção', proximaAcao = '', prioridade = 'Média' } = req.body ?? {};
  if (!nome) return res.status(400).json({ message: 'Nome é obrigatório' });

  const [result] = await pool.query(
    'INSERT INTO companies (user_id, created_by, nome, segmento, etapa, proxima_acao, prioridade) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.userId, req.authUserId, nome, segmento, etapa, proximaAcao, prioridade]
  );
  res.status(201).json({ id: result.insertId });
});

router.put('/companies/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { nome, segmento = '', etapa = 'Prospecção', proximaAcao = '', prioridade = 'Média' } = req.body ?? {};
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });
  if (!nome) return res.status(400).json({ message: 'Nome é obrigatório' });

  await pool.query(
    `UPDATE companies SET nome = ?, segmento = ?, etapa = ?, proxima_acao = ?, prioridade = ? WHERE id = ? AND user_id = ?${ownSql(req)}`,
    [nome, segmento, etapa, proximaAcao, prioridade, id, req.userId, ...ownParams(req)]
  );
  res.status(204).send();
});

// Contacts
const CONTACT_TYPES = new Set(['Lead', 'Cliente', 'Prospect']);
const likeEscape = (v) => String(v).replace(/[\\%_]/g, (m) => `\\${m}`);

// Listagem paginada com busca no servidor (?page=1&pageSize=50&q=texto&tipo=Lead&unowned=1).
// Sem "page" a rota devolve a lista completa (usada pelo contexto do CRM: dashboard, funil, seletores).
async function listContactsPage(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 50));

  const where = ['c.user_id = ?'];
  const params = [req.userId];
  if (!isAdmin(req)) {
    where.push('c.created_by = ?');
    params.push(req.authUserId);
  } else if (req.query.unowned === '1') {
    where.push('c.created_by IS NULL');
  }
  if (CONTACT_TYPES.has(req.query.tipo)) {
    where.push('c.tipo = ?');
    params.push(req.query.tipo);
  }

  const q = String(req.query.q ?? '').trim().slice(0, 100);
  if (q) {
    const like = `%${likeEscape(q)}%`;
    const clauses = [
      "c.nome ILIKE ? ESCAPE '\\'",
      "c.email ILIKE ? ESCAPE '\\'",
      "c.site ILIKE ? ESCAPE '\\'",
      "c.telefone ILIKE ? ESCAPE '\\'",
      "EXISTS (SELECT 1 FROM companies co WHERE co.id = c.company_id AND co.nome ILIKE ? ESCAPE '\\')",
    ];
    params.push(like, like, like, like, like);
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 3) {
      clauses.push("REGEXP_REPLACE(c.telefone, '\\D', '', 'g') LIKE ?");
      params.push(`%${digits}%`);
    }
    where.push(`(${clauses.join(' OR ')})`);
  }

  const whereSql = where.join(' AND ');
  const [countRows] = await pool.query(`SELECT COUNT(*)::int AS total FROM contacts c WHERE ${whereSql}`, params);
  const total = Number(countRows[0]?.total) || 0;

  const [rows] = await pool.query(
    `SELECT c.id, c.company_id AS empresaId, c.nome, c.email, c.telefone, c.site, c.tipo, c.etapa,
            c.ultima_interacao AS ultimaInteracao, c.precisa_followup AS precisaFollowUp, c.created_by AS ownerId
     FROM contacts c WHERE ${whereSql} ORDER BY c.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]
  );
  // Administradores também recebem quantos contatos do workspace estão sem responsável (não depende dos filtros).
  let unownedTotal;
  if (isAdmin(req)) {
    const [unownedRows] = await pool.query(
      'SELECT COUNT(*)::int AS total FROM contacts WHERE user_id = ? AND created_by IS NULL',
      [req.userId]
    );
    unownedTotal = Number(unownedRows[0]?.total) || 0;
  }
  res.json({ items: normalizeRows(rows), total, page, pageSize, unownedTotal });
}

router.get('/contacts', async (req, res) => {
  if (req.query.page !== undefined) return listContactsPage(req, res);
  const [rows] = await pool.query(
    `SELECT id, company_id AS empresaId, nome, email, telefone, site, tipo, etapa, ultima_interacao AS ultimaInteracao, precisa_followup AS precisaFollowUp,
            created_by AS ownerId
     FROM contacts WHERE user_id = ?${ownSql(req)} ORDER BY id DESC`,
    [req.userId, ...ownParams(req)]
  );
  res.json(normalizeRows(rows));
});

router.post('/contacts', async (req, res) => {
  const {
    empresaId,
    nome,
    email = '',
    telefone = '',
    site = '',
    tipo = 'Lead',
    etapa = 'Prospecção',
    ultimaInteracao = '',
    precisaFollowUp = false,
    pipelineId,
    stageKey,
  } = req.body ?? {};
  if (!nome) return res.status(400).json({ message: 'Nome é obrigatório' });
  if (!stageKey) return res.status(400).json({ message: 'Etapa do funil é obrigatória' });

  let contactId;
  let dealId = null;
  let resolvedPipelineId = null;

  try {
    await pool.transaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO contacts (user_id, created_by, company_id, nome, email, telefone, site, tipo, etapa, ultima_interacao, precisa_followup)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.userId, req.authUserId, asId(empresaId), nome, email, telefone, site, tipo, etapa, ultimaInteracao, !!precisaFollowUp]
      );
      contactId = result.insertId;

      if (stageKey) {
        const pipeId = asId(pipelineId) ?? (await ensureDefaultPipeline(req.userId)).id;
        resolvedPipelineId = pipeId;
        const [stageRows] = await conn.query(
          'SELECT id FROM pipeline_stages WHERE user_id = ? AND pipeline_id = ? AND stage_key = ? LIMIT 1',
          [req.userId, pipeId, stageKey]
        );
        if (!stageRows[0]) {
          const err = new Error('Etapa inválida para o funil selecionado');
          err.statusCode = 400;
          throw err;
        }

        const [dealResult] = await conn.query(
          `INSERT INTO deals (user_id, created_by, pipeline_id, company_id, contact_id, titulo, valor, prob, stage_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.userId, req.authUserId, pipeId, asId(empresaId), contactId, nome, '', '20%', stageKey]
        );
        dealId = dealResult.insertId;
      }
    });
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({ message: err.message });
    }
    throw err;
  }

  res.status(201).json({
    id: contactId,
    dealId,
    pipelineId: resolvedPipelineId,
    stageKey: dealId ? stageKey : null,
  });
});

router.post('/contacts/bulk-import', async (req, res) => {
  const { items = [], pipelineId, stageKey, etapa = 'Prospecção' } = req.body ?? {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Nenhum contato para importar' });
  }
  if (!stageKey) return res.status(400).json({ message: 'Etapa do funil é obrigatória' });

  const saved = [];
  let skipped = 0;
  let resolvedPipelineId = null;

  const contactKey = (nome, telefone) => {
    const phone = String(telefone || '').replace(/\D/g, '');
    return `${String(nome || '').trim().toLowerCase()}|${phone}`;
  };

  try {
    await pool.transaction(async (conn) => {
      const pipeId = asId(pipelineId) ?? (await ensureDefaultPipeline(req.userId)).id;
      resolvedPipelineId = pipeId;

      const [stageRows] = await conn.query(
        'SELECT id FROM pipeline_stages WHERE user_id = ? AND pipeline_id = ? AND stage_key = ? LIMIT 1',
        [req.userId, pipeId, stageKey]
      );
      if (!stageRows[0]) {
        const err = new Error('Etapa inválida para o funil selecionado');
        err.statusCode = 400;
        throw err;
      }

      const [existingRows] = await conn.query('SELECT nome, telefone FROM contacts WHERE user_id = ?', [req.userId]);
      const existing = new Set(existingRows.map((row) => contactKey(row.nome, row.telefone)));

      for (const item of items) {
        const nome = String(item.nome || '').trim();
        if (!nome) {
          skipped += 1;
          continue;
        }

        const telefone = String(item.telefone || '').trim();
        const key = contactKey(nome, telefone);
        if (existing.has(key)) {
          skipped += 1;
          continue;
        }

        const ultimaInteracao = String(item.ultimaInteracao || 'Google Maps').trim();
        const contactEtapa = String(item.etapa || etapa || 'Prospecção');
        const site = String(item.site || '').trim();

        const [contactResult] = await conn.query(
          `INSERT INTO contacts (user_id, created_by, company_id, nome, email, telefone, site, tipo, etapa, ultima_interacao, precisa_followup)
           VALUES (?, ?, NULL, ?, '', ?, ?, 'Lead', ?, ?, TRUE)`,
          [req.userId, req.authUserId, nome, telefone, site, contactEtapa, ultimaInteracao]
        );
        const contactId = contactResult.insertId;

        const [dealResult] = await conn.query(
          `INSERT INTO deals (user_id, created_by, pipeline_id, company_id, contact_id, titulo, valor, prob, stage_key)
           VALUES (?, ?, ?, NULL, ?, ?, '', '20%', ?)`,
          [req.userId, req.authUserId, pipeId, contactId, nome, stageKey]
        );

        existing.add(key);
        saved.push({ contactId, dealId: dealResult.insertId, nome });
      }
    });
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({ message: err.message });
    }
    throw err;
  }

  res.status(201).json({
    saved: saved.length,
    skipped,
    items: saved,
    pipelineId: resolvedPipelineId,
    stageKey,
  });
});

// Atribuição de responsável em massa (só administradores). Move também os negócios, atividades, propostas e
// e-mails ligados aos contatos, para que o novo responsável veja o histórico completo. userId null = sem responsável.
router.put('/contacts/assign-owner', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: 'Acesso restrito a administradores' });

  const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger))];
  if (ids.length === 0) return res.status(400).json({ message: 'Selecione ao menos um contato' });
  if (ids.length > 500) return res.status(400).json({ message: 'Selecione no máximo 500 contatos por vez' });

  const rawOwner = req.body?.userId;
  const ownerId = rawOwner === null || rawOwner === undefined || rawOwner === '' ? null : Number(rawOwner);
  if (ownerId !== null && !Number.isInteger(ownerId)) return res.status(400).json({ message: 'Usuário inválido' });
  if (ownerId !== null && !(await isWorkspaceMember(req.userId, ownerId))) {
    return res.status(400).json({ message: 'Usuário não faz parte deste workspace' });
  }

  const marks = ids.map(() => '?').join(', ');
  const [updated] = await pool.query(
    `UPDATE contacts SET created_by = ?, updated_at = NOW() WHERE user_id = ? AND id IN (${marks})`,
    [ownerId, req.userId, ...ids]
  );
  for (const table of ['deals', 'activities', 'proposals', 'emails']) {
    await pool.query(`UPDATE ${table} SET created_by = ? WHERE user_id = ? AND contact_id IN (${marks})`, [
      ownerId,
      req.userId,
      ...ids,
    ]);
  }
  res.json({ updated: updated.affectedRows ?? ids.length });
});

router.put('/contacts/:id', async (req, res) => {
  const id = Number(req.params.id);
  const {
    empresaId,
    nome,
    email = '',
    telefone = '',
    site = '',
    tipo = 'Lead',
    etapa = 'Prospecção',
    ultimaInteracao = '',
    precisaFollowUp = false,
  } = req.body ?? {};
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });
  if (!nome) return res.status(400).json({ message: 'Nome é obrigatório' });

  await pool.query(
    `UPDATE contacts
     SET company_id = ?, nome = ?, email = ?, telefone = ?, site = ?, tipo = ?, etapa = ?, ultima_interacao = ?, precisa_followup = ?
     WHERE id = ? AND user_id = ?${ownSql(req)}`,
    [asId(empresaId), nome, email, telefone, site, tipo, etapa, ultimaInteracao, !!precisaFollowUp, id, req.userId, ...ownParams(req)]
  );
  res.status(204).send();
});

router.delete('/contacts/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });

  await archiveRows(req, 'contacts', `id = ? AND user_id = ?${ownSql(req)}`, [id, req.userId, ...ownParams(req)]);
  const [result] = await pool.query(`DELETE FROM contacts WHERE id = ? AND user_id = ?${ownSql(req)}`, [
    id,
    req.userId,
    ...ownParams(req),
  ]);
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Contato não encontrado' });

  res.status(204).send();
});

// Deals
router.get('/deals', async (req, res) => {
  await ensureDefaultPipeline(req.userId);
  const [rows] = await pool.query(
    `SELECT d.id, d.pipeline_id AS pipelineId, d.company_id AS empresaId, d.contact_id AS contatoId,
            d.titulo, d.valor, d.prob, d.stage_key AS stageKey,
            c.nome AS contatoNome, c.email AS contatoEmail, c.telefone AS contatoTelefone
     FROM deals d
     LEFT JOIN contacts c ON c.id = d.contact_id AND c.user_id = d.user_id
     WHERE d.user_id = ?${ownSql(req, 'd.')} ORDER BY d.id DESC`,
    [req.userId, ...ownParams(req)]
  );
  res.json(normalizeRows(rows));
});

router.post('/deals', async (req, res) => {
  const { pipelineId, empresaId, titulo, valor = '', prob = '', stageKey = 'prospeccao' } = req.body ?? {};
  if (!titulo) return res.status(400).json({ message: 'Título é obrigatório' });

  const pipeId = asId(pipelineId) ?? (await ensureDefaultPipeline(req.userId)).id;
  const [stageRows] = await pool.query(
    'SELECT id FROM pipeline_stages WHERE user_id = ? AND pipeline_id = ? AND stage_key = ? LIMIT 1',
    [req.userId, pipeId, stageKey]
  );
  if (!stageRows[0]) {
    return res.status(400).json({ message: 'Etapa inválida para o funil selecionado' });
  }

  const [result] = await pool.query(
    `INSERT INTO deals (user_id, created_by, pipeline_id, company_id, titulo, valor, prob, stage_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.userId, req.authUserId, pipeId, asId(empresaId), titulo, valor, prob, stageKey]
  );
  res.status(201).json({ id: result.insertId, pipelineId: pipeId, stageKey });
});

router.put('/deals/:id/stage', async (req, res) => {
  const id = Number(req.params.id);
  const { stageKey } = req.body ?? {};
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });
  if (!stageKey) return res.status(400).json({ message: 'StageKey é obrigatório' });

  const dealBefore = await getDealForUser(req, id);
  if (!dealBefore) return res.status(404).json({ message: 'Negócio não encontrado' });
  if (dealBefore.stageKey === stageKey) return res.status(204).send();

  await pool.query(`UPDATE deals SET stage_key = ? WHERE id = ? AND user_id = ?${ownSql(req)}`, [
    stageKey,
    id,
    req.userId,
    ...ownParams(req),
  ]);
  await clearContactNovoOnDealMove(req.userId, dealBefore, stageKey);
  res.status(204).send();
});

router.put('/deals/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { pipelineId, empresaId, titulo, valor = '', prob = '', stageKey = 'prospeccao' } = req.body ?? {};
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });
  if (!titulo) return res.status(400).json({ message: 'Título é obrigatório' });

  const dealBefore = await getDealForUser(req, id);
  if (!dealBefore) return res.status(404).json({ message: 'Negócio não encontrado' });

  const pipeId = asId(pipelineId) ?? (await ensureDefaultPipeline(req.userId)).id;
  const [result] = await pool.query(
    `UPDATE deals SET pipeline_id = ?, company_id = ?, titulo = ?, valor = ?, prob = ?, stage_key = ? WHERE id = ? AND user_id = ?${ownSql(req)}`,
    [pipeId, asId(empresaId), titulo, valor, prob, stageKey, id, req.userId, ...ownParams(req)]
  );
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Negócio não encontrado' });

  await clearContactNovoOnDealMove(req.userId, { ...dealBefore, pipelineId: pipeId }, stageKey);
  res.status(204).send();
});

router.delete('/deals/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });

  await archiveRows(req, 'deals', `id = ? AND user_id = ?${ownSql(req)}`, [id, req.userId, ...ownParams(req)]);
  const [result] = await pool.query(`DELETE FROM deals WHERE id = ? AND user_id = ?${ownSql(req)}`, [
    id,
    req.userId,
    ...ownParams(req),
  ]);
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Negócio não encontrado' });
  res.status(204).send();
});

// Activities (Agenda): rotas em ./activities.js
router.use('/activities', activitiesRouter);

// Emails
router.get('/emails', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, contact_id AS contatoId, company_id AS empresaId, de, assunto, preview, quando, status
     FROM emails WHERE user_id = ?${ownSql(req)} ORDER BY id DESC`,
    [req.userId, ...ownParams(req)]
  );
  res.json(normalizeRows(rows));
});

router.post('/emails', async (req, res) => {
  const { contatoId, empresaId, de, assunto = '', preview = '', quando = '', status = 'Não lido' } = req.body ?? {};
  if (!de) return res.status(400).json({ message: 'De é obrigatório' });
  const [result] = await pool.query(
    `INSERT INTO emails (user_id, created_by, contact_id, company_id, de, assunto, preview, quando, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.userId, req.authUserId, asId(contatoId), asId(empresaId), de, assunto, preview, quando, status]
  );
  res.status(201).json({ id: result.insertId });
});

router.put('/emails/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });
  const { status } = req.body ?? {};
  if (!status) return res.status(400).json({ message: 'Status é obrigatório' });
  const [result] = await pool.query(
    `UPDATE emails SET status = ?, updated_at = NOW() WHERE id = ? AND user_id = ?${ownSql(req)}`,
    [status, id, req.userId, ...ownParams(req)]
  );
  if (result.affectedRows === 0) return res.status(404).json({ message: 'E-mail não encontrado' });
  res.status(204).send();
});

router.delete('/emails/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });
  await archiveRows(req, 'emails', `id = ? AND user_id = ?${ownSql(req)}`, [id, req.userId, ...ownParams(req)]);
  const [result] = await pool.query(`DELETE FROM emails WHERE id = ? AND user_id = ?${ownSql(req)}`, [
    id,
    req.userId,
    ...ownParams(req),
  ]);
  if (result.affectedRows === 0) return res.status(404).json({ message: 'E-mail não encontrado' });
  res.status(204).send();
});

// Proposals
const asFieldValues = (v) => {
  if (v && typeof v === 'object' && !Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === 'object' ? JSON.stringify(parsed) : '{}';
    } catch {
      return '{}';
    }
  }
  return '{}';
};

router.get('/proposals', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, contact_id AS contatoId, company_id AS empresaId, deal_id AS dealId, titulo, valor, status, enviada_em AS enviadaEm,
            template_id AS templateId, field_values AS fieldValues, email_sent_at AS emailSentAt
     FROM proposals WHERE user_id = ?${ownSql(req)} ORDER BY id DESC`,
    [req.userId, ...ownParams(req)]
  );
  res.json(normalizeRows(rows));
});

router.post('/proposals/:id/send-email', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });
  try {
    const [own] = await pool.query(`SELECT id FROM proposals WHERE id = ? AND user_id = ?${ownSql(req)}`, [
      id,
      req.userId,
      ...ownParams(req),
    ]);
    if (!own.length) return res.status(404).json({ message: 'Proposta não encontrada' });
    const result = await sendProposalEmail(req.userId, id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/proposals', async (req, res) => {
  const {
    contatoId,
    empresaId,
    dealId,
    titulo,
    valor = '',
    status = 'Enviada',
    enviadaEm = '',
    templateId,
    fieldValues,
  } = req.body ?? {};
  if (!titulo) return res.status(400).json({ message: 'Título é obrigatório' });
  const [result] = await pool.query(
    `INSERT INTO proposals (user_id, created_by, contact_id, company_id, deal_id, titulo, valor, status, enviada_em, template_id, field_values)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.userId,
      req.authUserId,
      asId(contatoId),
      asId(empresaId),
      asId(dealId),
      titulo,
      valor,
      status,
      enviadaEm,
      asId(templateId),
      asFieldValues(fieldValues),
    ]
  );
  res.status(201).json({ id: result.insertId });
});

router.put('/proposals/:id', async (req, res) => {
  const id = Number(req.params.id);
  const {
    contatoId,
    empresaId,
    dealId,
    titulo,
    valor = '',
    status = 'Enviada',
    enviadaEm = '',
    templateId,
    fieldValues,
  } = req.body ?? {};
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });
  if (!titulo) return res.status(400).json({ message: 'Título é obrigatório' });

  await pool.query(
    `UPDATE proposals SET contact_id = ?, company_id = ?, deal_id = ?, titulo = ?, valor = ?, status = ?, enviada_em = ?,
            template_id = ?, field_values = ?
     WHERE id = ? AND user_id = ?${ownSql(req)}`,
    [
      asId(contatoId),
      asId(empresaId),
      asId(dealId),
      titulo,
      valor,
      status,
      enviadaEm,
      asId(templateId),
      asFieldValues(fieldValues),
      id,
      req.userId,
      ...ownParams(req),
    ]
  );
  res.status(204).send();
});

// Modelos de propostas
router.get('/proposal-templates', async (req, res) => {
  try {
    const templates = await listTemplates(req.userId);
    res.json(templates);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/proposal-templates', templateUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Selecione um arquivo' });
    const { nome, descricao, fields } = req.body ?? {};
    const result = await createTemplate(req.userId, {
      nome,
      descricao,
      fields,
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/proposal-templates/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });
  try {
    const result = await renameTemplate(req.userId, id, req.body ?? {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/proposal-templates/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });
  try {
    await deleteTemplate(req.userId, id);
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;

