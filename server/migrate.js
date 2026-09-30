import crypto from 'crypto';
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

// As migrações são idempotentes, mas rodavam (dezenas de consultas) em todo cold start da função.
// Agora guardamos uma impressão digital do esquema/migrações no banco e só reexecutamos quando ela muda.
// FORCE_MIGRATIONS=true força a execução (ex.: para reaplicar a promoção automática de administrador).
function schemaFingerprint() {
  const files = ['migrate.js', 'schema.pg.sql'].map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8'));
  return crypto
    .createHash('sha1')
    .update(files.join('\n--\n'))
    .update(String(Boolean(process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD)))
    .digest('hex');
}

export async function runMigrations() {
  const fingerprint = schemaFingerprint();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key VARCHAR(64) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  const [rows] = await pool.query("SELECT value FROM app_meta WHERE key = 'schema_fingerprint'");
  if (process.env.FORCE_MIGRATIONS !== 'true' && rows[0]?.value === fingerprint) return;

  await runAllMigrations();

  await pool.query(
    `INSERT INTO app_meta (key, value) VALUES ('schema_fingerprint', ?)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [fingerprint]
  );
}

async function runAllMigrations() {
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
  await migratePushSubscriptions();
  await migrateDispatchGroups();
  await migrateScrapingSeen();
  await migrateProposalTemplates();
  await migrateProposalTemplateFields();
  await migrateProposalEmailTracking();
  await migrateWhatsappChatUi();
  await migrateWhatsappMessageError();
  await migrateWhatsappButtonWidgets();
  await migrateWhatsappWidgetPipeline();
  await migrateContactFormWidgets();
  await migrateDealsContactId();
  await migrateContactsSite();
  await migrateUsersActive();
  await migrateEnsureAdminUser();
  await migrateWhatsappWabaId();
  await migrateAccounts();
  await migrateRateLimits();
  await migrateDeletedRecords();
  await migrateIndexes();
  await migrateChatNotesAndQuickReplies();
  await migrateActivityCalendar();
  await migrateReminders();
  await migrateDispatchGroupOwners();
  await migrateWidgetLeadOwners();
  await migrateRecordOwners();
  await migrateInvites();
  await migrateWhatsappChatAssignee();
  await migrateAutomationSettings();
  await seedAdminIfNeeded();
  console.log('Migration concluída.');
}

// Dono de cada registro: usuários comuns só enxergam o que criaram. Registros antigos ficam sem dono (só administradores).
async function migrateRecordOwners() {
  for (const table of ['companies', 'contacts', 'deals', 'activities', 'emails', 'proposals']) {
    if (!(await tableExists(table))) continue;
    await pool.query(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS created_by INT REFERENCES users(id) ON DELETE SET NULL`
    );
  }
}

// Agenda: data e hora reais (UTC), duração, local, link de vídeo, responsável e vínculo com negócio.
// A coluna antiga `quando` (texto livre) continua existindo para as atividades já cadastradas.
async function migrateActivityCalendar() {
  if (!(await tableExists('activities'))) return;
  const columns = [
    'start_at TIMESTAMPTZ',
    'end_at TIMESTAMPTZ',
    'all_day BOOLEAN DEFAULT FALSE',
    "descricao TEXT DEFAULT ''",
    "local VARCHAR(255) DEFAULT ''",
    "link VARCHAR(512) DEFAULT ''",
    "prioridade VARCHAR(10) DEFAULT 'Média'",
    'deal_id INT REFERENCES deals(id) ON DELETE SET NULL',
    'assigned_to INT REFERENCES users(id) ON DELETE SET NULL',
    'completed_at TIMESTAMPTZ',
  ];
  for (const column of columns) {
    await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS ${column}`);
  }
  await pool.query('CREATE INDEX IF NOT EXISTS idx_activities_start ON activities(user_id, start_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_activities_assigned ON activities(assigned_to)');
}

// Lembretes da Agenda: antecedência por atividade, marca de "já avisado", feed de notificações e preferência
// de lembrete por e-mail.
async function migrateReminders() {
  if (await tableExists('activities')) {
    await pool.query('ALTER TABLE activities ADD COLUMN IF NOT EXISTS remind_minutes INT');
    await pool.query('ALTER TABLE activities ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ');
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_activities_due_reminder ON activities(start_at) WHERE reminded_at IS NULL AND remind_minutes IS NOT NULL'
    );
  }
  if (await tableExists('users')) {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS remind_email BOOLEAN DEFAULT FALSE');
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id INT,
      type VARCHAR(30) NOT NULL DEFAULT 'reminder',
      title VARCHAR(200) NOT NULL,
      body TEXT DEFAULT '',
      url VARCHAR(255) DEFAULT '',
      ref_id INT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      read_at TIMESTAMPTZ
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at DESC)');
}

// Notas internas e eventos da conversa (kind = 'note' | 'event') e respostas rápidas da equipe.
async function migrateChatNotesAndQuickReplies() {
  if (await tableExists('whatsapp_messages')) {
    await pool.query(`ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS kind VARCHAR(12) DEFAULT 'message'`);
    await pool.query(
      'ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS author_id INT REFERENCES users(id) ON DELETE SET NULL'
    );
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quick_replies (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_by INT REFERENCES users(id) ON DELETE SET NULL,
      shortcut VARCHAR(40) NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, shortcut)
    )
  `);
}

