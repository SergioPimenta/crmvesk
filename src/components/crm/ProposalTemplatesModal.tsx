import { useCallback, useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { api } from '../../services/api';

export type ProposalTemplate = {
  id: string;
  nome: string;
  descricao: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fields: string[];
  createdAt: string;
};

const ACCEPTED_EXT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx';

const formatSize = (bytes: number) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const fileIcon = (mime: string) => {
  if (mime === 'application/pdf') return 'ti-file-type-pdf';
  if (mime.includes('word')) return 'ti-file-type-doc';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'ti-file-type-ppt';
  if (mime.includes('sheet') || mime.includes('excel')) return 'ti-file-type-xls';
  return 'ti-file';
};

const addUnique = (list: string[], value: string) => {
  const clean = value.trim();
  if (!clean) return list;
  if (list.some((f) => f.toLowerCase() === clean.toLowerCase())) return list;
  return [...list, clean];
};

// Editor de campos (chips) reutilizado na criação e na edição de um modelo.
const FieldsEditor = ({
  fields,
  onChange,
  idPrefix,
}: {
  fields: string[];
  onChange: (next: string[]) => void;
  idPrefix: string;
}) => {
  const [draft, setDraft] = useState('');

  const commit = () => {
    if (!draft.trim()) return;
    onChange(addUnique(fields, draft));
    setDraft('');
  };

  return (
    <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
      <label htmlFor={idPrefix}>Campos do modelo (opcional)</label>
      <div className="template-fields-chips">
        {fields.map((f) => (
          <span key={f} className="template-field-chip">
            {f}
            <button
              type="button"
              aria-label={`Remover campo ${f}`}
              onClick={() => onChange(fields.filter((x) => x !== f))}
            >
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className="template-fields-add">
        <input
          id={idPrefix}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="Ex.: Cliente, Site Atual, Data…"
        />
        <button type="button" className="crm-btn-secondary" onClick={commit}>
          <i className="ti ti-plus" aria-hidden="true" />
          Adicionar
        </button>
      </div>
      <p className="wa-new-attendance-hint" style={{ marginTop: 6 }}>
        Cada campo vira um campo preenchível ao criar uma proposta com este modelo (ex.: Cliente, Site Atual, Data).
      </p>
    </div>
  );
};

type Props = {
  open: boolean;
  onClose: () => void;
};

const ProposalTemplatesModal = ({ open, onClose }: Props) => {
  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [fields, setFields] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editDescricao, setEditDescricao] = useState('');
  const [editFields, setEditFields] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<ProposalTemplate[]>('/crm/proposal-templates');
      setTemplates((data || []).map((t) => ({ ...t, id: String(t.id) })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar modelos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setError('');
    setNome('');
    setDescricao('');
    setFields([]);
    setFile(null);
    setEditingId(null);
    void loadTemplates();
  }, [open, loadTemplates]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Selecione um arquivo (PDF, Word, PowerPoint ou Excel).');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('nome', nome.trim() || file.name);
      formData.append('descricao', descricao.trim());
      formData.append('fields', JSON.stringify(fields));
      await api.post('/crm/proposal-templates', formData);
      setNome('');
      setDescricao('');
      setFields([]);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar modelo');
    } finally {
      setUploading(false);
    }
  };

  const startEdit = (t: ProposalTemplate) => {
    setEditingId(t.id);
    setEditNome(t.nome);
    setEditDescricao(t.descricao);
    setEditFields(t.fields || []);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const value = editNome.trim();
    if (!value) {
      setError('Informe o nome do modelo.');
      return;
    }
    setSavingEdit(true);
    setError('');
    try {
      await api.put(`/crm/proposal-templates/${editingId}`, {
        nome: value,
        descricao: editDescricao.trim(),
        fields: editFields,
      });
      setEditingId(null);
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar modelo');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (t: ProposalTemplate) => {
    if (!window.confirm(`Excluir o modelo "${t.nome}"?`)) return;
    try {
      await api.delete(`/crm/proposal-templates/${t.id}`);
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir modelo');
    }
  };

  return (
    <Modal
      open={open}
      wide
      title="Modelos de propostas"
      description="Cadastre e envie modelos (PDF, Word, PowerPoint ou Excel) e mapeie os campos que cada um deve ter (Cliente, Site Atual, Data…)."
      onClose={onClose}
    >
      <div className="proposal-templates">
        <form className="crm-form" onSubmit={(e) => void handleUpload(e)}>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="pt_nome">Nome do modelo</label>
            <input
              id="pt_nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Proposta padrão — criação de site"
            />
          </div>
          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="pt_desc">Descrição (opcional)</label>
            <input
              id="pt_desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Quando usar este modelo…"
            />
          </div>

          <FieldsEditor fields={fields} onChange={setFields} idPrefix="pt_field_new" />

          <div className="crm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="pt_file">Arquivo</label>
            <input
              id="pt_file"
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXT}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {error ? (
            <div
              className="integration-hint"
              style={{ borderColor: '#e0525240', color: '#e05252', gridColumn: '1 / -1' }}
            >
              <i className="ti ti-alert-circle" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="crm-btn-primary" disabled={uploading} style={{ marginLeft: 'auto' }}>
              <i className="ti ti-upload" aria-hidden="true" />
              {uploading ? 'Enviando…' : 'Enviar modelo'}
            </button>
          </div>
        </form>

        <div className="proposal-templates-divider" />

        <div className="proposal-templates-list">
          {loading ? (
            <div className="kanban-empty">Carregando…</div>
          ) : templates.length === 0 ? (
            <div className="kanban-empty">Nenhum modelo cadastrado ainda.</div>
          ) : (
            templates.map((t) =>
              editingId === t.id ? (
                <div key={t.id} className="proposal-template-edit">
                  <div className="crm-field">
                    <label htmlFor={`ptn_${t.id}`}>Nome do modelo</label>
                    <input id={`ptn_${t.id}`} value={editNome} onChange={(e) => setEditNome(e.target.value)} />
                  </div>
                  <div className="crm-field">
                    <label htmlFor={`ptd_${t.id}`}>Descrição</label>
                    <input id={`ptd_${t.id}`} value={editDescricao} onChange={(e) => setEditDescricao(e.target.value)} />
                  </div>
                  <FieldsEditor fields={editFields} onChange={setEditFields} idPrefix={`ptf_${t.id}`} />
                  <div className="crm-form-actions">
                    <button type="button" className="crm-btn-secondary" onClick={() => setEditingId(null)} disabled={savingEdit}>
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="crm-btn-primary"
                      onClick={() => void saveEdit()}
                      disabled={savingEdit}
                      style={{ marginLeft: 'auto' }}
                    >
                      <i className="ti ti-check" aria-hidden="true" />
                      {savingEdit ? 'Salvando…' : 'Salvar'}
                    </button>
                  </div>
                </div>
              ) : (
                <div key={t.id} className="proposal-template-row">
                  <div className="proposal-template-icon">
                    <i className={`ti ${fileIcon(t.mimeType)}`} aria-hidden="true" />
                  </div>
                  <div className="proposal-template-info">
                    <div className="proposal-template-name">{t.nome}</div>
                    {t.descricao ? <div className="proposal-template-desc">{t.descricao}</div> : null}
                    <div className="proposal-template-meta">
                      {t.fileName}
                      {t.fileSize ? ` · ${formatSize(t.fileSize)}` : ''}
                      {t.createdAt ? ` · ${formatDate(t.createdAt)}` : ''}
                    </div>
                    {t.fields && t.fields.length > 0 ? (
                      <div className="template-fields-chips" style={{ marginTop: 6 }}>
                        {t.fields.map((f) => (
                          <span key={f} className="template-field-chip template-field-chip--static">
                            {f}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="crm-row-actions">
                    <a
                      href={t.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="crm-action-btn"
                      aria-label={`Abrir ${t.nome}`}
                    >
                      <i className="ti ti-external-link" aria-hidden="true" />
                      Abrir
                    </a>
                    <button
                      type="button"
                      className="crm-action-btn"
                      onClick={() => startEdit(t)}
                      aria-label={`Editar ${t.nome}`}
                    >
                      <i className="ti ti-pencil" aria-hidden="true" />
                      Editar
                    </button>
                    <button
                      type="button"
                      className="crm-action-btn crm-action-btn-danger"
                      onClick={() => void handleDelete(t)}
                      aria-label={`Excluir ${t.nome}`}
                    >
                      <i className="ti ti-trash" aria-hidden="true" />
                      Excluir
                    </button>
                  </div>
                </div>
              )
            )
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ProposalTemplatesModal;
