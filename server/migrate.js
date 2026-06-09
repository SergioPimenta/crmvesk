import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import pool from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const stageMap = {
  prospeccao: { titulo: 'Prospecção', cor: '#7a7880', pos: 0 },
  qualificacao: { titulo: 'Qualificação', cor: '#378add', pos: 1 },
  proposta: { titulo: 'Proposta', cor: '#ef9f27', pos: 2 },
  negociacao: { titulo: 'Negociação', cor: '#4ab3b8', pos: 3 },
  fechado: { titulo: 'Fechado', cor: '#4caf82', pos: 4 },
};

async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*)::int AS c FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?`,
    [table]
  );
  return Number(rows[0]?.c) > 0;
}

function splitSqlStatements(fileSql) {
  const withoutComments = fileSql.replace(/--[^\n]*/g, '');
  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function applyBaseSchema() {
  const schemaPath = path.join(__dirname, 'schema.pg.sql');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Arquivo de schema não encontrado: ${schemaPath}`);
  }
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const statements = splitSqlStatements(schema);
  for (const statement of statements) {
    await pool.query(statement);
  }
}

async function ensureDefaultPipelinesForUsers() {
  const [users] = await pool.query('SELECT id AS user_id FROM users');
  for (const row of users) {
    const userId = row.user_id;
    const [existing] = await pool.query('SELECT id FROM pipelines WHERE user_id = ? LIMIT 1', [userId]);
    let pipelineId = existing[0]?.id;

    if (!pipelineId) {
      const [ins] = await pool.query('INSERT INTO pipelines (user_id, nome, is_default) VALUES (?, ?, TRUE)', [
        userId,
        'Funil padrão',
      ]);
      pipelineId = ins.insertId;
    }

    const [stageCount] = await pool.query(
      'SELECT COUNT(*)::int AS c FROM pipeline_stages WHERE user_id = ? AND pipeline_id = ?',
      [userId, pipelineId]
    );

    if (Number(stageCount[0]?.c) === 0) {
      for (const [key, meta] of Object.entries(stageMap)) {
        await pool.query(
          'INSERT INTO pipeline_stages (user_id, pipeline_id, stage_key, titulo, cor, pos) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, pipelineId, key, meta.titulo, meta.cor, meta.pos]
        );
      }
    }

    await pool.query(
      'UPDATE deals SET pipeline_id = ? WHERE user_id = ? AND (pipeline_id IS NULL OR pipeline_id = 0)',
      [pipelineId, userId]
    );
  }
}

async function seedAdminIfNeeded() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) return;

  const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (rows.length > 0) return;

  const hash = await bcrypt.hash(password, 10);
  await pool.query('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [
    'Administrador',
    email,
    hash,
    'admin',
  ]);
  console.log(`Admin seed criado: ${email}`);
}

export async function runMigrations() {
  if (!(await tableExists('users'))) {
    await applyBaseSchema();
    if (!(await tableExists('users'))) {
      throw new Error('Schema não foi aplicado (tabela users ausente).');
    }
    console.log('Migration: schema PostgreSQL aplicado');
  }

  if (await tableExists('pipelines')) {
    await ensureDefaultPipelinesForUsers();
  }

  await migrateWhatsappMetaColumns();
  await migrateWhatsappWebhookLogs();
  await migrateWhatsappChatUi();
  await migrateWhatsappButtonWidgets();
  await migrateWhatsappWidgetPipeline();
  await migrateContactFormWidgets();
  await migrateDealsContactId();
  await migrateContactsSite();
  await seedAdminIfNeeded();
  console.log('Migration concluída.');
}