// Índices das consultas por workspace/dono (listas do CRM e busca paginada de contatos).
async function migrateIndexes() {
  const indexes = [
    ['idx_contacts_owner', 'contacts', 'user_id, created_by, id DESC'],
    ['idx_contacts_tipo', 'contacts', 'user_id, tipo'],
    ['idx_deals_owner', 'deals', 'user_id, created_by'],
    ['idx_deals_contact', 'deals', 'contact_id'],
    ['idx_activities_owner', 'activities', 'user_id, created_by'],
    ['idx_emails_owner', 'emails', 'user_id, created_by'],
    ['idx_proposals_owner', 'proposals', 'user_id, created_by'],
  ];
  for (const [name, table, columns] of indexes) {
    if (!(await tableExists(table))) continue;
    await pool.query(`CREATE INDEX IF NOT EXISTS ${name} ON ${table}(${columns})`);
  }
}

// Cópia das linhas excluídas (contatos, negócios, e-mails...) para recuperação manual.
async function migrateDeletedRecords() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS deleted_records (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      table_name VARCHAR(40) NOT NULL,
      record_id INT NOT NULL,
      data JSONB NOT NULL,
      deleted_by INT,
      deleted_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_deleted_records_user ON deleted_records(user_id, deleted_at)');
}

// Responsável pelos leads captados por cada botão/formulário (fixo ou rodízio). Sem configuração, o lead fica
// sem dono e só administradores o veem.
async function migrateWidgetLeadOwners() {
  for (const table of ['whatsapp_button_widgets', 'contact_form_widgets']) {
    if (!(await tableExists(table))) continue;
    await pool.query(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS owner_user_id INT REFERENCES users(id) ON DELETE SET NULL`
    );
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS owner_round_robin BOOLEAN DEFAULT FALSE`);
  }
}

// Grupos de disparo passam a ter dono: usuário comum só enxerga e edita os próprios.
async function migrateDispatchGroupOwners() {
  if (!(await tableExists('whatsapp_dispatch_groups'))) return;
  await pool.query(
    'ALTER TABLE whatsapp_dispatch_groups ADD COLUMN IF NOT EXISTS created_by INT REFERENCES users(id) ON DELETE SET NULL'
  );
}

async function migrateRateLimits() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key VARCHAR(200) NOT NULL,
      window_start BIGINT NOT NULL,
      hits INT NOT NULL DEFAULT 0,
      PRIMARY KEY (key, window_start)
    )
  `);
}

async function migrateAccounts() {
  if (!(await tableExists('users'))) return;
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS account_id INT REFERENCES users(id) ON DELETE CASCADE`
  );
  await pool.query('CREATE INDEX IF NOT EXISTS idx_users_account ON users(account_id)');
}

