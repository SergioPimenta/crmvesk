import type { Dispatch, SetStateAction } from 'react';
import Modal from '../../components/crm/Modal';
import type {
  Company,
  ContactStage,
  Pipeline,
  PipelineStage,
} from '../../contexts/CrmDataContext';
import { stageToContactEtapa } from '../../utils/crmStage';
import ContactActivities from './ContactActivities';
import ContactFormFields from './ContactFormFields';
import type { ContactFormState } from './types';

type BaseProps = {
  open: boolean;
  form: ContactFormState;
  setForm: Dispatch<SetStateAction<ContactFormState>>;
  companies: Company[];
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void | Promise<void>;
};

type CreateProps = BaseProps & {
  pipelines: Pipeline[];
  sortedFormStages: PipelineStage[];
  stagesStatus: 'loading' | 'ready' | 'error';
  onReloadStages: () => void;
};

/** "Novo contato": além dos dados, escolhe o funil e a etapa em que ele entra automaticamente. */
export const CreateContactModal = ({
  open,
  form,
  setForm,
  companies,
  pipelines,
  sortedFormStages,
  stagesStatus,
  onReloadStages,
  onClose,
  onSubmit,
}: CreateProps) => (
  <Modal
    open={open}
    title="Novo contato"
    description="Cadastre o contato e escolha o funil e a etapa em que ele entrará automaticamente."
    onClose={onClose}
  >
    <form className="crm-form" onSubmit={onSubmit}>
      <ContactFormFields idPrefix="c" form={form} setForm={setForm} companies={companies} />

      <div className="crm-field">
        <label htmlFor="c_pipeline">Funil</label>
        <select
          id="c_pipeline"
          value={form.pipelineId}
          onChange={(e) => setForm((p) => ({ ...p, pipelineId: e.target.value, stageKey: '' }))}
          required
        >
          <option value="">— Selecione —</option>
          {pipelines.map((pl) => (
            <option key={pl.id} value={pl.id}>
              {pl.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="crm-field">
        <label htmlFor="c_stage">Etapa do funil</label>
        <select
          id="c_stage"
          value={form.stageKey}
          onChange={(e) => {
            const key = e.target.value;
            const st = sortedFormStages.find((s) => s.stageKey === key);
            setForm((p) => ({
              ...p,
              stageKey: key,
              etapa: st ? stageToContactEtapa(st.stageKey, st.titulo) : p.etapa,
            }));
          }}
          required
          disabled={sortedFormStages.length === 0}
        >
          {sortedFormStages.length === 0 ? (
            <option value="">
              {stagesStatus === 'error'
                ? 'Não foi possível carregar as etapas'
                : stagesStatus === 'ready'
                  ? 'Este funil não tem etapas'
                  : 'Carregando etapas…'}
            </option>
          ) : (
            sortedFormStages.map((s) => (
              <option key={s.stageKey} value={s.stageKey}>
                {s.titulo}
              </option>
            ))
          )}
        </select>
        {stagesStatus === 'error' ? (
          <button type="button" className="crm-btn-secondary" onClick={onReloadStages} style={{ marginTop: 8 }}>
            Tentar novamente
          </button>
        ) : null}
      </div>

      <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
        <button type="button" className="crm-btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="submit"
          className="crm-btn-primary"
          style={{ marginLeft: 'auto' }}
          disabled={!form.pipelineId || !form.stageKey}
        >
          Salvar contato
        </button>
      </div>
    </form>
  </Modal>
);

type EditProps = BaseProps & {
  contactId: string | null;
  /** Fecha esta tela e abre a Agenda já com o contato. */
  onSchedule: () => void;
};

/** "Editar contato": dados do contato, a etapa exibida na lista e as atividades dele. */
export const EditContactModal = ({ open, form, setForm, companies, contactId, onSchedule, onClose, onSubmit }: EditProps) => (
  <Modal open={open} title="Editar contato" description="Atualize as informações do contato." onClose={onClose}>
    <form className="crm-form" onSubmit={onSubmit}>
      <ContactFormFields idPrefix="ec" form={form} setForm={setForm} companies={companies} />

      <div className="crm-field">
        <label htmlFor="ec_etapa">Etapa (lista)</label>
        <select
          id="ec_etapa"
          value={form.etapa}
          onChange={(e) => setForm((p) => ({ ...p, etapa: e.target.value as ContactStage }))}
        >
          <option value="Prospecção">Prospecção</option>
          <option value="Qualificação">Qualificação</option>
          <option value="Proposta">Proposta</option>
          <option value="Negociação">Negociação</option>
          <option value="Fechado">Fechado</option>
        </select>
      </div>

      {contactId ? <ContactActivities contactId={contactId} onSchedule={onSchedule} /> : null}

      <div className="crm-form-actions" style={{ gridColumn: '1 / -1' }}>
        <button type="button" className="crm-btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="crm-btn-primary" style={{ marginLeft: 'auto' }}>
          Salvar alterações
        </button>
      </div>
    </form>
  </Modal>
);
