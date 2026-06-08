-- PostgreSQL (Vercel Postgres / Neon) — executado automaticamente na primeira requisição

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nome VARCHAR(160) NOT NULL,
  segmento VARCHAR(160) DEFAULT '',
  etapa VARCHAR(40) DEFAULT 'Prospecção',
  proxima_acao VARCHAR(255) DEFAULT '',
  prioridade VARCHAR(20) DEFAULT 'Média',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INT REFERENCES companies(id) ON DELETE SET NULL,
  nome VARCHAR(160) NOT NULL,
  email VARCHAR(160) DEFAULT '',
  telefone VARCHAR(80) DEFAULT '',
  tipo VARCHAR(20) DEFAULT 'Lead',
  etapa VARCHAR(40) DEFAULT 'Prospecção',
  ultima_interacao VARCHAR(255) DEFAULT '',
  precisa_followup BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pipelines (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nome VARCHAR(120) NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pipeline_id INT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  stage_key VARCHAR(64) NOT NULL,
  titulo VARCHAR(120) NOT NULL,
  cor VARCHAR(20) DEFAULT '#7a7880',
  pos INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (pipeline_id, stage_key)
);

CREATE TABLE IF NOT EXISTS deals (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pipeline_id INT REFERENCES pipelines(id) ON DELETE SET NULL,
  company_id INT REFERENCES companies(id) ON DELETE SET NULL,
  contact_id INT REFERENCES contacts(id) ON DELETE SET NULL,
  titulo VARCHAR(200) NOT NULL,
  valor VARCHAR(40) DEFAULT '',
  prob VARCHAR(10) DEFAULT '',
  stage_key VARCHAR(64) DEFAULT 'prospeccao',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id INT REFERENCES contacts(id) ON DELETE SET NULL,
  company_id INT REFERENCES companies(id) ON DELETE SET NULL,
  titulo VARCHAR(200) NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  quando VARCHAR(80) DEFAULT '',
  status VARCHAR(20) DEFAULT 'Pendente',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emails (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id INT REFERENCES contacts(id) ON DELETE SET NULL,
  company_id INT REFERENCES companies(id) ON DELETE SET NULL,
  de VARCHAR(160) NOT NULL,
  assunto VARCHAR(200) DEFAULT '',
  preview VARCHAR(255) DEFAULT '',
  quando VARCHAR(80) DEFAULT '',
  status VARCHAR(40) DEFAULT 'Não lido',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proposals (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id INT REFERENCES contacts(id) ON DELETE SET NULL,
  company_id INT REFERENCES companies(id) ON DELETE SET NULL,
  deal_id INT REFERENCES deals(id) ON DELETE SET NULL,
  titulo VARCHAR(200) NOT NULL,
  valor VARCHAR(40) DEFAULT '',
  status VARCHAR(40) DEFAULT 'Enviada',
  enviada_em VARCHAR(80) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_settings (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(32) DEFAULT 'evolution',
  base_url VARCHAR(255) NOT NULL,
  instance_name VARCHAR(120) NOT NULL,
  api_key VARCHAR(512) NOT NULL,
  phone VARCHAR(32) DEFAULT '',
  status VARCHAR(20) DEFAULT 'disconnected',
  webhook_secret VARCHAR(64) NOT NULL,
  app_secret VARCHAR(255) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_chats (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  remote_jid VARCHAR(120) NOT NULL,
  contact_id INT REFERENCES contacts(id) ON DELETE SET NULL,
  name VARCHAR(160) DEFAULT '',
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  unread INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, remote_jid)
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id INT NOT NULL REFERENCES whatsapp_chats(id) ON DELETE CASCADE,
  wa_message_id VARCHAR(120),
  body TEXT NOT NULL,
  from_me BOOLEAN DEFAULT FALSE,
  message_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, wa_message_id)
);

CREATE INDEX IF NOT EXISTS idx_companies_user ON companies(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_deals_user ON deals(user_id);
CREATE INDEX IF NOT EXISTS idx_wa_chats_user ON whatsapp_chats(user_id);

CREATE TABLE IF NOT EXISTS whatsapp_button_widgets (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_url VARCHAR(512) NOT NULL,
  site_name VARCHAR(160) DEFAULT '',
  phone VARCHAR(32) NOT NULL,
  monitor_code VARCHAR(64) UNIQUE NOT NULL,
  message TEXT DEFAULT '',
  pipeline_id INT REFERENCES pipelines(id) ON DELETE SET NULL,
  stage_key VARCHAR(64) DEFAULT 'prospeccao',
  active BOOLEAN DEFAULT TRUE,
  page_views INT DEFAULT 0,
  button_clicks INT DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_button_user ON whatsapp_button_widgets(user_id);
CREATE INDEX IF NOT EXISTS idx_wa_button_code ON whatsapp_button_widgets(monitor_code);

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
);

CREATE INDEX IF NOT EXISTS idx_contact_form_user ON contact_form_widgets(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_form_code ON contact_form_widgets(monitor_code);
