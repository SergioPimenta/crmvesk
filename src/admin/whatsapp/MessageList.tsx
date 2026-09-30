import type { RefObject } from 'react';
import { formatMessageTime, type WaChatItem } from '../../utils/waChatFormat';
import MessageChecks from './MessageChecks';
import MessageContent from './MessageContent';
import { initials, type WaMessage } from './types';

type Props = {
  containerRef: RefObject<HTMLDivElement>;
  endRef: RefObject<HTMLDivElement>;
  timeline: WaChatItem[];
  authUserName?: string;
  contactName: string;
};

/**
 * Mensagens da conversa agrupadas por dia: balões com mídia e status de entrega, notas internas (só a equipe
 * vê) e eventos da conversa (assumida, transferida, finalizada...).
 */
const MessageList = ({ containerRef, endRef, timeline, authUserName, contactName }: Props) => (
  <div className="wa-messages" ref={containerRef} role="log" aria-live="polite">
    {timeline.map((item) => {
      if (item.type === 'day') {
        return (
          <div key={item.key} className="wa-day-separator" role="separator">
            <span>{item.label}</span>
          </div>
        );
      }

      const { message } = item;

      if (message.kind === 'event') {
        return (
          <div key={item.key} className="wa-event" role="note">
            <i className="ti ti-arrows-exchange" aria-hidden="true" />
            <span>{message.text}</span>
            <time dateTime={message.messageAt}>{formatMessageTime(message.messageAt)}</time>
          </div>
        );
      }

      if (message.kind === 'note') {
        return (
          <div key={item.key} className="wa-bubble-wrap out">
            <div className="wa-bubble wa-bubble--note">
              <div className="wa-note-label">
                <i className="ti ti-lock" aria-hidden="true" />
                Nota interna{message.authorName ? ` · ${message.authorName}` : ''} · só a equipe vê
              </div>
              <p>{message.text}</p>
              <div className="wa-bubble-meta">
                <time dateTime={message.messageAt}>{formatMessageTime(message.messageAt)}</time>
              </div>
            </div>
          </div>
        );
      }

      const failed = message.status === 'failed';
      return (
        <div key={item.key} className={`wa-bubble-wrap${message.fromMe ? ' out' : ' in'}`}>
          <div className={`wa-bubble${message.fromMe ? ' out' : ' in'}${failed ? ' wa-bubble--failed' : ''}`}>
            <MessageContent
              message={message as WaMessage}
              avatarLabel={initials(message.fromMe ? authUserName || 'Eu' : contactName)}
            />
            <div className="wa-bubble-meta">
              <time dateTime={message.messageAt}>{formatMessageTime(message.messageAt)}</time>
              {message.fromMe ? <MessageChecks status={message.status} errorMessage={message.errorMessage} /> : null}
            </div>
            {failed ? (
              <div className="wa-bubble-error" role="note">
                {message.errorMessage?.trim() || 'A Meta não informou o motivo da falha.'}
              </div>
            ) : null}
          </div>
        </div>
      );
    })}
    <div ref={endRef} />
  </div>
);

export default MessageList;
