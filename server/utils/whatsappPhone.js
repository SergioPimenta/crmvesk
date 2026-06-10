export function digitsOnly(phone) {
  return String(phone || '').replace(/\D/g, '');
}

/** Normaliza telefone para o mesmo formato usado pela Meta (E.164 sem +). */
export function canonicalWhatsAppPhone(phone) {
  let digits = digitsOnly(phone);
  if (!digits) return '';

  // Nacional BR (DDD + número)
  if (!digits.startsWith('55') && digits.length >= 10 && digits.length <= 11) {
    digits = `55${digits}`;
  }

  // BR com DDI: insere 9º dígito em celulares quando ausente (55 + DDD + 8 dígitos)
  if (digits.startsWith('55') && digits.length === 12) {
    const ddd = digits.slice(2, 4);
    const subscriber = digits.slice(4);
    if (subscriber.length === 8 && /^[6-9]/.test(subscriber[0])) {
      digits = `55${ddd}9${subscriber}`;
    }
  }

  return digits;
}

export function phoneToCanonicalJid(phone) {
  const digits = canonicalWhatsAppPhone(phone);
  return digits ? `${digits}@s.whatsapp.net` : '';
}

export function phonesMatch(a, b) {
  const ca = canonicalWhatsAppPhone(a);
  const cb = canonicalWhatsAppPhone(b);
  return Boolean(ca && cb && ca === cb);
}
