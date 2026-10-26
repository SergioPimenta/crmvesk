import type { ClickKind } from './types';

const nf = new Intl.NumberFormat('pt-BR');

export const fmtNum = (n: number) => nf.format(Math.round(n || 0));

export const fmtPct = (v: number, digits = 1) => {
  const p = (v || 0) * 100;
  if (p > 0 && p < 0.1) return '<0,1%';
  return `${p.toLocaleString('pt-BR', { maximumFractionDigits: p >= 10 ? 0 : digits })}%`;
};

export const rate = (part: number, total: number) => (total > 0 ? part / total : 0);

export function fmtDuration(sec: number) {
  const s = Math.max(0, Math.round(sec || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}min ${r}s` : `${m}min`;
}

/** Variação contra o período anterior; null quando não há base para comparar. */
export function delta(cur: number, prev: number) {
  if (!prev) return null;
  return (cur - prev) / prev;
}

export const MEDIUM_LABEL: Record<string, string> = {
  organic: 'orgânico',
  paid: 'pago',
  social: 'social',
  referral: 'indicação',
  direct: 'direto',
  email: 'e-mail',
  campaign: 'campanha',
};

export const DEVICE_LABEL: Record<string, { label: string; icon: string }> = {
  mobile: { label: 'Celular', icon: 'ti-device-mobile' },
  desktop: { label: 'Computador', icon: 'ti-device-desktop' },
  tablet: { label: 'Tablet', icon: 'ti-device-tablet' },
};

export const SOURCE_ICON: Record<string, string> = {
  Instagram: 'ti-brand-instagram',
  Facebook: 'ti-brand-facebook',
  Google: 'ti-brand-google',
  Bing: 'ti-brand-bing',
  LinkedIn: 'ti-brand-linkedin',
  YouTube: 'ti-brand-youtube',
  TikTok: 'ti-brand-tiktok',
  'X (Twitter)': 'ti-brand-x',
  WhatsApp: 'ti-brand-whatsapp',
  ChatGPT: 'ti-brand-openai',
  Direto: 'ti-link',
  'E-mail': 'ti-mail',
};

export const KIND_META: Record<ClickKind, { label: string; icon: string }> = {
  whatsapp: { label: 'WhatsApp', icon: 'ti-brand-whatsapp' },
  phone: { label: 'Telefone', icon: 'ti-phone' },
  email: { label: 'E-mail', icon: 'ti-mail' },
  external: { label: 'Link externo', icon: 'ti-external-link' },
  link: { label: 'Link interno', icon: 'ti-link' },
  button: { label: 'Botão', icon: 'ti-click' },
  dead: { label: 'Não clicável', icon: 'ti-hand-off' },
};

export const STATE_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

export const DOW_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function timeAgo(iso: string | null) {
  if (!iso) return 'nunca';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} d`;
}
