import { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/crm/Modal';
import { useCrmData, type Activity, type PipelineStage } from '../../contexts/CrmDataContext';
import { activityToInput } from '../../contexts/crm/mappers';
import { api } from '../../services/api';

type Props = {
  /** Atividade que acabou de ser concluída (reunião ou ligação); null = fechado. */
  activity: Activity | null;
  onClose: () => void;
  /** "Salvar e agendar o próximo passo": o pai abre o formulário já preenchido. */
  onScheduleNext: (activity: Activity) => void;
};

type StageRow = { id: number; pipelineId: number; stageKey: string; titulo: string; pos: number };

const todayLabel = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Depois de concluir uma reunião ou ligação: registrar como foi, mover o negócio de etapa e (se quiser)
 * já agendar o próximo passo. Tudo opcional — "Pular" fecha sem mudar nada.
 */
const CompletionModal = ({ activity, onClose, onScheduleNext }: Props) => {
  const { deals, stages, activePipelineId, updateActivity, updateDealStage } = useCrmData();
  const [result, setResult] = useState('');
  const [stageKey, setStageKey] = useState('');
  const [fetchedStages, setFetchedStages] = useState<PipelineStage[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const deal = useMemo(() => (activity?.dealId ? deals.find((d) => d.id === activity.dealId) ?? null : null), [activity, deals]);

  useEffect(() => {
    setResult('');
    setError('');
    setSaving(false);
    setFetchedStages([]);
    setStageKey(deal?.stageKey ?? '');
    if (!activity || !deal?.pipelineId || deal.pipelineId === activePipelineId) return undefined;
    // O negócio é de outro funil que não o ativo: busca as etapas dele.
    let cancelled = false;
    void api
      .get<StageRow[]>(`/crm/pipelines/${deal.pipelineId}/stages`)
      .then((rows) => {
        if (cancelled) return;
        setFetchedStages(
          rows.map((r) => ({
            id: String(r.id),
            pipelineId: String(r.pipelineId),
            stageKey: r.stageKey,
            titulo: r.titulo,
            cor: '',
            pos: Number(r.pos ?? 0),
          }))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // reinicia ao trocar de atividade
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity?.id]);

  const options = useMemo(() => {
    if (!deal) return [];
    const list = deal.pipelineId === activePipelineId ? stages.filter((s) => s.pipelineId === deal.pipelineId) : fetchedStages;
    return [...list].sort((a, b) => a.pos - b.pos);
  }, [deal, stages, activePipelineId, fetchedStages]);

  const save = async () => {
    if (!activity) return false;
    setSaving(true);
    setError('');
    try {
      const note = result.trim();
      if (note) {
        const previous = (activity.descricao ?? '').trim();
        const descricao = `${previous}${previous ? '\n\n' : ''}Resultado (${todayLabel()}): ${note}`;
        await updateActivity(activity.id, { ...activityToInput(activity), status: 'Concluída', descricao });
      }
      if (deal && stageKey && stageKey !== deal.stageKey) updateDealStage(deal.id, stageKey);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o resultado.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(activity)}
      title="Como foi?"
      description={activity ? `“${activity.titulo}” foi concluída. Registre o resultado e o próximo passo.` : undefined}
      onClose={onClose}
    >
      <div className="crm-form ag-form">
        {error ? (
          <div className="integration-hint ag-form-error" role="alert">
            <i className="ti ti-alert-circle" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="crm-field ag-form-wide">
          <label htmlFor="cm_result">Resultado</label>
          <textarea
            id="cm_result"
            rows={3}
            value={result}
            onChange={(e) => setResult(e.target.value)}
            placeholder="O que foi combinado, objeções, próximos passos…"
            maxLength={1500}
            autoFocus
          />
        </div>

        {deal ? (
          <div className="crm-field ag-form-wide">
            <label htmlFor="cm_stage">Mover o negócio “{deal.titulo}” para</label>
            <select id="cm_stage" value={stageKey} onChange={(e) => setStageKey(e.target.value)} disabled={options.length === 0}>
              {options.length === 0 ? <option value="">Carregando etapas…</option> : null}
              {options.map((s) => (
                <option key={s.stageKey} value={s.stageKey}>
                  {s.titulo}
                  {s.stageKey === deal.stageKey ? ' (etapa atual)' : ''}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="crm-form-actions ag-form-wide">
          <button type="button" className="crm-btn-secondary" onClick={onClose} disabled={saving}>
            Pular
          </button>
          <button
            type="button"
            className="crm-btn-secondary"
            style={{ marginLeft: 'auto' }}
            disabled={saving}
            onClick={async () => {
              if (await save()) {
                const done = activity;
                onClose();
                if (done) onScheduleNext(done);
              }
            }}
          >
            <i className="ti ti-calendar-plus" aria-hidden="true" />
            Salvar e agendar próximo passo
          </button>
          <button
            type="button"
            className="crm-btn-primary"
            disabled={saving}
            onClick={async () => {
              if (await save()) onClose();
            }}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default CompletionModal;
