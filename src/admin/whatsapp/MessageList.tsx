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

/** Mensagens da conversa agrupadas por dia, com balões, mídia e status de entrega. */
const MessageList = ({ containerRef, endRef, timeline, authUserName, contactName }: Props) => (
  <div className="wa-messages" ref={containerRef} role="log" aria-live="polite">
    {timeline.map((item) =>
      item.type === 'day' ? (
        <div key={item.key} className="wa-day-separator" role="separator">
          <span>{item.label}</span>
        </div>
      ) : (
        <div key={item.key} className={`wa-bubble-wrap${item.message.fromMe ? ' out' : ' in'}`}>
          <div
            className={`wa-bubble${item.message.fromMe ? ' out' : ' in'}${
              item.message.status === 'failed' ? ' wa-bubble--failed' : ''
            }`}
          >
            <MessageContent
              message={item.message as WaMessage}
              avatarLabel={initials(item.message.fromMe ? authUserName || 'Eu' : contactName)}
            />
            <div className="wa-bubble-meta">
              <time dateTime={item.message.messageAt}>{formatMessageTime(item.message.messageAt)}</time>
              {item.message.fromMe ? (
                <MessageChecks status={item.message.status} errorMessage={item.message.errorMessage} />
              ) : null}
            </div>
          </div>
        </div>
      )
    )}
    <div ref={endRef} />
  </div>
);

export default MessageList;
