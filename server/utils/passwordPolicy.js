export const MIN_PASSWORD_LENGTH = 8;

/** Retorna a mensagem de erro, ou null se a senha é aceitável. */
export function passwordPolicyError(password) {
  const value = String(password ?? '');
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`;
  }
  if (value.length > 128) return 'A senha deve ter no máximo 128 caracteres';
  return null;
}
