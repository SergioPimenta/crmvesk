CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'user') DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  nome VARCHAR(160) NOT NULL,
  segmento VARCHAR(160) DEFAULT '',
  etapa ENUM('Prospecção','Qualificação','Proposta','Negociação','Fechado') DEFAULT 'Prospecção',
  proxima_acao VARCHAR(255) DEFAULT '',
  prioridade ENUM('Alta','Média','Baixa') DEFAULT 'Média',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (user_id),
  CONSTRAINT fk_companies_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  company_id INT NULL,
  nome VARCHAR(160) NOT NULL,
  email VARCHAR(160) DEFAULT '',
  telefone VARCHAR(80) DEFAULT '',
  tipo ENUM('Lead','Cliente','Prospect') DEFAULT 'Lead',
  etapa ENUM('Prospecção','Qualificação','Proposta','Negociação','Fechado') DEFAULT 'Prospecção',
  ultima_interacao VARCHAR(255) DEFAULT '',
  precisa_followup TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (user_id),
  INDEX (company_id),
  CONSTRAINT fk_contacts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_contacts_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pipelines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  nome VARCHAR(120) NOT NULL,
  is_default TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (user_id),
  CONSTRAINT fk_pipelines_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  pipeline_id INT NOT NULL,
  stage_key VARCHAR(64) NOT NULL,
  titulo VARCHAR(120) NOT NULL,
  cor VARCHAR(20) DEFAULT '#7a7880',
  pos INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_stage_key_per_pipeline (pipeline_id, stage_key),
  INDEX (user_id),
  INDEX (pipeline_id),
  CONSTRAINT fk_stages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_stages_pipeline FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  pipeline_id INT NULL,
  company_id INT NULL,
  titulo VARCHAR(200) NOT NULL,
  valor VARCHAR(40) DEFAULT '',
  prob VARCHAR(10) DEFAULT '',
  stage_key VARCHAR(64) DEFAULT 'prospeccao',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (user_id),
  INDEX (pipeline_id),
  INDEX (company_id),
  CONSTRAINT fk_deals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_deals_pipeline FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE SET NULL,
  CONSTRAINT fk_deals_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  contact_id INT NULL,
  company_id INT NULL,
  titulo VARCHAR(200) NOT NULL,
  tipo ENUM('Reunião','Ligação','Follow-up','Tarefa') NOT NULL,
  quando VARCHAR(80) DEFAULT '',
  status ENUM('Pendente','Concluída') DEFAULT 'Pendente',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (user_id),
  INDEX (contact_id),
  INDEX (company_id),
  CONSTRAINT fk_activities_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_activities_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  CONSTRAINT fk_activities_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS emails (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  contact_id INT NULL,
  company_id INT NULL,
  de VARCHAR(160) NOT NULL,
  assunto VARCHAR(200) DEFAULT '',
  preview VARCHAR(255) DEFAULT '',
  quando VARCHAR(80) DEFAULT '',
  status ENUM('Não lido','Aguardando resposta','Respondido') DEFAULT 'Não lido',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (user_id),
  INDEX (contact_id),
  INDEX (company_id),
  CONSTRAINT fk_emails_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_emails_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  CONSTRAINT fk_emails_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS proposals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  contact_id INT NULL,
  company_id INT NULL,
  deal_id INT NULL,
  titulo VARCHAR(200) NOT NULL,
  valor VARCHAR(40) DEFAULT '',
  status ENUM('Enviada','Visualizada','Aceita','Recusada') DEFAULT 'Enviada',
  enviada_em VARCHAR(80) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (user_id),
  INDEX (contact_id),
  INDEX (company_id),
  INDEX (deal_id),
  CONSTRAINT fk_proposals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_proposals_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  CONSTRAINT fk_proposals_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  CONSTRAINT fk_proposals_deal FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS whatsapp_settings (
  user_id INT PRIMARY KEY,
  provider VARCHAR(32) DEFAULT 'evolution',
  base_url VARCHAR(255) NOT NULL,
  instance_name VARCHAR(120) NOT NULL,
  api_key VARCHAR(255) NOT NULL,
  phone VARCHAR(32) DEFAULT '',
  status ENUM('disconnected','connecting','connected') DEFAULT 'disconnected',
  webhook_secret VARCHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_wa_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS whatsapp_chats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  remote_jid VARCHAR(120) NOT NULL,
  contact_id INT NULL,
  name VARCHAR(160) DEFAULT '',
  last_message TEXT,
  last_message_at DATETIME NULL,
  unread INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_jid (user_id, remote_jid),
  INDEX (user_id),
  CONSTRAINT fk_wa_chats_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_wa_chats_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  chat_id INT NOT NULL,
  wa_message_id VARCHAR(120) DEFAULT NULL,
  body TEXT NOT NULL,
  from_me TINYINT(1) DEFAULT 0,
  message_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_wa_msg (user_id, wa_message_id),
  INDEX (chat_id),
  CONSTRAINT fk_wa_msgs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_wa_msgs_chat FOREIGN KEY (chat_id) REFERENCES whatsapp_chats(id) ON DELETE CASCADE
);
