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
  return {
    id: String(d.id),
    pipelineId: pipelineId != null ? String(pipelineId) : undefined,
    empresaId: empresaId != null ? String(empresaId) : undefined,
    titulo: String(d.titulo ?? ''),
    valor: String(d.valor ?? ''),
    prob: String(d.prob ?? ''),
    stageKey: String(field<string>(d, 'stageKey') ?? 'prospeccao'),
  };
}
