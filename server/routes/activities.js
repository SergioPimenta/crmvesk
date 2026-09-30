import express from 'express';
import pool from '../db.js';
import { archiveRows } from '../utils/archive.js';
import { normalizeRows } from '../utils/rows.js';
import { isWorkspaceMember } from '../services/leadOwnerService.js';

// Agenda: atividades com data e hora reais (UTC no banco), duração, participantes e responsável.
// Visibilidade: administradores veem todas do workspace; os demais veem as que criaram OU que foram
// designadas a eles. Montado em /api/crm/activities (o verifyToken já foi aplicado por crm.js).

const router = express.Router();

export const ACTIVITY_TYPES = ['Reunião', 'Ligação', 'Follow-up', 'Tarefa'];
export const ACTIVITY_STATUSES = ['Pendente', 'Concluída', 'Cancelada'];
const PRIORITIES = ['Alta', 'Média', 'Baixa'];

class HttpError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const isAdmin = (req) => req.userRole === 'admin';

const visible = (req, alias = '') =>
  isAdmin(req)
    ? { sql: '', params: [] }
    : { sql: ` AND (${alias}created_by = ? OR ${alias}assigned_to = ?)`, params: [req.authUserId, req.authUserId] };

const asId = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const toDate = (value, label) => {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new HttpError(`${label} inválido`);
  return d;
};

const partsFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Montado à mão (dd/mm/aaaa hh:mm) para não depender do separador que cada versão do ICU usa.
function brasiliaParts(date) {
  const p = Object.fromEntries(partsFormat.formatToParts(date).map((x) => [x.type, x.value]));
  return { day: `${p.day}/${p.month}/${p.year}`, time: `${p.hour}:${p.minute}` };
}

/** Texto legado da coluna `quando`, para telas antigas e relatórios que ainda o exibem. */
const whenLabel = (start, allDay, fallback) => {
  if (!start) return String(fallback || '').slice(0, 80);
  const { day, time } = brasiliaParts(start);
  return allDay ? `${day} · dia inteiro` : `${day} ${time}`;
};

async function assertInWorkspace(req, table, id, label) {
  if (id === null) return;
  const [rows] = await pool.query(`SELECT id FROM ${table} WHERE id = ? AND user_id = ?`, [id, req.userId]);
  if (!rows.length) throw new HttpError(`${label} inválido`);
}

/** Valida e normaliza o corpo de criação/edição. Lança HttpError(400) com a mensagem para o usuário. */
async function parseInput(req) {
  const b = req.body ?? {};

  const titulo = String(b.titulo ?? '').trim();
  if (!titulo) throw new HttpError('Título é obrigatório');
  if (titulo.length > 200) throw new HttpError('O título pode ter no máximo 200 caracteres');

  if (!ACTIVITY_TYPES.includes(b.tipo)) throw new HttpError('Tipo inválido');
  const status = b.status ?? 'Pendente';
  if (!ACTIVITY_STATUSES.includes(status)) throw new HttpError('Status inválido');
  const prioridade = b.prioridade ?? 'Média';
  if (!PRIORITIES.includes(prioridade)) throw new HttpError('Prioridade inválida');

  const allDay = b.allDay === true;
  const start = toDate(b.startAt, 'Início');
  let end = toDate(b.endAt, 'Término');
  if (end && !start) throw new HttpError('Informe o início antes do término');
  if (start && end && end < start) throw new HttpError('O término deve ser depois do início');
  if (allDay && !start) throw new HttpError('Informe a data do compromisso de dia inteiro');
  if (!start) end = null;

  const descricao = String(b.descricao ?? '').trim();
  if (descricao.length > 2000) throw new HttpError('A descrição pode ter no máximo 2000 caracteres');
  const local = String(b.local ?? '').trim();
  if (local.length > 255) throw new HttpError('O local pode ter no máximo 255 caracteres');
  const link = String(b.link ?? '').trim();
  if (link && !/^https?:\/\/\S+$/i.test(link)) throw new HttpError('O link deve começar com http:// ou https://');
  if (link.length > 512) throw new HttpError('O link é muito longo');

  const contatoId = asId(b.contatoId);
  const empresaId = asId(b.empresaId);
  const dealId = asId(b.dealId);
  const assignedTo = asId(b.assignedTo);
  await assertInWorkspace(req, 'contacts', contatoId, 'Contato');
  await assertInWorkspace(req, 'companies', empresaId, 'Empresa');
  await assertInWorkspace(req, 'deals', dealId, 'Negócio');
  if (assignedTo !== null && !(await isWorkspaceMember(req.userId, assignedTo))) {
    throw new HttpError('Responsável inválido para este workspace');
  }

  return {
    titulo,
    tipo: b.tipo,
    status,
    prioridade,
    allDay,
    start,
    end,
    descricao,
    local,
    link,
    contatoId,
    empresaId,
    dealId,
    assignedTo,
    quando: whenLabel(start, allDay, b.quando),
  };
}

