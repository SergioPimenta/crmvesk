/**
 * Configuração automática na Vercel (após `npx vercel login`).
 * Uso: npm run vercel:setup
 */
import { execSync, spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PRODUCTION_APP_URL = process.env.PRODUCTION_APP_URL || 'https://crm.vesk.com.br';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const VERCEL = 'npx --yes vercel@latest';

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  return execSync(cmd, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    ...opts,
  });
}

function runCapture(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8', shell: true }).trim();
}

function pipeEnv(name, value, env = 'production') {
  const child = spawnSync('npx', ['--yes', 'vercel@latest', 'env', 'add', name, env], {
    cwd: root,
    input: value,
    encoding: 'utf8',
    shell: true,
  });
  if (child.status !== 0) {
    const err = child.stderr || child.stdout || '';
    if (/already exists|Environment Variable.*exists/i.test(err)) {
      console.log(`  (variável ${name} já existe — ignorando)`);
      return;
    }
    throw new Error(`Falha ao definir ${name}: ${err}`);
  }
}

function whoami() {
  try {
    return runCapture(`${VERCEL} whoami`);
  } catch {
    return null;
  }
}

async function main() {
  const user = whoami();
  if (!user) {
    console.error('\n❌ Não autenticado na Vercel.');
    console.error('   Execute: npm run vercel:login');
    console.error('   Depois:  npm run vercel:setup\n');
    process.exit(1);
  }
  console.log(`\n✓ Logado como: ${user}`);

  console.log('\n--- Vinculando projeto ---');
  try {
    run(`${VERCEL} link --yes --project crmvesk`);
  } catch {
    console.log('Link com nome crmvesk falhou — tente: npx vercel link --project crmvesk');
    run(`${VERCEL} link --yes --project crmvesk`);
  }

  console.log('\n--- Banco Neon (Marketplace) ---');
  try {
    run(`${VERCEL} integration discover --category databases --format=json`, { stdio: 'pipe' });
  } catch {
    /* opcional */
  }
  try {
    run(`${VERCEL} integration add neon --name crmvesk-db`);
  } catch (e) {
    console.log(
      '\n⚠ Não foi possível criar Neon via CLI (pode já existir).\n' +
        '  No painel: Project → Storage → Connect Database → Neon → Create\n'
    );
  }

  const jwt = crypto.randomBytes(48).toString('base64url');
  console.log('\n--- Variáveis de ambiente ---');
  for (const env of ['production', 'preview', 'development']) {
    pipeEnv('JWT_SECRET', jwt, env);
  }

  console.log('\n--- Deploy de produção ---');
  run(`${VERCEL} deploy --prod --yes`);

  let appUrl = '';
  try {
    const json = runCapture(`${VERCEL} ls --format=json`);
    const projects = JSON.parse(json);
    const latest = projects?.projects?.[0]?.latestDeployments?.[0];
    appUrl = latest?.url ? `https://${latest.url}` : '';
  } catch {
    try {
      const out = runCapture(`${VERCEL} inspect --format=json`);
      const data = JSON.parse(out);
      appUrl = data?.url ? (data.url.startsWith('http') ? data.url : `https://${data.url}`) : '';
    } catch {
      /* ignore */
    }
  }

  if (!appUrl) {
    const linked = path.join(root, '.vercel', 'project.json');
    if (fs.existsSync(linked)) {
      console.log('\nDefina WHATSAPP_WEBHOOK_PUBLIC_URL manualmente com a URL do deploy no painel.');
    }
  } else {
    const webhookBase = PRODUCTION_APP_URL;
    console.log(`\n✓ URL de produção: ${webhookBase}`);
    for (const env of ['production', 'preview']) {
      pipeEnv('WHATSAPP_WEBHOOK_PUBLIC_URL', webhookBase, env);
      pipeEnv('FRONTEND_URL', `${webhookBase},http://localhost:5173`, env);
    }
    console.log('\n--- Redeploy (aplicar env) ---');
    run(`${VERCEL} deploy --prod --yes`);
  }

  console.log('\n--- Sincronizar env local (opcional) ---');
  try {
    run(`${VERCEL} env pull server/.env.vercel --environment=development --yes`);
    console.log('Credenciais salvas em server/.env.vercel (não commitar).');
  } catch {
    console.log('Execute depois: npx vercel env pull server/.env.vercel');
  }

  console.log(`
✅ Setup concluído.

Checklist no painel (vercel.com):
  • Storage → Postgres/Neon conectado (POSTGRES_URL)
  • Settings → Environment Variables: JWT_SECRET, WHATSAPP_WEBHOOK_PUBLIC_URL
  • Opcional: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, BLOB_READ_WRITE_TOKEN

Frontend usa /api no mesmo domínio — não defina VITE_API_URL.
`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
