import { useEffect, useMemo, useRef, useState } from 'react';
import type { AudioRecorder } from './useAudioRecorder';
import { PATH_MIC, PATH_PAUSE, SolidIcon } from './SolidIcon';
import { formatAudioTime, type QuickReply } from './types';

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
  /** Grava uma nota interna (só a equipe vê); resolve `true` se salvou. */
  sendNote: (text: string) => Promise<boolean>;
  quickReplies: QuickReply[];
  onManageQuickReplies: () => void;
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
  sendNote,
  quickReplies,
  onManageQuickReplies,
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [mode, setMode] = useState<'message' | 'note'>('message');
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const noteMode = mode === 'note';

  // Menu de respostas rápidas: aparece ao começar o texto com "/" (sem espaços) e filtra pelo que vem depois.
  const slashQuery =
    !noteMode && !recording && draft.startsWith('/') && !/\s/.test(draft) ? draft.slice(1).toLowerCase() : null;
  const slashOpen = slashQuery !== null && !slashDismissed;
  const slashMatches = useMemo(
    () =>
      slashQuery === null
        ? []
        : quickReplies
            .filter((r) => !slashQuery || r.shortcut.includes(slashQuery) || r.text.toLowerCase().includes(slashQuery))
            .slice(0, 6),
    [quickReplies, slashQuery]
  );

  useEffect(() => {
    setSlashIndex(0);
    setSlashDismissed(false);
  }, [slashQuery]);

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

  const pickQuickReply = (reply: QuickReply) => {
    setDraft(reply.text);
    textareaRef.current?.focus();
  };

  const submit = async (e: React.FormEvent) => {
    if (noteMode) {
      e.preventDefault();
      const text = draft.trim();
      if (!text) return;
      if (await sendNote(text)) setDraft('');
      return;
    }
    await sendMessage(e);
  };

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
                  Passaram mais de 24 horas desde a última mensagem do cliente. Mensagens de texto livre podem ser
                  recusadas pela Meta — se isso acontecer, finalize o atendimento e reinicie com um modelo aprovado.
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
          <form className={`wa-compose${noteMode ? ' wa-compose--note' : ''}`} onSubmit={(e) => void submit(e)}>
            <input ref={imageInputRef} type="file" accept="image/*" multiple hidden onChange={onFileSelected} />
            <input ref={videoInputRef} type="file" accept="video/*" multiple hidden onChange={onFileSelected} />
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
                    disabled={sending || recording || noteMode}
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
                  disabled={sending || noteMode}
                  onClick={() => void startRecording()}
                >
                  <i className="ti ti-microphone" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="crm-icon-btn wa-quick-btn"
                  title="Respostas rápidas (digite /)"
                  aria-label="Respostas rápidas"
                  disabled={sending || noteMode}
                  onClick={() => {
                    setDraft('/');
                    textareaRef.current?.focus();
                  }}
                >
                  <i className="ti ti-bolt" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`crm-icon-btn wa-note-btn${noteMode ? ' active' : ''}`}
                  title={noteMode ? 'Voltar a responder o cliente' : 'Nota interna (só a equipe vê)'}
                  aria-label={noteMode ? 'Voltar a responder o cliente' : 'Escrever nota interna'}
                  aria-pressed={noteMode}
                  onClick={() => setMode(noteMode ? 'message' : 'note')}
                >
                  <i className="ti ti-notes" aria-hidden="true" />
                </button>

                {slashOpen ? (
                  <div className="wa-slash-menu" role="listbox" aria-label="Respostas rápidas">
                    {slashMatches.map((r, i) => (
                      <button
                        key={r.id}
                        type="button"
                        role="option"
                        aria-selected={i === slashIndex}
                        className={`wa-slash-item${i === slashIndex ? ' active' : ''}`}
                        onMouseEnter={() => setSlashIndex(i)}
                        onMouseDown={(e) => {
                          e.preventDefault(); // mantém o foco no campo de texto
                          pickQuickReply(r);
                        }}
                      >
                        <strong>/{r.shortcut}</strong>
                        <span>{r.text}</span>
                      </button>
                    ))}
                    {slashMatches.length === 0 ? (
                      <div className="wa-slash-empty">Nenhuma resposta rápida encontrada.</div>
                    ) : null}
                    <button
                      type="button"
                      className="wa-slash-manage"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onManageQuickReplies();
                      }}
                    >
                      <i className="ti ti-settings" aria-hidden="true" />
                      Gerenciar respostas rápidas
                    </button>
                  </div>
                ) : null}

                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    noteMode ? 'Nota interna — o cliente não vê…' : recording ? 'Gravando áudio…' : 'Digite uma mensagem…'
                  }
                  rows={1}
                  aria-label={noteMode ? 'Nota interna' : 'Mensagem'}
                  onPaste={onComposerPaste}
                  disabled={sending || recording}
                  onKeyDown={(e) => {
                    if (slashOpen && slashMatches.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setSlashIndex((i) => (i + 1) % slashMatches.length);
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length);
                        return;
                      }
                      if (e.key === 'Enter' || e.key === 'Tab') {
                        e.preventDefault();
                        pickQuickReply(slashMatches[slashIndex]);
                        return;
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setSlashDismissed(true);
                        return;
                      }
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void submit(e);
                    }
                  }}
                />
                <button
                  type="submit"
                  className="wa-send-btn"
                  disabled={!draft.trim() || sending || recording}
                  aria-label={noteMode ? 'Salvar nota' : 'Enviar'}
                >
                  <i className={`ti ${noteMode ? 'ti-device-floppy' : 'ti-send'}`} aria-hidden="true" />
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
