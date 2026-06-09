export type WaMsgStatus = 'sent' | 'delivered' | 'read' | 'failed';

export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const day = startOfDay(d).getTime();
  const today = startOfDay(now).getTime();
  if (day === today) return 'Hoje';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === startOfDay(yesterday).getTime()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export type WaChatItem =
  | { type: 'day'; key: string; label: string }
  | { type: 'message'; key: string; message: { id: string; text: string; fromMe: boolean; messageAt: string; status?: WaMsgStatus } };

export function buildChatTimeline(
  messages: { id: string; text: string; fromMe: boolean; messageAt: string; status?: WaMsgStatus }[]
): WaChatItem[] {
  const items: WaChatItem[] = [];
  let lastDay = '';

  for (const m of messages) {
    const dk = dayKey(m.messageAt);
    if (dk && dk !== lastDay) {
      items.push({ type: 'day', key: `day-${dk}`, label: formatDayLabel(m.messageAt) });
      lastDay = dk;
    }
    items.push({ type: 'message', key: m.id, message: m });
  }

  return items;
}
