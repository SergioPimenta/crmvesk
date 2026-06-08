import express from 'express';
import pool from '../db.js';
import { verifyToken } from '../middleware/auth.js';
import { normalizeRow, normalizeRows } from '../utils/rows.js';

const router = express.Router();

router.use(verifyToken);

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

async function getDealForUser(userId, id) {
  const [rows] = await pool.query(
    `SELECT stage_key AS stageKey, contact_id AS contactId, titulo, pipeline_id AS pipelineId
     FROM deals WHERE id = ? AND user_id = ? LIMIT 1`,
    [id, userId]
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
    'SELECT id, nome, segmento, etapa, proxima_acao AS proximaAcao, prioridade FROM companies WHERE user_id = ? ORDER BY id DESC',
    [req.userId]
  );
  res.json(normalizeRows(rows));
});

router.post('/companies', async (req, res) => {
  const { nome, segmento = '', etapa = 'Prospecção', proximaAcao = '', prioridade = 'Média' } = req.body ?? {};
  if (!nome) return res.status(400).json({ message: 'Nome é obrigatório' });

  const [result] = await pool.query(
    'INSERT INTO companies (user_id, nome, segmento, etapa, proxima_acao, prioridade) VALUES (?, ?, ?, ?, ?, ?)',
    [req.userId, nome, segmento, etapa, proximaAcao, prioridade]
  );
  res.status(201).json({ id: result.insertId });
});

router.put('/companies/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { nome, segmento = '', etapa = 'Prospecção', proximaAcao = '', prioridade = 'Média' } = req.body ?? {};
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });
  if (!nome) return res.status(400).json({ message: 'Nome é obrigatório' });

  await pool.query(
    'UPDATE companies SET nome = ?, segmento = ?, etapa = ?, proxima_acao = ?, prioridade = ? WHERE id = ? AND user_id = ?',
    [nome, segmento, etapa, proximaAcao, prioridade, id, req.userId]
  );
  res.status(204).send();
});

// Contacts
router.get('/contacts', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, company_id AS empresaId, nome, email, telefone, tipo, etapa, ultima_interacao AS ultimaInteracao, precisa_followup AS precisaFollowUp
     FROM contacts WHERE user_id = ? ORDER BY id DESC`,
    [req.userId]
  );
  res.json(normalizeRows(rows));
});

router.post('/contacts', async (req, res) => {
  const {
    empresaId,
    nome,
    email = '',
    telefone = '',
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
        `INSERT INTO contacts (user_id, company_id, nome, email, telefone, tipo, etapa, ultima_interacao, precisa_followup)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.userId, asId(empresaId), nome, email, telefone, tipo, etapa, ultimaInteracao, !!precisaFollowUp]
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
          `INSERT INTO deals (user_id, pipeline_id, company_id, contact_id, titulo, valor, prob, stage_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.userId, pipeId, asId(empresaId), contactId, nome, '', '20%', stageKey]
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

router.put('/contacts/:id', async (req, res) => {
  const id = Number(req.params.id);
  const {
    empresaId,
    nome,
    email = '',
    telefone = '',
    tipo = 'Lead',
    etapa = 'Prospecção',
    ultimaInteracao = '',
    precisaFollowUp = false,
  } = req.body ?? {};
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });
  if (!nome) return res.status(400).json({ message: 'Nome é obrigatório' });

  await pool.query(
    `UPDATE contacts
     SET company_id = ?, nome = ?, email = ?, telefone = ?, tipo = ?, etapa = ?, ultima_interacao = ?, precisa_followup = ?
     WHERE id = ? AND user_id = ?`,
    [asId(empresaId), nome, email, telefone, tipo, etapa, ultimaInteracao, !!precisaFollowUp, id, req.userId]
  );
  res.status(204).send();
});

router.delete('/contacts/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });

  const [result] = await pool.query('DELETE FROM contacts WHERE id = ? AND user_id = ?', [id, req.userId]);
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
     WHERE d.user_id = ? ORDER BY d.id DESC`,
    [req.userId]
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
    `INSERT INTO deals (user_id, pipeline_id, company_id, titulo, valor, prob, stage_key) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.userId, pipeId, asId(empresaId), titulo, valor, prob, stageKey]
  );
  res.status(201).json({ id: result.insertId, pipelineId: pipeId, stageKey });
});

router.put('/deals/:id/stage', async (req, res) => {
  const id = Number(req.params.id);
  const { stageKey } = req.body ?? {};
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });
  if (!stageKey) return res.status(400).json({ message: 'StageKey é obrigatório' });

  const dealBefore = await getDealForUser(req.userId, id);
  if (!dealBefore) return res.status(404).json({ message: 'Negócio não encontrado' });
  if (dealBefore.stageKey === stageKey) return res.status(204).send();

  await pool.query('UPDATE deals SET stage_key = ? WHERE id = ? AND user_id = ?', [stageKey, id, req.userId]);
  await clearContactNovoOnDealMove(req.userId, dealBefore, stageKey);
  res.status(204).send();
});

router.put('/deals/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { pipelineId, empresaId, titulo, valor = '', prob = '', stageKey = 'prospeccao' } = req.body ?? {};
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });
  if (!titulo) return res.status(400).json({ message: 'Título é obrigatório' });

  const dealBefore = await getDealForUser(req.userId, id);
  if (!dealBefore) return res.status(404).json({ message: 'Negócio não encontrado' });

  const pipeId = asId(pipelineId) ?? (await ensureDefaultPipeline(req.userId)).id;
  const [result] = await pool.query(
    `UPDATE deals SET pipeline_id = ?, company_id = ?, titulo = ?, valor = ?, prob = ?, stage_key = ? WHERE id = ? AND user_id = ?`,
    [pipeId, asId(empresaId), titulo, valor, prob, stageKey, id, req.userId]
  );
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Negócio não encontrado' });

  await clearContactNovoOnDealMove(req.userId, { ...dealBefore, pipelineId: pipeId }, stageKey);
  res.status(204).send();
});

router.delete('/deals/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });

  const [result] = await pool.query('DELETE FROM deals WHERE id = ? AND user_id = ?', [id, req.userId]);
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Negócio não encontrado' });
  res.status(204).send();
});

// Activities
router.get('/activities', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, contact_id AS contatoId, company_id AS empresaId, titulo, tipo, quando, status
     FROM activities WHERE user_id = ? ORDER BY id DESC`,
    [req.userId]
  );
  res.json(normalizeRows(rows));
});

