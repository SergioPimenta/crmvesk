import type { Deal, PipelineStage } from '../contexts/CrmDataContext';

export function isClosedStage(stage: PipelineStage): boolean {
  const key = stage.stageKey.toLowerCase();
  const title = stage.titulo.toLowerCase().trim();
  return key === 'fechado' || key === 'closed' || title === 'fechado' || title === 'closed';
}

export function isDealClosed(deal: Deal, stages: PipelineStage[]): boolean {
  const stage = stages.find((s) => s.stageKey === deal.stageKey);
  if (stage) return isClosedStage(stage);
  const key = deal.stageKey.toLowerCase();
  return key === 'fechado' || key === 'closed';
}

/** Etapa visível no kanban — negócios com stageKey órfão vão para a primeira etapa aberta. */
export function resolveDealStageKey(deal: Deal, stages: PipelineStage[]): string {
  if (stages.some((s) => s.stageKey === deal.stageKey)) {
    return deal.stageKey;
  }
  const firstOpen = stages.find((s) => !isClosedStage(s));
  return firstOpen?.stageKey ?? stages[0]?.stageKey ?? deal.stageKey;
}

export function groupDealsByStage(deals: Deal[], stages: PipelineStage[]): Map<string, Deal[]> {
  const grouped = new Map<string, Deal[]>();
  for (const stage of stages) {
    grouped.set(stage.stageKey, []);
  }
  for (const deal of deals) {
    const key = resolveDealStageKey(deal, stages);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(deal);
  }
  return grouped;
}

export function countOpenDeals(deals: Deal[], stages: PipelineStage[]): number {
  return deals.filter((d) => !isDealClosed(d, stages)).length;
}

export function countClosedDeals(deals: Deal[], stages: PipelineStage[]): number {
  return deals.filter((d) => isDealClosed(d, stages)).length;
}