async function migrateWhatsappMetaColumns() {
  if (!(await tableExists('whatsapp_settings'))) return;

  await pool.query(
    `ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS provider VARCHAR(32) DEFAULT 'evolution'`
  );
  await pool.query(
    `ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS app_secret VARCHAR(255) DEFAULT ''`
  );
  try {
    await pool.query(`ALTER TABLE whatsapp_settings ALTER COLUMN base_url DROP NOT NULL`);
  } catch {
    /* coluna já opcional */
  }
  try {
    await pool.query(`ALTER TABLE whatsapp_settings ALTER COLUMN api_key TYPE VARCHAR(512)`);
  } catch {
    /* tipo já ampliado */
  }
}

async function migrateWhatsappChatUi() {
  if (await tableExists('whatsapp_messages')) {
    await pool.query(
      `ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT ''`
    );
  }
  if (await tableExists('whatsapp_chats')) {
    await pool.query(
      `ALTER TABLE whatsapp_chats ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(20) DEFAULT 'open'`
    );
  }
}

async function migrateWhatsappWebhookLogs() {
  if (await tableExists('whatsapp_webhook_logs')) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_webhook_logs (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type VARCHAR(64) DEFAULT '',
      payload TEXT DEFAULT '',
      processed INT DEFAULT 0,
      error TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_wa_webhook_logs_user ON whatsapp_webhook_logs(user_id)');
}

async function migrateWhatsappButtonWidgets() {
  if (await tableExists('whatsapp_button_widgets')) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_button_widgets (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      site_url VARCHAR(512) NOT NULL,
      site_name VARCHAR(160) DEFAULT '',
      phone VARCHAR(32) NOT NULL,
      monitor_code VARCHAR(64) UNIQUE NOT NULL,
      message TEXT DEFAULT '',
      active BOOLEAN DEFAULT TRUE,
      page_views INT DEFAULT 0,
      button_clicks INT DEFAULT 0,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_wa_button_user ON whatsapp_button_widgets(user_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_wa_button_code ON whatsapp_button_widgets(monitor_code)');
}

async function migrateWhatsappWidgetPipeline() {
  if (!(await tableExists('whatsapp_button_widgets'))) return;

  await pool.query(
    `ALTER TABLE whatsapp_button_widgets ADD COLUMN IF NOT EXISTS pipeline_id INT REFERENCES pipelines(id) ON DELETE SET NULL`
  );
  await pool.query(
    `ALTER TABLE whatsapp_button_widgets ADD COLUMN IF NOT EXISTS stage_key VARCHAR(64) DEFAULT 'prospeccao'`
  );
}

async function migrateContactFormWidgets() {
  if (await tableExists('contact_form_widgets')) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_form_widgets (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      site_url VARCHAR(512) NOT NULL,
      site_name VARCHAR(160) DEFAULT '',
      monitor_code VARCHAR(64) UNIQUE NOT NULL,
      form_selector VARCHAR(255) DEFAULT 'form',
      field_mappings JSONB DEFAULT '[]'::jsonb,
      pipeline_id INT REFERENCES pipelines(id) ON DELETE SET NULL,
      stage_key VARCHAR(64) DEFAULT 'prospeccao',
      active BOOLEAN DEFAULT TRUE,
      page_views INT DEFAULT 0,
      form_submissions INT DEFAULT 0,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_contact_form_user ON contact_form_widgets(user_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_contact_form_code ON contact_form_widgets(monitor_code)');
}

async function migrateContactsSite() {
  if (!(await tableExists('contacts'))) return;
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS site VARCHAR(512) DEFAULT ''`);
}

async function migrateDealsContactId() {
  if (!(await tableExists('deals'))) return;

  await pool.query(
    `ALTER TABLE deals ADD COLUMN IF NOT EXISTS contact_id INT REFERENCES contacts(id) ON DELETE SET NULL`
  );

  try {
    await pool.query(`
      UPDATE deals d
      SET contact_id = c.id
      FROM contacts c
      WHERE d.contact_id IS NULL
        AND d.user_id = c.user_id
        AND d.titulo = c.nome
        AND c.ultima_interacao LIKE 'Lead via botão WhatsApp%'
    `);
  } catch {
    /* backfill opcional */
  }
}
