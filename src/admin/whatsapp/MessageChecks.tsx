import type { WaMsgStatus } from '../../utils/waChatFormat';
import { PATH_ALERT, SolidIcon } from './SolidIcon';

const MessageChecks = ({ status, errorMessage }: { status?: WaMsgStatus; errorMessage?: string }) => {
  if (!status) return null;
  if (status === 'failed') {
    return (
      <span
        className="wa-msg-checks wa-msg-checks--failed"
        title={errorMessage || 'Falha ao enviar'}
        aria-label={`Falha ao enviar: ${errorMessage || 'motivo não informado'}`}
      >
        <SolidIcon path={PATH_ALERT} />
        Não entregue
      </span>
    );
  }
  const isRead = status === 'read';
  const isDelivered = status === 'delivered' || isRead;
  return (
    <span className={`wa-msg-checks${isRead ? ' read' : ''}`} aria-label={isRead ? 'Lida' : isDelivered ? 'Entregue' : 'Enviada'}>
      <i className="ti ti-check" aria-hidden="true" />
      {isDelivered ? <i className="ti ti-check check-2" aria-hidden="true" /> : null}
    </span>
  );
};

export default MessageChecks;
