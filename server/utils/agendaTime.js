// Datas da Agenda no fuso de Brasília (o CRM guarda UTC e usa America/Sao_Paulo para textos e para o Google).
export const AGENDA_TZ = 'America/Sao_Paulo';

const partsFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: AGENDA_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Montado à mão (dd/mm/aaaa hh:mm) para não depender do separador que cada versão do ICU usa.
export function brasiliaParts(date) {
  const p = Object.fromEntries(partsFormat.formatToParts(date).map((x) => [x.type, x.value]));
  return { day: `${p.day}/${p.month}/${p.year}`, time: `${p.hour}:${p.minute}`, iso: `${p.year}-${p.month}-${p.day}` };
}

/** Texto legado da coluna `quando`, para telas antigas e relatórios que ainda o exibem. */
export const whenLabel = (start, allDay, fallback) => {
  if (!start) return String(fallback || '').slice(0, 80);
  const { day, time } = brasiliaParts(start);
  return allDay ? `${day} · dia inteiro` : `${day} ${time}`;
};

/** Meia-noite (Brasília) de uma data `YYYY-MM-DD`. O Brasil não tem horário de verão desde 2019 (UTC-3 fixo). */
export const brasiliaMidnight = (isoDay) => new Date(`${isoDay}T00:00:00-03:00`);

export const addDaysIso = (isoDay, days) => {
  const d = new Date(`${isoDay}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
