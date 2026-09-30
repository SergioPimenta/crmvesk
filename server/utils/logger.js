import { randomUUID } from 'crypto';

// Logs em JSON (uma linha por evento): fáceis de filtrar nos logs da Vercel e de enviar a qualquer ferramenta
// de observabilidade depois. Nível mínimo via LOG_LEVEL (debug | info | warn | error | silent; padrão info).
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

const threshold = () => LEVELS[String(process.env.LOG_LEVEL || '').toLowerCase()] ?? LEVELS.info;

function serialize(context = {}) {
  const out = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] =
      value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value;
  }
  return out;
}

function write(level, message, context) {
  if (LEVELS[level] < threshold()) return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg: message, ...serialize(context) });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message, context) => write('debug', message, context),
  info: (message, context) => write('info', message, context),
  warn: (message, context) => write('warn', message, context),
  error: (message, context) => write('error', message, context),
};

export const newRequestId = () => randomUUID().slice(0, 8);
