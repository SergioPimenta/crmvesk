-- Migração manual: adiciona pipelines/stage_key em banco criado com schema antigo
-- mysql -u root -p crmvesk_db < server/migrate-pipeline.sql
-- (MySQL 8.0.12+ para ADD COLUMN IF NOT EXISTS; senão use server/migrate.js na subida da API)

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

-- Preferível: reinicie o servidor Node (npm run dev em server/) — migrate.js aplica o restante automaticamente.
