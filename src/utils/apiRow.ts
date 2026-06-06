/** Lê campo da API com fallback para chaves em minúsculas (Postgres). */
export function field<T>(row: Record<string, unknown>, camel: string): T | undefined {
  const lower = camel.toLowerCase();
  if (row[camel] !== undefined && row[camel] !== null) return row[camel] as T;
  if (row[lower] !== undefined && row[lower] !== null) return row[lower] as T;
  return undefined;
}

export function mapDealRow(d: Record<string, unknown>) {
  const pipelineId = field<number | string>(d, 'pipelineId');
  const empresaId = field<number | string>(d, 'empresaId');
  const contatoId = field<number | string>(d, 'contatoId');
  const contatoNome = field<string>(d, 'contatoNome');
  const contatoEmail = field<string>(d, 'contatoEmail');
  const contatoTelefone = field<string>(d, 'contatoTelefone');
  return {
    id: String(d.id),
    pipelineId: pipelineId != null ? String(pipelineId) : undefined,
    empresaId: empresaId != null ? String(empresaId) : undefined,
    contatoId: contatoId != null ? String(contatoId) : undefined,
    contatoNome: contatoNome ? String(contatoNome) : undefined,
    contatoEmail: contatoEmail ? String(contatoEmail) : undefined,
    contatoTelefone: contatoTelefone ? String(contatoTelefone) : undefined,
    titulo: String(d.titulo ?? ''),
    valor: String(d.valor ?? ''),
    prob: String(d.prob ?? ''),
    stageKey: String(field<string>(d, 'stageKey') ?? 'prospeccao'),
  };
}

type ContactLike = { id: string; nome: string; email?: string; telefone?: string };

export function enrichDealWithContact<T extends ReturnType<typeof mapDealRow>>(
  deal: T,
  contacts: ContactLike[]
): T {
  if (deal.contatoEmail || deal.contatoTelefone) return deal;

  const linked =
    (deal.contatoId && contacts.find((c) => c.id === deal.contatoId)) ||
    contacts.find((c) => c.nome === deal.titulo || c.nome === deal.contatoNome);

  if (!linked) return deal;

  return {
    ...deal,
    contatoId: deal.contatoId ?? linked.id,
    contatoNome: deal.contatoNome || linked.nome,
    contatoEmail: linked.email || deal.contatoEmail,
    contatoTelefone: linked.telefone || deal.contatoTelefone,
  };
}