async function migrateAutomationSettings() {
  if (await tableExists('automation_settings')) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS automation_settings (
      account_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      welcome_message_enabled BOOLEAN DEFAULT FALSE,
      welcome_message_text TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function migrateWhatsappChatAssignee() {
  if (!(await tableExists('whatsapp_chats'))) return;
  await pool.query(
    `ALTER TABLE whatsapp_chats ADD COLUMN IF NOT EXISTS assigned_to INT REFERENCES users(id) ON DELETE SET NULL`
  );
  await pool.query('CREATE INDEX IF NOT EXISTS idx_wa_chats_assigned ON whatsapp_chats(assigned_to)');
}

async function migrateInvites() {
  if (await tableExists('invites')) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invites (
      id SERIAL PRIMARY KEY,
      account_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invited_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(160) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
      token VARCHAR(128) UNIQUE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
      expires_at TIMESTAMPTZ NOT NULL,
      accepted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_invites_account ON invites(account_id)');
}

async function migrateUsersActive() {
  if (!(await tableExists('users'))) return;
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE`);
  await pool.query(`UPDATE users SET active = TRUE WHERE active IS NULL`);
}

async function migrateWhatsappWabaId() {
  if (!(await tableExists('whatsapp_settings'))) return;
  await pool.query(`ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS waba_id VARCHAR(64) DEFAULT ''`);
  await pool.query(`ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS meta_app_id VARCHAR(64) DEFAULT ''`);
}

async function migrateEnsureAdminUser() {
  if (!(await tableExists('users'))) return;

  const [adminRows] = await pool.query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  if (adminRows.length > 0) return;

  const [users] = await pool.query(`SELECT id FROM users ORDER BY id ASC LIMIT 1`);
  if (users.length === 0) return;

  await pool.query(`UPDATE users SET role = 'admin' WHERE id = ?`, [users[0].id]);
  console.log(`Migration: usuário #${users[0].id} promovido a administrador (nenhum admin existia)`);
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

async function migrateWhatsappMessageError() {
  if (!(await tableExists('whatsapp_messages'))) return;
  await pool.query(
    `ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS error_message VARCHAR(500) DEFAULT ''`
  );
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

async function migratePushSubscriptions() {
  if (await tableExists('push_subscriptions')) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, endpoint)
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)');
}

async function migrateProposalTemplates() {
  if (await tableExists('proposal_templates')) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS proposal_templates (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nome VARCHAR(200) NOT NULL,
      descricao VARCHAR(500) DEFAULT '',
      file_url TEXT NOT NULL,
      file_name VARCHAR(255) DEFAULT '',
      mime_type VARCHAR(120) DEFAULT '',
      file_size INT DEFAULT 0,
      fields JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_proposal_templates_user ON proposal_templates(user_id)');
}

async function migrateProposalTemplateFields() {
  if (!(await tableExists('proposal_templates'))) return;
  await pool.query(`ALTER TABLE proposal_templates ADD COLUMN IF NOT EXISTS fields JSONB DEFAULT '[]'`);

  if (!(await tableExists('proposals'))) return;
  await pool.query(
    `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS template_id INT REFERENCES proposal_templates(id) ON DELETE SET NULL`
  );
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS field_values JSONB DEFAULT '{}'`);
}

async function migrateProposalEmailTracking() {
  if (!(await tableExists('proposals'))) return;
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ`);
}

async function migrateDispatchGroups() {
  if (await tableExists('whatsapp_dispatch_groups')) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_dispatch_groups (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_dispatch_group_members (
      group_id INT NOT NULL REFERENCES whatsapp_dispatch_groups(id) ON DELETE CASCADE,
      contact_id INT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      PRIMARY KEY (group_id, contact_id)
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_dispatch_groups_user ON whatsapp_dispatch_groups(user_id)');
}

async function migrateScrapingSeen() {
  if (await tableExists('scraping_seen')) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS scraping_seen (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      term VARCHAR(255) NOT NULL,
      result_key VARCHAR(512) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, term, result_key)
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_scraping_seen_user_term ON scraping_seen(user_id, term)');
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
  await pool.query(
    `ALTER TABLE whatsapp_button_widgets ADD COLUMN IF NOT EXISTS use_form BOOLEAN DEFAULT TRUE`
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
