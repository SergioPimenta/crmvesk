import { useEffect, useRef, useState } from 'react';
import { convertAudioBlobToMp3 } from '../../utils/audioToMp3';
import { RECORD_BARS } from './types';

type Options = {
  /** Há uma conversa aberta, não finalizada, e nada está sendo enviado? */
  canRecord: boolean;
  /** Recebe o áudio pronto (MP3, ou OGG/Opus no Firefox). Capturado no início da gravação, como a conversa ativa. */
  onAudio: (file: File) => Promise<unknown>;
  onError: (message: string) => void;
};

export type AudioRecorder = {
  recording: boolean;
  paused: boolean;
  seconds: number;
  levels: number[];
  start: () => Promise<void>;
  /** Encerra e envia a gravação. */
  stop: () => void;
  /** Encerra e descarta a gravação. */
  cancel: () => void;
  togglePause: () => void;
};

/** Gravação de áudio do microfone com cronômetro, nível de voz em tempo real, pausa e descarte. */
export function useAudioRecorder({ canRecord, onAudio, onError }: Options): AudioRecorder {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(RECORD_BARS).fill(0));

  const cancelledRef = useRef(false);
  const pausedRef = useRef(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const start = async () => {
    if (!canRecord || recording) return;
    onError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      cancelledRef.current = false;
      pausedRef.current = false;
      setPaused(false);
      setSeconds(0);
      setLevels(Array(RECORD_BARS).fill(0));
      try {
        const ctx = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
      } catch {
        analyserRef.current = null;
      }
      // Só ogg/opus (Firefox) é enviado como gravado. Qualquer outro formato (WebM do Chrome/Edge, MP4
      // fragmentado) é convertido para MP3, que a Meta entrega de forma confiável.
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        analyserRef.current = null;
        void audioCtxRef.current?.close();
        audioCtxRef.current = null;
        if (cancelledRef.current) {
          chunksRef.current = [];
          return;
        }
        const recordedType = recorder.mimeType || mimeType;
        const blob = new Blob(chunksRef.current, { type: recordedType });
        void (async () => {
          try {
            if (recordedType.includes('ogg')) {
              await onAudio(new File([blob], `audio-${Date.now()}.ogg`, { type: 'audio/ogg' }));
              return;
            }
            const mp3 = await convertAudioBlobToMp3(blob);
            await onAudio(new File([mp3], `audio-${Date.now()}.mp3`, { type: 'audio/mpeg' }));
          } catch {
            onError('Não foi possível processar o áudio gravado.');
          }
        })();
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      onError('Não foi possível acessar o microfone. Verifique as permissões do navegador.');
    }
  };

  const stop = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    recorderRef.current = null;
    setRecording(false);
    setPaused(false);
  };

  const cancel = () => {
    cancelledRef.current = true;
    stop();
  };

  const togglePause = () => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === 'recording') {
      rec.pause();
      pausedRef.current = true;
      setPaused(true);
    } else if (rec.state === 'paused') {
      rec.resume();
      pausedRef.current = false;
      setPaused(false);
    }
  };

  // Cronômetro e nível de voz (amostrados a cada 100 ms enquanto grava e não está pausado).
  useEffect(() => {
    if (!recording) return undefined;
    const data = new Uint8Array(128);
    const id = window.setInterval(() => {
      if (pausedRef.current) return;
      setSeconds((s) => s + 0.1);
      const analyser = analyserRef.current;
      let level = 0;
      if (analyser) {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i] - 128));
        level = Math.min(1, (peak / 128) * 2.2);
      }
      setLevels((prev) => [...prev.slice(1), level]);
    }, 100);
    return () => window.clearInterval(id);
  }, [recording]);

  // Ao sair da tela, descarta a gravação e libera o microfone.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') rec.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { recording, paused, seconds, levels, start, stop, cancel, togglePause };
}
