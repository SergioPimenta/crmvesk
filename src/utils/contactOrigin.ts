/** Exibe somente a origem do contato a partir de ultima_interacao. */
export function contactOrigin(value: string | undefined): string {
  const text = (value || '').trim();
  if (!text) return '—';

  if (text.startsWith('Importado do Google Maps')) return 'Google Maps';
  if (text.startsWith('Lead via botão WhatsApp')) return 'Botão WhatsApp';
  if (text.startsWith('Formulário de contato')) {
    const match = text.match(/^Formulário de contato · ([^·]+)/);
    return match ? `Formulário · ${match[1].trim()}` : 'Formulário de contato';
  }
  if (text === 'Criado agora' || text === 'Atualizado') return 'Manual';

  const first = text.split('·')[0]?.trim();
  return first || text;
}
