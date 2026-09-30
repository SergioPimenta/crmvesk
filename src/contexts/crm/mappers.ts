import type { Activity, ActivityInput, Company, Contact, EmailItem, Proposal } from './types';

export const activePipelineKey = (userId: number | string) => `crm_active_pipeline_id_${userId}`;
export const LEGACY_ACTIVE_PIPELINE_KEY = 'crm_active_pipeline_id';

export const mapStageRow = (s: Record<string, unknown>) => ({
  id: String(s.id),
  pipelineId: String(s.pipelineId ?? s.pipelineid),
  stageKey: String(s.stageKey ?? s.stagekey),
  titulo: String(s.titulo),
  cor: String(s.cor),
  pos: Number(s.pos ?? 0),
});

export const genId = (prefix: string) =>
  (globalThis.crypto && 'randomUUID' in globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
    ? `${prefix}_${globalThis.crypto.randomUUID()}`
    : `${prefix}_${Date.now()}_${Math.round(Math.random() * 1e9)}`) as string;

// A API devolve ids numéricos (e null nos vínculos); a interface trabalha com ids em texto.
const optionalId = (value: unknown) => (value ? String(value) : undefined);

export const normalizeCompany = (c: Company): Company => ({ ...c, id: String((c as any).id) });

export const normalizeContact = (c: Contact): Contact => ({
  ...c,
  id: String((c as any).id),
  empresaId: optionalId((c as any).empresaId),
});

export const normalizeActivity = (a: Activity): Activity => ({
  ...a,
  id: String((a as any).id),
  contatoId: optionalId((a as any).contatoId),
  empresaId: optionalId((a as any).empresaId),
  dealId: optionalId((a as any).dealId),
  allDay: Boolean(a.allDay),
  prioridade: a.prioridade ?? 'Média',
});

/** Corpo enviado à API para salvar uma atividade já existente (ex.: ao remarcar). */
export const activityToInput = (a: Activity): ActivityInput => ({
  titulo: a.titulo,
  tipo: a.tipo,
  status: a.status,
  contatoId: a.contatoId,
  empresaId: a.empresaId,
  dealId: a.dealId,
  startAt: a.startAt ?? null,
  endAt: a.endAt ?? null,
  allDay: a.allDay ?? false,
  descricao: a.descricao ?? '',
  local: a.local ?? '',
  link: a.link ?? '',
  prioridade: a.prioridade ?? 'Média',
  assignedTo: a.assignedTo ?? null,
  remindMinutes: a.remindMinutes ?? null,
  quando: a.quando,
});

export const normalizeEmail = (m: EmailItem): EmailItem => ({
  ...m,
  id: String((m as any).id),
  contatoId: optionalId((m as any).contatoId),
  empresaId: optionalId((m as any).empresaId),
});

export const normalizeProposal = (p: Proposal): Proposal => ({
  ...p,
  id: String((p as any).id),
  contatoId: optionalId((p as any).contatoId),
  empresaId: optionalId((p as any).empresaId),
  dealId: optionalId((p as any).dealId),
  templateId: optionalId((p as any).templateId),
  fieldValues:
    (p as any).fieldValues && typeof (p as any).fieldValues === 'object' ? (p as any).fieldValues : undefined,
});
