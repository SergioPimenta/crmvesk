import type { Activity } from '../../contexts/CrmDataContext';

type Response = 'accepted' | 'declined' | 'tentative' | 'needsAction';

const RESPONSE_META: Record<Response, { icon: string; label: string; className: string }> = {
  accepted: { icon: 'ti-circle-check', label: 'Confirmou presença', className: 'yes' },
  declined: { icon: 'ti-circle-x', label: 'Recusou', className: 'no' },
  tentative: { icon: 'ti-help-circle', label: 'Talvez', className: 'maybe' },
  needsAction: { icon: 'ti-clock', label: 'Ainda não respondeu', className: 'wait' },
};

const responseOf = (activity: Activity, email: string): Response => {
  const r = activity.attendeeResponses?.[email.toLowerCase()];
  return r && r in RESPONSE_META ? r : 'needsAction';
};

type Props = {
  activity: Activity;
  /** Nome do contato/cliente (vazio se não houver). */
  contactName?: string;
};

/**
 * Detalhes de um compromisso nas listas: cliente, convidados (com a resposta ao convite) e link do Meet.
 * Só mostra o que existe; sem nada a mostrar, não renderiza.
 */
const ActivityDetails = ({ activity, contactName }: Props) => {
  const guests = activity.attendees ?? [];
  const meet = activity.link && /^https?:\/\//i.test(activity.link) ? activity.link : '';
  if (!contactName && guests.length === 0 && !meet) return null;

  return (
    <div className="ag-details">
      {contactName ? (
        <div className="ag-details-row">
          <i className="ti ti-user" aria-hidden="true" />
          <span>{contactName}</span>
        </div>
      ) : null}

      {guests.length > 0 ? (
        <ul className="ag-details-guests" aria-label="Convidados">
          {guests.map((email) => {
            const meta = RESPONSE_META[responseOf(activity, email)];
            return (
              <li key={email} className={`ag-guest ${meta.className}`} title={`${email} — ${meta.label}`}>
                <i className={`ti ${meta.icon}`} aria-hidden="true" />
                <span className="ag-guest-email">{email}</span>
                <span className="ag-guest-status">{meta.label}</span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {meet ? (
        <a className="ag-details-meet" href={meet} target="_blank" rel="noreferrer">
          <i className="ti ti-video" aria-hidden="true" />
          {/meet\.google\.com/i.test(meet) ? 'Entrar no Google Meet' : 'Abrir link da reunião'}
        </a>
      ) : null}
    </div>
  );
};

export default ActivityDetails;
