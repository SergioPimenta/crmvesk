import { initials, type ListTab, type WaConversation } from './types';

type Props = {
  chatCount: number;
  listTab: ListTab;
  onListTabChange: (tab: ListTab) => void;
  waitingChats: WaConversation[];
  ongoingChats: WaConversation[];
  closedChats: WaConversation[];
  /** Conversas da aba selecionada. */
  tabChats: WaConversation[];
  loading: boolean;
  activeId?: string;
  authUserId?: number | string;
  claimingId: string | null;
  onSelect: (id: string) => void;
  onClaim: (id: string) => void;
  onOpenContactPicker: () => void;
  onOpenBulk: () => void;
  onOpenNewAttendance: () => void;
  /** Aviso sonoro de nova conversa em Aguardando. */
  soundOn: boolean;
  onToggleSound: () => void;
  onOpenQuickReplies: () => void;
};

/** Coluna da esquerda: abas de fila (Aguardando / Em andamento / Finalizados) e lista de conversas. */
const ConversationList = ({
  chatCount,
  listTab,
  onListTabChange,
  waitingChats,
  ongoingChats,
  closedChats,
  tabChats,
  loading,
  activeId,
  authUserId,
  claimingId,
  onSelect,
  onClaim,
  onOpenContactPicker,
  onOpenBulk,
  onOpenNewAttendance,
  soundOn,
  onToggleSound,
  onOpenQuickReplies,
}: Props) => (
    <div className="wa-list crm-card inbox-list" aria-label="Lista de conversas">
      <div className="crm-card-header wa-list-header" style={{ marginBottom: 10 }}>
        <i className="ti ti-brand-whatsapp" style={{ color: '#25d366', fontSize: 18 }} aria-hidden="true" />
        <div className="crm-card-title">Conversas</div>
        <span className="pipeline-badge">{chatCount} chats</span>
        <div className="wa-list-header-actions">
          <button
            type="button"
            className={`crm-icon-btn wa-list-icon-btn${soundOn ? ' active' : ''}`}
            title={soundOn ? 'Aviso sonoro ligado (clique para desligar)' : 'Aviso sonoro desligado (clique para ligar)'}
            aria-label={soundOn ? 'Desligar aviso sonoro de novas conversas' : 'Ligar aviso sonoro de novas conversas'}
            aria-pressed={soundOn}
            onClick={onToggleSound}
          >
            <i className={`ti ${soundOn ? 'ti-bell-ringing' : 'ti-bell-off'}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="crm-icon-btn wa-list-icon-btn"
            title="Respostas rápidas"
            aria-label="Gerenciar respostas rápidas"
            onClick={onOpenQuickReplies}
          >
            <i className="ti ti-bolt" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="crm-icon-btn wa-list-icon-btn"
            title="Listagem de contatos"
            aria-label="Abrir listagem de contatos"
            onClick={() => {
              onOpenContactPicker();
            }}
          >
            <i className="ti ti-address-book" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="crm-icon-btn wa-list-icon-btn"
            title="Disparos em massa"
            aria-label="Disparos em massa"
            onClick={onOpenBulk}
          >
            <i className="ti ti-broadcast" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="crm-icon-btn wa-list-icon-btn wa-list-icon-btn--primary"
            title="Iniciar novo atendimento"
            aria-label="Iniciar novo atendimento"
            onClick={() => {
              onOpenNewAttendance();
            }}
          >
            <i className="ti ti-message-plus" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="crm-tabs wa-list-tabs" aria-label="Fila de atendimento">
        <button
          type="button"
          className={`crm-tab${listTab === 'aguardando' ? ' active' : ''}`}
          onClick={() => onListTabChange('aguardando')}
        >
          Aguardando
          {waitingChats.length > 0 ? <span className="pipeline-badge">{waitingChats.length}</span> : null}
        </button>
        <button
          type="button"
          className={`crm-tab${listTab === 'andamento' ? ' active' : ''}`}
          onClick={() => onListTabChange('andamento')}
        >
          Em andamento
          {ongoingChats.length > 0 ? <span className="pipeline-badge">{ongoingChats.length}</span> : null}
        </button>
        <button
          type="button"
          className={`crm-tab${listTab === 'finalizados' ? ' active' : ''}`}
          onClick={() => onListTabChange('finalizados')}
        >
          Finalizados
          {closedChats.length > 0 ? <span className="pipeline-badge">{closedChats.length}</span> : null}
        </button>
      </div>

      {loading ? <div className="kanban-empty">Carregando…</div> : null}

      <div className="inbox-items" role="list">
        {tabChats.map((c) => (
          <div
            key={c.id}
            className={`inbox-item wa-conv-item${activeId === c.id ? ' active' : ''}${c.unread > 0 ? ' unread' : ''}`}
            onClick={() => onSelect(c.id)}
            onKeyDown={(e) => {
              if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onSelect(c.id);
              }
            }}
            role="listitem"
            tabIndex={0}
          >
            <div className="wa-conv-row">
              <div className="wa-avatar">{initials(c.nome)}</div>
              <div className="wa-conv-body">
                <div className="inbox-row">
                  <div className="inbox-from">{c.nome}</div>
                  <div className="wa-conv-row-right">
                    <div className="inbox-when">{c.when}</div>
                    {listTab !== 'aguardando' && c.assignedTo && c.assignedTo !== String(authUserId) ? (
                      <span className="wa-assignee-tag">{c.assignedToName || 'Outro usuário'}</span>
                    ) : null}
                  </div>
                </div>
                <div className="wa-conv-preview">
                  <span className="inbox-preview">{c.lastMessage}</span>
                  {c.unread > 0 ? <span className="wa-unread">{c.unread}</span> : null}
                </div>
                {listTab === 'aguardando' ? (
                  <button
                    type="button"
                    className="wa-claim-btn"
                    disabled={claimingId === c.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void onClaim(c.id);
                    }}
                  >
                    <i className="ti ti-user-check" aria-hidden="true" />
                    {claimingId === c.id ? 'Assumindo…' : 'Assumir conversa'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
        {!loading && tabChats.length === 0 ? (
          <div className="kanban-empty">
            {listTab === 'aguardando'
              ? 'Nenhuma conversa aguardando atendimento.'
              : listTab === 'andamento'
                ? 'Nenhuma conversa em andamento.'
                : 'Nenhuma conversa finalizada ainda.'}
          </div>
        ) : null}
      </div>
    </div>
);

export default ConversationList;
