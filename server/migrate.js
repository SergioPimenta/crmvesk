import pool from './db.js';

const stageMap = {
  prospeccao: { titulo: 'Prospecção', cor: '#7a7880', pos: 0 },
  qualificacao: { titulo: 'Qualificação', cor: '#378add', pos: 1 },
  proposta: { titulo: 'Proposta', cor: '#ef9f27', pos: 2 },
  negociacao: { titulo: 'Negociação', cor: '#4ab3b8', pos: 3 },
  fechado: { titulo: 'Fechado', cor: '#4caf82', pos: 4 },
};

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].c > 0;
}

async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].c > 0;
}

export async function runMigrations() {
  const hasPipelines = await tableExists('pipelines');
  const hasStages = await tableExists('pipeline_stages');

  if (!hasPipelines) {
    await pool.query(`
      CREATE TABLE pipelines (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        nome VARCHAR(120) NOT NULL,
        is_default TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX (user_id),
        CONSTRAINT fk_pipelines_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Migration: tabela pipelines criada');
  }

  if (!hasStages) {
    await pool.query(`
      CREATE TABLE pipeline_stages (
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
      )
    `);
    console.log('Migration: tabela pipeline_stages criada');
  }

  if (!(await columnExists('deals', 'pipeline_id'))) {
    await pool.query(`ALTER TABLE deals ADD COLUMN pipeline_id INT NULL`);
    console.log('Migration: coluna deals.pipeline_id adicionada');
  }

  if (!(await columnExists('deals', 'stage_key'))) {
    await pool.query(`ALTER TABLE deals ADD COLUMN stage_key VARCHAR(64) DEFAULT 'prospeccao'`);
    console.log('Migration: coluna deals.stage_key adicionada');
  }

  if (await columnExists('deals', 'stage')) {
    await pool.query(`UPDATE deals SET stage_key = stage WHERE stage IS NOT NULL AND stage != ''`);
    console.log('Migration: deals.stage copiado para stage_key');
  }

  const [users] = await pool.query('SELECT id AS user_id FROM users');
  for (const row of users) {
    const userId = row.user_id;
    const [existing] = await pool.query('SELECT id FROM pipelines WHERE user_id = ? LIMIT 1', [userId]);
    let pipelineId = existing[0]?.id;

    if (!pipelineId) {
      const [ins] = await pool.query('INSERT INTO pipelines (user_id, nome, is_default) VALUES (?, ?, 1)', [
        userId,
        'Funil padrão',
      ]);
      pipelineId = ins.insertId;
    }

    const [stageCount] = await pool.query(
      'SELECT COUNT(*) AS c FROM pipeline_stages WHERE user_id = ? AND pipeline_id = ?',
      [userId, pipelineId]
    );

    if (stageCount[0].c === 0) {
      for (const [key, meta] of Object.entries(stageMap)) {
        await pool.query(
          'INSERT INTO pipeline_stages (user_id, pipeline_id, stage_key, titulo, cor, pos) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, pipelineId, key, meta.titulo, meta.cor, meta.pos]
        );
      }
      console.log(`Migration: etapas padrão criadas para user_id=${userId}`);
    }

    await pool.query('UPDATE deals SET pipeline_id = ? WHERE user_id = ? AND (pipeline_id IS NULL OR pipeline_id = 0)', [
      pipelineId,
      userId,
    ]);
  }

  console.log('Migration pipeline concluída.');

  if (!(await tableExists('whatsapp_settings'))) {
    await pool.query(`
      CREATE TABLE whatsapp_settings (
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
      )
    `);
    console.log('Migration: tabela whatsapp_settings criada');
  }

  if (!(await tableExists('whatsapp_chats'))) {
    await pool.query(`
      CREATE TABLE whatsapp_chats (
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
      )
    `);
    console.log('Migration: tabela whatsapp_chats criada');
  }

  if (!(await tableExists('whatsapp_messages'))) {
    await pool.query(`
      CREATE TABLE whatsapp_messages (
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
      )
    `);
    console.log('Migration: tabela whatsapp_messages criada');
  }
}
