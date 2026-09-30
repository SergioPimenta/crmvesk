import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'wa_sound_alert';

function readPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

/** Dois toques curtos gerados pelo navegador (sem arquivo de áudio). */
function playBeep() {
  try {
    const Ctx =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    void ctx.resume();
    const t0 = ctx.currentTime;
    [880, 1175].forEach((freq, i) => {
      const start = t0 + i * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.15);
    });
    window.setTimeout(() => void ctx.close(), 700);
  } catch {
    /* navegador bloqueou o áudio (sem interação ainda): sem som, sem erro */
  }
}

/**
 * Avisa quando chega uma conversa nova em "Aguardando": toque sonoro (pode ser desligado) e contagem no título
 * da aba. Só avisa por aumentos depois do carregamento inicial.
 */
export function useWaitingAlert({ waitingCount, ready }: { waitingCount: number; ready: boolean }) {
  const [soundOn, setSoundOn] = useState(readPreference);
  const previous = useRef<number | null>(null);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  useEffect(() => {
    if (!ready) return;
    const before = previous.current;
    previous.current = waitingCount;
    if (before !== null && waitingCount > before && soundRef.current) playBeep();
  }, [waitingCount, ready]);

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = waitingCount > 0 ? `(${waitingCount}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [waitingCount]);

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      const next = !on;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* preferência só não persiste */
      }
      if (next) playBeep(); // toque de confirmação ao ligar
      return next;
    });
  }, []);

  return { soundOn, toggleSound };
}
