import Modal from '../../components/crm/Modal';
import { initials, type TeamMember, type WaConversation } from './types';

type Props = {
  open: boolean;
  active: WaConversation | null;
  teamMembers: TeamMember[];
  transferring: boolean;
  authUserId?: number | string;
  onClose: () => void;
  /** userId do novo responsável, ou null para devolver a conversa à equipe. */
  onTransfer: (targetUserId: number | null) => void;
};

const TransferModal = ({ open, active, teamMembers, transferring, authUserId, onClose, onTransfer }: Props) => (
  <Modal
    open={open}
    title="Transferir conversa"
    description={active ? `Escolha quem vai assumir o atendimento de ${active.nome}.` : undefined}
    onClose={onClose}
  >
    <div className="wa-contact-picker-list" role="list">
      {active?.assignedTo ? (
        <button
          type="button"
          className="wa-contact-picker-item"
          disabled={transferring}
          onClick={() => onTransfer(null)}
          role="listitem"
        >
          <div className="wa-avatar">
            <i className="ti ti-users" aria-hidden="true" />
          </div>
          <div className="wa-contact-picker-body">
            <div className="wa-contact-picker-name">Devolver para a equipe</div>
            <div className="wa-contact-picker-meta">Remove o responsável — fica visível para todos</div>
          </div>
          <i className="ti ti-chevron-right" aria-hidden="true" />
        </button>
      ) : null}
      {teamMembers
        .filter((m) => String(m.id) !== active?.assignedTo)
        .map((m) => (
          <button
            key={m.id}
            type="button"
            className="wa-contact-picker-item"
            disabled={transferring}
            onClick={() => onTransfer(m.id)}
            role="listitem"
          >
            <div className="wa-avatar">{initials(m.name)}</div>
            <div className="wa-contact-picker-body">
              <div className="wa-contact-picker-name">
                {m.name}
                {m.id === authUserId ? ' (você)' : ''}
              </div>
            </div>
            <i className="ti ti-chevron-right" aria-hidden="true" />
          </button>
        ))}
      {teamMembers.length === 0 ? (
        <div className="kanban-empty">Nenhum outro usuário no workspace ainda.</div>
      ) : null}
    </div>
  </Modal>
);

export default TransferModal;
