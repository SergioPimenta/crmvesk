import pool from '../db.js';
import { canonicalWhatsAppPhone } from '../utils/whatsappPhone.js';
import { normalizeRows } from '../utils/rows.js';

export const MAX_IMPORT_ROWS = 500;
const CONTACT_TYPES = ['Lead', 'Cliente', 'Prospect'];

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const phoneId = (telefone) => {
  const p = canonicalWhatsAppPhone(telefone);
  return p.length >= 10 ? p : '';
};

/**
 * Importa contatos da planilha padrão (NOME, E-MAIL, TELEFONE, SITE, EMPRESA, TIPO, FUNIL, ETAPA DO FUNIL).
 * Cada contato entra no funil/etapa indicados (vazio = funil padrão / primeira etapa) com a tag "Novo".
 * Linhas inválidas voltam em `errors`; duplicados (mesmo telefone ou mesmo nome+telefone) são ignorados.
 */
export async function importContactsFromRows({ userId, authUserId, rows, ensureDefaultPipeline }) {
  const errors = [];
  let skipped = 0;
  const saved = [];

  const [pipeRows] = await pool.query('SELECT id, nome, is_default AS isDefault FROM pipelines WHERE user_id = ?', [userId]);
  const [stageRows] = await pool.query(
    'SELECT pipeline_id AS pipelineId, stage_key AS stageKey, titulo, pos FROM pipeline_stages WHERE user_id = ? ORDER BY pos ASC, id ASC',
    [userId]
  );
  const pipelines = normalizeRows(pipeRows);
  const stages = normalizeRows(stageRows);
  const defaultPipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0] ?? (await ensureDefaultPipeline(userId));
  if (!pipelines.length) {
    pipelines.push(defaultPipeline);
    const [fresh] = await pool.query(
      'SELECT pipeline_id AS pipelineId, stage_key AS stageKey, titulo, pos FROM pipeline_stages WHERE user_id = ? ORDER BY pos ASC, id ASC',
      [userId]
    );
    stages.push(...normalizeRows(fresh));
  }

  const [contactRows] = await pool.query('SELECT nome, telefone FROM contacts WHERE user_id = ?', [userId]);
  const [companyRows] = await pool.query('SELECT id, nome FROM companies WHERE user_id = ?', [userId]);
  const seenNamePhone = new Set(contactRows.map((c) => `${norm(c.nome)}|${phoneId(c.telefone)}`));
  const seenPhone = new Set(contactRows.map((c) => phoneId(c.telefone)).filter(Boolean));
  const companyByName = new Map(companyRows.map((c) => [norm(c.nome), Number(c.id)]));

  // Valida e resolve tudo antes de gravar, para a transação só conter linhas boas.
  const ready = [];
  rows.forEach((raw, i) => {
    const linha = i + 2; // linha 1 é o cabeçalho da planilha
    const nome = text(raw?.nome, 160);
    const fail = (motivo) => errors.push({ linha, nome: nome || '(sem nome)', motivo });
    if (!nome) return fail('Nome é obrigatório');

    const tipoRaw = norm(raw?.tipo);
    const tipo = tipoRaw ? CONTACT_TYPES.find((t) => norm(t) === tipoRaw) : 'Lead';
    if (!tipo) return fail(`Tipo inválido "${text(raw?.tipo, 40)}" (use Lead, Cliente ou Prospect)`);

    let pipeline = defaultPipeline;
    if (norm(raw?.funil)) {
      pipeline = pipelines.find((p) => norm(p.nome) === norm(raw.funil));
      if (!pipeline) return fail(`Funil "${text(raw.funil, 60)}" não existe`);
    }
    const pipeStages = stages.filter((s) => Number(s.pipelineId) === Number(pipeline.id));
    let stage = pipeStages[0];
    if (norm(raw?.etapa)) {
      stage = pipeStages.find((s) => norm(s.titulo) === norm(raw.etapa) || norm(s.stageKey) === norm(raw.etapa));
      if (!stage) return fail(`Etapa "${text(raw.etapa, 60)}" não existe no funil ${pipeline.nome}`);
    }
    if (!stage) return fail(`O funil ${pipeline.nome} não tem etapas`);

    const telefone = text(raw?.telefone, 80);
    const phone = phoneId(telefone);
    const key = `${norm(nome)}|${phone}`;
    if (seenNamePhone.has(key) || (phone && seenPhone.has(phone))) {
      skipped += 1;
      return;
    }
    seenNamePhone.add(key);
    if (phone) seenPhone.add(phone);

    ready.push({
      nome,
      email: text(raw?.email, 160),
      telefone,
      site: text(raw?.site, 512),
      empresa: text(raw?.empresa, 160),
      tipo,
      pipelineId: Number(pipeline.id),
      stageKey: stage.stageKey,
      etapa: stage.titulo,
    });
  });

  if (ready.length) {
    await pool.transaction(async (conn) => {
      for (const r of ready) {
        let companyId = null;
        if (r.empresa) {
          const k = norm(r.empresa);
          companyId = companyByName.get(k) ?? null;
          if (!companyId) {
            const [ins] = await conn.query(
              'INSERT INTO companies (user_id, created_by, nome, segmento, etapa, proxima_acao, prioridade) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [userId, authUserId, r.empresa, '', 'Prospecção', '', 'Média']
            );
            companyId = Number(ins.insertId);
            companyByName.set(k, companyId);
          }
        }

        const [contact] = await conn.query(
          `INSERT INTO contacts (user_id, created_by, company_id, nome, email, telefone, site, tipo, etapa, ultima_interacao, precisa_followup)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Planilha', TRUE)`,
          [userId, authUserId, companyId, r.nome, r.email, r.telefone, r.site, r.tipo, r.etapa]
        );
        const [deal] = await conn.query(
          `INSERT INTO deals (user_id, created_by, pipeline_id, company_id, contact_id, titulo, valor, prob, stage_key)
           VALUES (?, ?, ?, ?, ?, ?, '', '20%', ?)`,
          [userId, authUserId, r.pipelineId, companyId, contact.insertId, r.nome, r.stageKey]
        );
        saved.push({ contactId: contact.insertId, dealId: deal.insertId, nome: r.nome });
      }
    });
  }

  return { saved: saved.length, skipped, errors, items: saved };
}
