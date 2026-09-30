// Precisa ser o primeiro import dos testes: o db.js lê estas variáveis ao ser carregado.
process.env.JWT_SECRET = 'test-secret';
process.env.LOG_LEVEL = 'silent';
process.env.POSTGRES_URL = 'postgresql://user:pass@localhost:5432/test';
// Nunca enviar e-mail de verdade nos testes, mesmo que o .env da máquina tenha SMTP configurado.
// (o dotenv não sobrescreve variáveis já definidas, nem vazias)
for (const key of ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS']) process.env[key] = '';
process.env.VAPID_PUBLIC_KEY = '';
process.env.VAPID_PRIVATE_KEY = '';
