import WaAudioPlayer from './WaAudioPlayer';
import type { WaMessage } from './types';

const MessageContent = ({ message, avatarLabel }: { message: WaMessage; avatarLabel: string }) => {
  const media = message.media;
  if (!media) return <p>{message.text}</p>;

  if (media.kind === 'image' && media.url) {
    return (
      <div className="wa-media-block">
        <a href={media.url} target="_blank" rel="noreferrer">
          <img src={media.url} alt={media.name || 'Imagem'} className="wa-media-image" />
        </a>
        {media.caption ? <p>{media.caption}</p> : null}
      </div>
    );
  }

  if (media.kind === 'video' && media.url) {
    return (
      <div className="wa-media-block">
        <video controls src={media.url} className="wa-media-video" preload="metadata" />
        {media.caption ? <p>{media.caption}</p> : null}
      </div>
    );
  }

  if (media.kind === 'audio' && media.url) {
    return (
      <div className="wa-media-block">
        <WaAudioPlayer src={media.url} avatarLabel={avatarLabel} />
        {media.caption ? <p>{media.caption}</p> : null}
      </div>
    );
  }

  return (
    <div className="wa-media-block">
      {media.url ? (
        <a href={media.url} target="_blank" rel="noreferrer" className="wa-media-doc" download={media.name}>
          <i className="ti ti-file" aria-hidden="true" />
          <span>{media.name || message.text}</span>
        </a>
      ) : (
        <div className="wa-media-doc wa-media-doc--static">
          <i className="ti ti-file" aria-hidden="true" />
          <span>{media.name || message.text}</span>
        </div>
      )}
      {media.caption ? <p>{media.caption}</p> : null}
    </div>
  );
};

export default MessageContent;
