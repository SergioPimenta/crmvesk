// Precisa ser o primeiro import dos testes: o db.js lê estas variáveis ao ser carregado.
process.env.JWT_SECRET = 'test-secret';
process.env.LOG_LEVEL = 'silent';
process.env.POSTGRES_URL = 'postgresql://user:pass@localhost:5432/test';
