import crypto from 'node:crypto';

// Tokens do Google ficam criptografados no banco (AES-256-GCM). A chave vem de GOOGLE_TOKEN_KEY; sem ela,
// é derivada do JWT_SECRET (trocar o segredo invalida as conexões e o usuário só precisa reconectar).
const key = () => crypto.createHash('sha256').update(String(process.env.GOOGLE_TOKEN_KEY || process.env.JWT_SECRET)).digest();

export function encryptToken(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

/** Devolve o texto original, ou null se o valor estiver corrompido ou a chave tiver mudado. */
export function decryptToken(payload) {
  try {
    const [version, iv, tag, data] = String(payload).split('.');
    if (version !== 'v1') return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