const SELECT_ACTIVITY = `
  SELECT a.id, a.contact_id AS contatoId, a.company_id AS empresaId, a.deal_id AS dealId, a.titulo, a.tipo,
         a.quando, a.status, a.start_at AS startAt, a.end_at AS endAt, a.all_day AS allDay, a.descricao,
         a.local, a.link, a.prioridade, a.assigned_to AS assignedTo, u.name AS assignedToName,
         a.completed_at AS completedAt, a.created_by AS createdBy
  FROM activities a LEFT JOIN users u ON u.id = a.assigned_to`;

function toDto(row) {
  const r = row;
  return {
    ...r,
    id: String(r.id),
    allDay: Boolean(r.allDay),
  };
}

async function getActivity(req, id) {
  const v = visible(req, 'a.');
  const [rows] = await pool.query(`${SELECT_ACTIVITY} WHERE a.id = ? AND a.user_id = ?${v.sql}`, [
    id,
    req.userId,
    ...v.params,
  ]);
  return rows[0] ? toDto(normalizeRows(rows)[0]) : null;
}

// Lista (opcionalmente só um intervalo: ?from=ISO&to=ISO). Mais próximas primeiro; sem data por último.
router.get('/', async (req, res) => {
  const v = visible(req, 'a.');
  const where = ['a.user_id = ?'];
  const params = [req.userId];
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;
  if (from && !Number.isNaN(from.getTime())) {
    where.push('a.start_at >= ?');
    params.push(from.toISOString());
  }
  if (to && !Number.isNaN(to.getTime())) {
    where.push('a.start_at < ?');
    params.push(to.toISOString());
  }
  const [rows] = await pool.query(
    `${SELECT_ACTIVITY} WHERE ${where.join(' AND ')}${v.sql} ORDER BY a.start_at ASC NULLS LAST, a.id DESC`,
    [...params, ...v.params]
  );
  res.json(normalizeRows(rows).map(toDto));
});

router.post('/', async (req, res) => {
  const a = await parseInput(req);
  const [, rows] = await pool.query(
    `INSERT INTO activities (user_id, created_by, contact_id, company_id, deal_id, titulo, tipo, quando, status,
                             start_at, end_at, all_day, descricao, local, link, prioridade, assigned_to, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      req.userId,
      req.authUserId,
      a.contatoId,
      a.empresaId,
      a.dealId,
      a.titulo,
      a.tipo,
      a.quando,
      a.status,
      a.start ? a.start.toISOString() : null,
      a.end ? a.end.toISOString() : null,
      a.allDay,
      a.descricao,
      a.local,
      a.link,
      a.prioridade,
      a.assignedTo,
      a.status === 'Concluída' ? new Date().toISOString() : null,
    ]
  );
  const id = rows?.[0]?.id;
  res.status(201).json({ id, activity: id ? await getActivity(req, id) : null });
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'ID inválido' });
  const current = await getActivity(req, id);
  if (!current) return res.status(404).json({ message: 'Atividade não encontrada' });

  const a = await parseInput(req);
  // completed_at acompanha o status: marca ao concluir, mantém se já estava concluída, limpa ao reabrir.
  const completedAt =
    a.status === 'Concluída' ? (current.status === 'Concluída' && current.completedAt ? current.completedAt : new Date()) : null;

  const v = visible(req);
  await pool.query(
    `UPDATE activities SET contact_id = ?, company_id = ?, deal_id = ?, titulo = ?, tipo = ?, quando = ?, status = ?,
            start_at = ?, end_at = ?, all_day = ?, descricao = ?, local = ?, link = ?, prioridade = ?,
            assigned_to = ?, completed_at = ?, updated_at = NOW()
     WHERE id = ? AND user_id = ?${v.sql}`,
    [
      a.contatoId,
      a.empresaId,
      a.dealId,
      a.titulo,
      a.tipo,
      a.quando,
      a.status,
      a.start ? a.start.toISOString() : null,
      a.end ? a.end.toISOString() : null,
      a.allDay,
      a.descricao,
      a.local,
      a.link,
      a.prioridade,
      a.assignedTo,
      completedAt ? new Date(completedAt).toISOString() : null,
      id,
      req.userId,
      ...v.params,
    ]
  );
  res.json({ activity: await getActivity(req, id) });
});

// Concluir / cancelar / reabrir sem reenviar o restante da atividade.
router.patch('/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'ID inválido' });
  const status = req.body?.status;
  if (!ACTIVITY_STATUSES.includes(status)) return res.status(400).json({ message: 'Status inválido' });

  const v = visible(req);
  const [result] = await pool.query(
    `UPDATE activities SET status = ?, completed_at = ?, updated_at = NOW()
     WHERE id = ? AND user_id = ?${v.sql}`,
    [status, status === 'Concluída' ? new Date().toISOString() : null, id, req.userId, ...v.params]
  );
  if (!result.affectedRows) return res.status(404).json({ message: 'Atividade não encontrada' });
  res.json({ activity: await getActivity(req, id) });
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'ID inválido' });
  const v = visible(req);
  await archiveRows(req, 'activities', `id = ? AND user_id = ?${v.sql}`, [id, req.userId, ...v.params]);
  const [result] = await pool.query(`DELETE FROM activities WHERE id = ? AND user_id = ?${v.sql}`, [
    id,
    req.userId,
    ...v.params,
  ]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Atividade não encontrada' });
  res.status(204).send();
});

export default router;
