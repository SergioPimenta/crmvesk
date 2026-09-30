import { useEffect, useState } from 'react';
import Modal from '../../components/crm/Modal';
import { api } from '../../services/api';
import type { QuickReply } from './types';

type Props = {
  open: boolean;
  onClose: () => void;
  replies: QuickReply[];
  currentUserId?: number | string;
  isAdmin: boolean;
  /** Recarrega a lista depois de criar, editar ou excluir. */
  onChanged: () => Promise<void>;
};

/** Gerencia as respostas rápidas da equipe (usadas digitando "/" no campo de mensagem). */
const QuickRepliesModal = ({ open, onClose, replies, currentUserId, isAdmin, onChanged }: Props) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [shortcut, setShortcut] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setEditingId(null);
    setShortcut('');
    setText('');
    setError('');
  };

  useEffect(() => {
    if (open) reset();
  }, [open]);

  const canEdit = (r: QuickReply) => isAdmin || String(r.createdBy) === String(currentUserId);

  const startEdit = (r: QuickReply) => {
    setEditingId(r.id);
    setShortcut(r.shortcut);
    setText(r.text);
    setError('');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { shortcut, text };
      if (editingId) await api.put(`/whatsapp/quick-replies/${editingId}`, payload);
      else await api.post('/whatsapp/quick-replies', payload);
      await onChanged();
      reset();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a resposta');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: QuickReply) => {
    if (!window.confirm(`Excluir a resposta /${r.shortcut}?`)) return;
    try {
      await api.delete(`/whatsapp/quick-replies/${r.id}`);
      if (editingId === r.id) reset();
      await onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível excluir a resposta');
    }
  };

  return (
    <Modal
      open={open}
      wide
      title="Respostas rápidas"
      description="Textos prontos da equipe. No campo de mensagem, digite / e escolha o atalho."
      onClose={onClose}
    >
      <form className="crm-form wa-quick-form" onSubmit={(e) => void save(e)}>
        {error ? (
          <div className="integration-hint" style={{ gridColumn: '1 / -1', borderColor: '#e0525240', color: '#e05252' }}>
            <i className="ti ti-alert-circle" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}
        <div className="crm-field">
          <label htmlFor="qr_shortcut">Atalho</label>
          <input
            id="qr_shortcut"
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            placeholder="ex.: precos"
            maxLength={31}
            required
          />
        </div>
        <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="qr_text">Texto da resposta</label>
          <textarea
            id="qr_text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Olá! Obrigado pelo contato…"
            rows={3}
            maxLength={1000}
            required
          />
        </div>
        <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
          {editingId ? (
            <button type="button" className="crm-btn-secondary" onClick={reset}>
              Cancelar edição
            </button>
          ) : null}
          <button type="submit" className="crm-btn-primary" disabled={saving} style={{ marginLeft: 'auto' }}>
            {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Adicionar resposta'}
          </button>
        </div>
      </form>

      <div className="wa-quick-list" role="list">
        {replies.map((r) => (
          <div key={r.id} className="wa-quick-item" role="listitem">
            <div className="wa-quick-body">
              <strong>/{r.shortcut}</strong>
              <span>{r.text}</span>
            </div>
            {canEdit(r) ? (
              <div className="crm-row-actions">
                <button type="button" className="crm-action-btn" onClick={() => startEdit(r)} aria-label={`Editar /${r.shortcut}`}>
                  <i className="ti ti-pencil" aria-hidden="true" />
                  Editar
                </button>
                <button
                  type="button"
                  className="crm-action-btn crm-action-btn-danger"
                  onClick={() => void remove(r)}
                  aria-label={`Excluir /${r.shortcut}`}
                >
                  <i className="ti ti-trash" aria-hidden="true" />
                  Excluir
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {replies.length === 0 ? <div className="kanban-empty">Nenhuma resposta rápida cadastrada ainda.</div> : null}
      </div>
    </Modal>
  );
};

export default QuickRepliesModal;
