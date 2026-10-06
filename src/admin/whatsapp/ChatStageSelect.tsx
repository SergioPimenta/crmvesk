import { useEffect, useState } from 'react';
import { useCrmData } from '../../contexts/CrmDataContext';
import { api } from '../../services/api';

type StageInfo = {
  dealId: number;
  pipelineId: number;
  stageKey: string;
  stages: { stageKey: string; titulo: string }[];
};

type Props = {
  contactId: string;
};

/**
 * Seletor de status do contato na conversa: escolher a etapa move o negócio no funil
 * (Em contato, Negociação, Proposta…). A primeira etapa (entrada) e a última (fechado)
 * não são oferecidas; se o negócio estiver em uma delas, ela aparece só como etapa atual.
 */
const ChatStageSelect = ({ contactId }: Props) => {
  const { refreshCrmData } = useCrmData();
  const [info, setInfo] = useState<StageInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setInfo(null);
    setError('');
    api
      .get<StageInfo>(`/crm/contacts/${contactId}/stage`)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => {
        if (!cancelled) setInfo(null); // contato sem negócio: sem seletor
      });
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  if (!info || info.stages.length === 0) return null;

  const last = info.stages.length - 1;
  const current = info.stages.find((s) => s.stageKey === info.stageKey);
  const options = info.stages.filter((_, i) => i > 0 && i < last);

  const change = async (stageKey: string) => {
    if (!stageKey || stageKey === info.stageKey || saving) return;
    setSaving(true);
    setError('');
    try {
      const data = await api.put<StageInfo>(`/crm/contacts/${contactId}/stage`, { stageKey });
      setInfo(data);
      await refreshCrmData(); // atualiza o kanban e a lista de contatos
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível mudar o status.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <label className="wa-stage-select" title={error || 'Status do contato no funil'} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
      <span style={{ color: error ? 'var(--vesk-danger, #e5484d)' : 'var(--vesk-muted)' }}>{error ? 'Erro' : 'Status'}</span>
      <select
        className="crm-btn-secondary"
        style={{ padding: '6px 8px', fontSize: 11 }}
        value={info.stageKey}
        disabled={saving}
        onChange={(e) => void change(e.target.value)}
        aria-label="Status do contato no funil"
      >
        {current && !options.some((s) => s.stageKey === current.stageKey) ? (
          <option value={current.stageKey} disabled>
            {current.titulo}
          </option>
        ) : null}
        {options.map((s) => (
          <option key={s.stageKey} value={s.stageKey}>
            {s.titulo}
          </option>
        ))}
      </select>
    </label>
  );
};

export default ChatStageSelect;
