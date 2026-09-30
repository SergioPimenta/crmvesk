import { Link } from 'react-router-dom';
import { initials, type WaConversation } from './types';

type Props = {
  active: WaConversation;
  isClosed: boolean;
  contactCompany: string | null;
  authUserId?: number | string;
  canTransfer: boolean;
  finishing: boolean;
  onBack: () => void;
  onTransfer: () => void;
  onFinish: () => void;
};

/** Cabeçalho da conversa: contato, responsável e ações (transferir, finalizar, ver contato). */
const ChatHeader = ({
  active,
  isClosed,
  contactCompany,
  authUserId,
  canTransfer,
  finishing,
  onBack,
  onTransfer,
  onFinish,
}: Props) => (
  <div className="wa-chat-head">
    <button
      type="button"
      className="wa-chat-back"
      aria-label="Voltar para conversas"
      onClick={() => onBack()}
    >
      <i className="ti ti-arrow-left" aria-hidden="true" />
    </button>
    <div className="wa-avatar lg">{initials(active.nome)}</div>
    <div className="wa-chat-head-info">
      <div className="wa-chat-name">
        {active.nome}
        {isClosed ? <span className="wa-attendance-badge">Finalizado</span> : null}
      </div>
      <div className="wa-chat-phone">{active.phone}</div>
      {contactCompany && contactCompany !== '—' ? (
        <div className="wa-chat-meta">
          <i className="ti ti-building" aria-hidden="true" />
          {contactCompany}
        </div>
      ) : null}
      <div className="wa-chat-meta">
        <i className="ti ti-user-circle" aria-hidden="true" />
        {active.assignedTo
          ? active.assignedTo === String(authUserId)
            ? 'Atribuído a você'
            : `Atribuído a ${active.assignedToName || 'outro usuário'}`
          : 'Sem responsável — visível para toda a equipe'}
      </div>
    </div>
    <div className="wa-chat-head-actions">
      <button
        type="button"
        className="crm-btn-secondary"
        onClick={() => onTransfer()}
        disabled={isClosed || !canTransfer}
      >
        <i className="ti ti-arrow-forward-up" aria-hidden="true" />
        Transferir conversa
      </button>
      <button
        type="button"
        className="crm-btn-secondary wa-finish-btn"
        onClick={() => void onFinish()}
        disabled={finishing || isClosed}
      >
        <i className="ti ti-circle-check" aria-hidden="true" />
        {finishing ? 'Salvando…' : 'Finalizar atendimento'}
      </button>
      {active.contatoId ? (
        <Link to="/admin/contatos" className="crm-btn-secondary" style={{ padding: '6px 10px', fontSize: 11 }}>
          Ver contato
        </Link>
      ) : null}
    </div>
  </div>
);

export default ChatHeader;
