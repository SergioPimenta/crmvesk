import { useEffect, useRef, useState } from 'react';
import type { PendingAttachment } from '../../components/crm/WaAttachPreview';
import { MEDIA_BYTES_LIMITS, mediaKindFromMime } from './types';

type Options = {
  /** Há uma conversa aberta, carregada, não finalizada e sem gravação em andamento? */
  canAttach: boolean;
  /** Muda quando a conversa muda: descarta os anexos pendentes. */
  resetKey: string | undefined;
  draft: string;
  setDraft: (value: string) => void;
  sending: boolean;
  /** Envia um arquivo com a legenda informada; resolve `true` se enviou. */
  sendMediaFile: (file: File, opts?: { caption?: string }) => Promise<boolean>;
  setSendError: (message: string) => void;
  setAttachOpen: (open: boolean) => void;
};

/**
 * Anexos pendentes (como no WhatsApp Web): arrastar e soltar, colar, escolher pelo clipe, legenda por arquivo
 * e envio em sequência.
 */
export function usePendingAttachments({
  canAttach,
  resetKey,
  draft,
  setDraft,
  sending,
  sendMediaFile,
  setSendError,
  setAttachOpen,
}: Options) {
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [pendingIndex, setPendingIndex] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const dragDepthRef = useRef(0);
  const pendingRef = useRef<PendingAttachment[]>([]);

  const clearPending = () => {
    pendingRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    pendingRef.current = [];
    setPending([]);
    setPendingIndex(0);
  };

  const addPendingFiles = (files: File[]) => {
    if (!canAttach || files.length === 0) return;
    const accepted: PendingAttachment[] = [];
    const errors: string[] = [];
    files.forEach((file) => {
      const mime = (file.type || 'application/octet-stream').split(';')[0].trim();
      const limit = MEDIA_BYTES_LIMITS[mediaKindFromMime(mime)];
      if (file.size > limit) {
        errors.push(`${file.name}: acima do limite de ${Math.floor(limit / 1024 / 1024)} MB`);
        return;
      }
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        url: URL.createObjectURL(file),
        caption: '',
      });
    });
    setSendError(errors.join(' · '));
    if (accepted.length === 0) return;
    // Texto já digitado no campo vira a legenda do primeiro anexo (como no WhatsApp Web).
    if (pendingRef.current.length === 0 && draft.trim()) {
      accepted[0].caption = draft.trim();
      setDraft('');
    }
    const next = [...pendingRef.current, ...accepted];
    if (pendingRef.current.length === 0) setPendingIndex(0);
    else setPendingIndex(pendingRef.current.length);
    pendingRef.current = next;
    setPending(next);
    setAttachOpen(false);
  };

  const removePending = (id: string) => {
    const target = pendingRef.current.find((p) => p.id === id);
    if (target) URL.revokeObjectURL(target.url);
    const next = pendingRef.current.filter((p) => p.id !== id);
    pendingRef.current = next;
    setPending(next);
    setPendingIndex((i) => Math.max(0, Math.min(i, next.length - 1)));
  };

  const updateCaption = (id: string, caption: string) => {
    const next = pendingRef.current.map((p) => (p.id === id ? { ...p, caption } : p));
    pendingRef.current = next;
    setPending(next);
  };

  const sendPending = async () => {
    if (sending) return;
    let remaining = [...pendingRef.current];
    for (const item of pendingRef.current) {
      const ok = await sendMediaFile(item.file, { caption: item.caption });
      if (!ok) {
        pendingRef.current = remaining;
        setPending(remaining);
        setPendingIndex(0);
        return;
      }
      URL.revokeObjectURL(item.url);
      remaining = remaining.filter((p) => p.id !== item.id);
      pendingRef.current = remaining;
      setPending(remaining);
    }
    clearPending();
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    addPendingFiles(files);
  };

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

  const onChatDragEnter = (e: React.DragEvent) => {
    if (!canAttach || !hasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const onChatDragOver = (e: React.DragEvent) => {
    if (!canAttach || !hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const onChatDragLeave = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  };

  const onChatDrop = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    addPendingFiles(Array.from(e.dataTransfer.files));
  };

  const onComposerPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length === 0) return;
    e.preventDefault();
    addPendingFiles(files);
  };

  // Trocar de conversa descarta os anexos pendentes.
  useEffect(() => {
    clearPending();
    dragDepthRef.current = 0;
    setDragActive(false);
  }, [resetKey]);

  // Ao sair da tela, libera as pré-visualizações.
  useEffect(
    () => () => {
      pendingRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    },
    []
  );

  return {
    pending,
    pendingIndex,
    setPendingIndex,
    dragActive,
    addPendingFiles,
    removePending,
    updateCaption,
    clearPending,
    sendPending,
    onFileSelected,
    onComposerPaste,
    onChatDragEnter,
    onChatDragOver,
    onChatDragLeave,
    onChatDrop,
  };
}
