import { useEffect, useRef } from 'react';
import type { AudioRecorder } from './useAudioRecorder';
import { PATH_MIC, PATH_PAUSE, SolidIcon } from './SolidIcon';
import { formatAudioTime } from './types';

type Props = {
  isClosed: boolean;
  messagesReady: boolean;
  outsideWindow: boolean;
  sendError: string;
  onDismissError: () => void;
  sending: boolean;
  draft: string;
  setDraft: (value: string) => void;
  sendMessage: (e: React.FormEvent) => void | Promise<void>;
  onFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onComposerPaste: (e: React.ClipboardEvent) => void;
  recorder: AudioRecorder;
  attachOpen: boolean;
  setAttachOpen: (open: boolean | ((open: boolean) => boolean)) => void;
};

/** Rodapé da conversa: avisos (finalizado, carregando, janela de 24 h, erro) e a barra de envio. */
const Composer = ({
  isClosed,
  messagesReady,
  outsideWindow,
  sendError,
  onDismissError,
  sending,
  draft,
  setDraft,
  sendMessage,
  onFileSelected,
  onComposerPaste,
  recorder,
  attachOpen,
  setAttachOpen,
}: Props) => {
  const {
    recording,
    paused: recordPaused,
    seconds: recordSeconds,
    levels: recordLevels,
    start: startRecording,
    stop: stopRecording,
    cancel: cancelRecording,
    togglePause: togglePauseRecording,
  } = recorder;
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  // Clicar fora do menu do clipe fecha o menu.
  useEffect(() => {
    if (!attachOpen) return undefined;
    const onDocClick = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [attachOpen, setAttachOpen]);

  return (
    <>
          {isClosed ? (
            <div className="wa-closed-banner">
              <i className="ti ti-circle-check" aria-hidden="true" />
              Atendimento finalizado.
            </div>
          ) : !messagesReady ? (
            <div className="wa-compose-pending">
              <i className="ti ti-loader-2 wa-spin" aria-hidden="true" />
              Carregando conversa…
            </div>
          ) : (
            <>
              {outsideWindow ? (
                <div className="wa-window-banner wa-window-banner--hint">
                  <i className="ti ti-clock-exclamation" aria-hidden="true" />
                  <div>
                    <strong>Fora da janela de 24 horas</strong>
                    <p>
                      Passaram mais de 24 horas desde a última mensagem do cliente. Mensagens de texto livre
                      podem ser recusadas pela Meta — se isso acontecer, finalize o atendimento e reinicie
                      com um modelo aprovado.
                    </p>
                  </div>
                </div>
              ) : null}
              {sendError ? (
                <div className="wa-send-error" role="alert">
                  <i className="ti ti-alert-circle" aria-hidden="true" />
                  <span>{sendError}</span>
                  <button
                    type="button"
                    className="wa-send-error-close"
                    aria-label="Fechar aviso de erro"
                    onClick={() => onDismissError()}
                  >
                    <i className="ti ti-x" aria-hidden="true" />
                  </button>
                </div>
              ) : null}
              <form className="wa-compose" onSubmit={(e) => void sendMessage(e)}>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={onFileSelected}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                multiple
                hidden
                onChange={onFileSelected}
              />
              <input
                ref={documentInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,application/*"
                multiple
                hidden
                onChange={onFileSelected}
              />
              {recording ? (
                <div className="wa-recorder" role="group" aria-label="Gravando áudio">
                  <button
                    type="button"
                    className="wa-recorder-icon"
                    title="Descartar gravação"
                    aria-label="Descartar gravação"
                    onClick={cancelRecording}
                  >
                    <i className="ti ti-trash" aria-hidden="true" />
                  </button>
                  <span className={`wa-recorder-dot${recordPaused ? ' paused' : ''}`} aria-hidden="true" />
                  <span className="wa-recorder-time">{formatAudioTime(recordSeconds)}</span>
                  <div className={`wa-recorder-wave${recordPaused ? ' paused' : ''}`} aria-hidden="true">
                    {recordLevels.map((lv, i) => (
                      <span key={i} style={{ height: `${Math.max(12, Math.round(lv * 100))}%` }} />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="wa-recorder-icon wa-recorder-pause"
                    title={recordPaused ? 'Continuar gravação' : 'Pausar gravação'}
                    aria-label={recordPaused ? 'Continuar gravação' : 'Pausar gravação'}
                    onClick={togglePauseRecording}
                  >
                    <SolidIcon path={recordPaused ? PATH_MIC : PATH_PAUSE} />
                  </button>
                  <button
                    type="button"
                    className="wa-send-btn"
                    title="Enviar áudio"
                    aria-label="Enviar áudio"
                    onClick={stopRecording}
                  >
                    <i className="ti ti-send" aria-hidden="true" />
                  </button>
                </div>
              ) : (
              <>
              <div className="wa-compose-attach" ref={attachMenuRef}>
                <button
                  type="button"
                  className="crm-icon-btn"
                  title="Anexar"
                  aria-label="Anexar arquivo"
                  aria-expanded={attachOpen}
                  disabled={sending || recording}
                  onClick={() => setAttachOpen((o) => !o)}
                >
                  <i className="ti ti-paperclip" aria-hidden="true" />
                </button>
                {attachOpen ? (
                  <div className="wa-attach-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAttachOpen(false);
                        imageInputRef.current?.click();
                      }}
                    >
                      <i className="ti ti-photo" aria-hidden="true" />
                      Imagem
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAttachOpen(false);
                        videoInputRef.current?.click();
                      }}
                    >
                      <i className="ti ti-video" aria-hidden="true" />
                      Vídeo
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAttachOpen(false);
                        documentInputRef.current?.click();
                      }}
                    >
                      <i className="ti ti-file" aria-hidden="true" />
                      Documento
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="crm-icon-btn wa-record-btn"
                title="Gravar áudio"
                aria-label="Gravar áudio"
                disabled={sending}
                onClick={() => void startRecording()}
              >
                <i className="ti ti-microphone" aria-hidden="true" />
              </button>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={recording ? 'Gravando áudio…' : 'Digite uma mensagem…'}
                rows={1}
                aria-label="Mensagem"
                onPaste={onComposerPaste}
                disabled={sending || recording}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage(e);
                  }
                }}
              />
              <button
                type="submit"
                className="wa-send-btn"
                disabled={!draft.trim() || sending || recording}
                aria-label="Enviar"
              >
                <i className="ti ti-send" aria-hidden="true" />
              </button>
              </>
              )}
              </form>
            </>
          )}
    </>
  );
};

export default Composer;
