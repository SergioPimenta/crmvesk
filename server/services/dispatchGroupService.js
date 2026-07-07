import pool from '../db.js';
import { normalizeRows } from '../utils/rows.js';

async function ownedContactIds(userId, contactIds) {
  const ids = [...new Set((contactIds || []).map((id) => Number(id)).filter(Number.isFinite))];
  if (!ids.length) return [];
  const [rows] = await pool.query('SELECT id FROM contacts WHERE user_id = ?', [userId]);
  const owned = new Set(normalizeRows(rows).map((r) => Number(r.id)));
  return ids.filter((id) => owned.has(id));
}

async function replaceMembers(groupId, contactIds) {
  await pool.query('DELETE FROM whatsapp_dispatch_group_members WHERE group_id = ?', [groupId]);
  if (!contactIds.length) return;
  const values = contactIds.map(() => '(?, ?)').join(', ');
  const params = contactIds.flatMap((id) => [groupId, id]);
  await pool.query(
    `INSERT INTO whatsapp_dispatch_group_members (group_id, contact_id) VALUES ${values}`,
    params
  );
}

export async function listDispatchGroups(userId) {
  const [groupRows] = await pool.query(
    'SELECT id, name FROM whatsapp_dispatch_groups WHERE user_id = ? ORDER BY name ASC',
    [userId]
  );
  const groups = normalizeRows(groupRows).map((g) => ({
    id: String(g.id),
    name: g.name,
    contactIds: [],
  }));
  if (!groups.length) return groups;

  const [memberRows] = await pool.query(
    `SELECT m.group_id, m.contact_id
     FROM whatsapp_dispatch_group_members m
     JOIN whatsapp_dispatch_groups g ON g.id = m.group_id
     WHERE g.user_id = ?`,
    [userId]
  );
  const byGroup = new Map(groups.map((g) => [g.id, g]));
  for (const row of memberRows) {
    const group = byGroup.get(String(row.group_id));
    if (group) group.contactIds.push(String(row.contact_id));
  }
  return groups;
}

export async function createDispatchGroup(userId, { name, contactIds }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Informe o nome do grupo');

  const [result] = await pool.query(
    'INSERT INTO whatsapp_dispatch_groups (user_id, name) VALUES (?, ?)',
    [userId, cleanName]
  );
  const groupId = result.insertId;
  const valid = await ownedContactIds(userId, contactIds);
  await replaceMembers(groupId, valid);
  return { id: String(groupId), name: cleanName, contactIds: valid.map(String) };
}

export async function updateDispatchGroup(userId, groupId, { name, contactIds }) {
  const [rows] = await pool.query(
    'SELECT id FROM whatsapp_dispatch_groups WHERE id = ? AND user_id = ?',
    [groupId, userId]
  );
  if (!rows.length) throw new Error('Grupo não encontrado');

  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Informe o nome do grupo');

  await pool.query('UPDATE whatsapp_dispatch_groups SET name = ? WHERE id = ? AND user_id = ?', [
    cleanName,
    groupId,
    userId,
  ]);
  const valid = await ownedContactIds(userId, contactIds);
  await replaceMembers(groupId, valid);
  return { id: String(groupId), name: cleanName, contactIds: valid.map(String) };
}

export async function deleteDispatchGroup(userId, groupId) {
  const [result] = await pool.query(
    'DELETE FROM whatsapp_dispatch_groups WHERE id = ? AND user_id = ?',
    [groupId, userId]
  );
  if (!result.affectedRows) throw new Error('Grupo não encontrado');
  return { ok: true };
}