router.post('/activities', async (req, res) => {
  const { contatoId, empresaId, titulo, tipo, quando = '', status = 'Pendente' } = req.body ?? {};
  if (!titulo) return res.status(400).json({ message: 'Título é obrigatório' });
  if (!tipo) return res.status(400).json({ message: 'Tipo é obrigatório' });
  const [result] = await pool.query(
    `INSERT INTO activities (user_id, contact_id, company_id, titulo, tipo, quando, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.userId, asId(contatoId), asId(empresaId), titulo, tipo, quando, status]
  );
  res.status(201).json({ id: result.insertId });
});

router.put('/activities/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { contatoId, empresaId, titulo, tipo, quando = '', status = 'Pendente' } = req.body ?? {};
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });
  if (!titulo) return res.status(400).json({ message: 'Título é obrigatório' });
  if (!tipo) return res.status(400).json({ message: 'Tipo é obrigatório' });

  await pool.query(
    `UPDATE activities SET contact_id = ?, company_id = ?, titulo = ?, tipo = ?, quando = ?, status = ?
     WHERE id = ? AND user_id = ?`,
    [asId(contatoId), asId(empresaId), titulo, tipo, quando, status, id, req.userId]
  );
  res.status(204).send();
});

// Emails
router.get('/emails', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, contact_id AS contatoId, company_id AS empresaId, de, assunto, preview, quando, status
     FROM emails WHERE user_id = ? ORDER BY id DESC`,
    [req.userId]
  );
  res.json(normalizeRows(rows));
});

router.post('/emails', async (req, res) => {
  const { contatoId, empresaId, de, assunto = '', preview = '', quando = '', status = 'Não lido' } = req.body ?? {};
  if (!de) return res.status(400).json({ message: 'De é obrigatório' });
  const [result] = await pool.query(
    `INSERT INTO emails (user_id, contact_id, company_id, de, assunto, preview, quando, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.userId, asId(contatoId), asId(empresaId), de, assunto, preview, quando, status]
  );
  res.status(201).json({ id: result.insertId });
});

router.put('/emails/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });
  const { status } = req.body ?? {};
  if (!status) return res.status(400).json({ message: 'Status é obrigatório' });
  const [result] = await pool.query(
    `UPDATE emails SET status = ?, updated_at = NOW() WHERE id = ? AND user_id = ?`,
    [status, id, req.userId]
  );
  if (result.affectedRows === 0) return res.status(404).json({ message: 'E-mail não encontrado' });
  res.status(204).send();
});

router.delete('/emails/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });
  const [result] = await pool.query('DELETE FROM emails WHERE id = ? AND user_id = ?', [id, req.userId]);
  if (result.affectedRows === 0) return res.status(404).json({ message: 'E-mail não encontrado' });
  res.status(204).send();
});

// Proposals
router.get('/proposals', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, contact_id AS contatoId, company_id AS empresaId, deal_id AS dealId, titulo, valor, status, enviada_em AS enviadaEm
     FROM proposals WHERE user_id = ? ORDER BY id DESC`,
    [req.userId]
  );
  res.json(normalizeRows(rows));
});

router.post('/proposals', async (req, res) => {
  const { contatoId, empresaId, dealId, titulo, valor = '', status = 'Enviada', enviadaEm = '' } = req.body ?? {};
  if (!titulo) return res.status(400).json({ message: 'Título é obrigatório' });
  const [result] = await pool.query(
    `INSERT INTO proposals (user_id, contact_id, company_id, deal_id, titulo, valor, status, enviada_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.userId, asId(contatoId), asId(empresaId), asId(dealId), titulo, valor, status, enviadaEm]
  );
  res.status(201).json({ id: result.insertId });
});

router.put('/proposals/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { contatoId, empresaId, dealId, titulo, valor = '', status = 'Enviada', enviadaEm = '' } = req.body ?? {};
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID inválido' });
  if (!titulo) return res.status(400).json({ message: 'Título é obrigatório' });

  await pool.query(
    `UPDATE proposals SET contact_id = ?, company_id = ?, deal_id = ?, titulo = ?, valor = ?, status = ?, enviada_em = ?
     WHERE id = ? AND user_id = ?`,
    [asId(contatoId), asId(empresaId), asId(dealId), titulo, valor, status, enviadaEm, id, req.userId]
  );
  res.status(204).send();
});

export default router;

