import { useEffect, useRef } from 'react';

export type PendingAttachment = {
  id: string;
  file: File;
  url: string;
  caption: string;
};

type Props = {
  items: PendingAttachment[];
  activeIndex: number;
  sending: boolean;
  error: string;
  onSelect: (index: number) => void;
  onCaptionChange: (id: string, caption: string) => void;
  onRemove: (id: string) => void;
  onAddFiles: (files: File[]) => void;
  onClose: () => void;
  onSend: () => void;
  onDismissError: () => void;
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const kindOf = (file: File) => {
  const type = file.type || '';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'file';
};

const WaAttachPreview = ({
  items,
  activeIndex,
  sending,
  error,
  onSelect,
  onCaptionChange,
  onRemove,
  onAddFiles,
  onClose,
  onSend,
  onDismissError,
}: Props) => {
  const addInputRef = useRef<HTMLInputElement>(null);
  const captionRef = useRef<HTMLInputElement>(null);
  const current = items[Math.min(activeIndex, items.length - 1)];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, sending]);

  useEffect(() => {
    captionRef.current?.focus();
  }, [current?.id]);

  if (!current) return null;
  const kind = kindOf(current.file);

  return (
    <div className="wa-attach-preview" role="dialog" aria-modal="true" aria-label="Enviar anexo">
      <div className="wa-attach-preview-top">
        <button
          type="button"
          className="wa-attach-preview-close"
          aria-label="Fechar"
          disabled={sending}
          onClick={onClose}
        >
          <i className="ti ti-x" aria-hidden="true" />
        </button>
        <div className="wa-attach-preview-name">
          <strong>{current.file.name}</strong>
          <span>{formatSize(current.file.size)}</span>
        </div>
      </div>

      {error ? (
        <div className="wa-send-error" role="alert">
          <i className="ti ti-alert-circle" aria-hidden="true" />
          <span>{error}</span>
          <button type="button" className="wa-send-error-close" aria-label="Fechar aviso" onClick={onDismissError}>
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div className="wa-attach-preview-stage">
        {kind === 'image' ? (
          <img src={current.url} alt={current.file.name} />
        ) : kind === 'video' ? (
          <video src={current.url} controls />
        ) : kind === 'audio' ? (
          <audio src={current.url} controls />
        ) : (
          <div className="wa-attach-preview-file">
            <i className="ti ti-file" aria-hidden="true" />
            <strong>{current.file.name}</strong>
            <span>Pré-visualização indisponível · {formatSize(current.file.size)}</span>
          </div>
        )}
      </div>

      {kind !== 'audio' ? (
        <div className="wa-attach-preview-caption">
          <input
            ref={captionRef}
            type="text"
            placeholder="Digite uma mensagem"
            value={current.caption}
            disabled={sending}
            onChange={(e) => onCaptionChange(current.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!sending) onSend();
              }
            }}
            aria-label="Legenda"
          />
        </div>
      ) : null}

      <div className="wa-attach-preview-footer">
        <div className="wa-attach-preview-thumbs">
          {items.map((item, i) => {
            const k = kindOf(item.file);
            return (
              <div key={item.id} className={`wa-attach-thumb${i === activeIndex ? ' active' : ''}`}>
                <button
                  type="button"
                  className="wa-attach-thumb-btn"
                  onClick={() => onSelect(i)}
                  aria-label={`Ver ${item.file.name}`}
                  title={item.file.name}
                >
                  {k === 'image' ? (
                    <img src={item.url} alt="" />
                  ) : (
                    <i
                      className={`ti ${k === 'video' ? 'ti-video' : k === 'audio' ? 'ti-headphones' : 'ti-file'}`}
                      aria-hidden="true"
                    />
                  )}
                </button>
                {items.length > 1 && !sending ? (
                  <button
                    type="button"
                    className="wa-attach-thumb-remove"
                    aria-label={`Remover ${item.file.name}`}
                    onClick={() => onRemove(item.id)}
                  >
                    <i className="ti ti-x" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            );
          })}
          <input
            ref={addInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length) onAddFiles(files);
            }}
          />
          <button
            type="button"
            className="wa-attach-thumb-add"
            aria-label="Adicionar mais arquivos"
            disabled={sending}
            onClick={() => addInputRef.current?.click()}
          >
            <i className="ti ti-plus" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          className="wa-send-btn wa-attach-preview-send"
          aria-label="Enviar"
          disabled={sending}
          onClick={onSend}
        >
          <i className={`ti ${sending ? 'ti-loader-2 wa-spin' : 'ti-send'}`} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default WaAttachPreview;
