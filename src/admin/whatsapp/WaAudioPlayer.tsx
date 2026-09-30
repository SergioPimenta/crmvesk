import { useEffect, useRef, useState } from 'react';
import { PATH_MIC, PATH_PAUSE, PATH_PLAY, SolidIcon } from './SolidIcon';
import { formatAudioTime } from './types';

const WAVE_BARS = 40;
const PLAYBACK_RATES = [1, 1.5, 2];

// Forma de onda determinística usada enquanto o áudio real ainda não foi analisado (ou se a análise falhar).
const fallbackPeaks = (seed: string) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Array.from({ length: WAVE_BARS }, () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return 0.25 + ((h >>> 0) % 1000) / 1000 * 0.75;
  });
};

const WaAudioPlayer = ({ src, avatarLabel }: { src: string; avatarLabel: string }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [rate, setRate] = useState(1);
  const [peaks, setPeaks] = useState<number[]>(() => fallbackPeaks(src));

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('durationchange', onLoaded);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('durationchange', onLoaded);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  // Lê o áudio uma vez para desenhar a forma de onda real; em caso de erro mantém a forma padrão.
  useEffect(() => {
    let cancelled = false;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return undefined;
    void (async () => {
      const ctx = new AudioCtx();
      try {
        const res = await fetch(src);
        const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
        if (cancelled) return;
        const data = decoded.getChannelData(0);
        const size = Math.max(1, Math.floor(data.length / WAVE_BARS));
        const raw = Array.from({ length: WAVE_BARS }, (_, b) => {
          let sum = 0;
          for (let i = b * size; i < Math.min(data.length, (b + 1) * size); i += 1) sum += Math.abs(data[i]);
          return sum / size;
        });
        const max = Math.max(...raw, 0.0001);
        setPeaks(raw.map((v) => 0.18 + (v / max) * 0.82));
        if (Number.isFinite(decoded.duration)) setDuration((d) => d || decoded.duration);
      } catch {
        /* mantém forma de onda padrão */
      } finally {
        void ctx.close();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.playbackRate = rate;
      void audio.play();
      setPlaying(true);
    }
  };

  const cycleRate = () => {
    const next = PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(rate) + 1) % PLAYBACK_RATES.length];
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const handleSeek = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    const value = Number(ev.target.value);
    if (audio) audio.currentTime = value;
    setCurrentTime(value);
  };

  const ratio = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const timeLabel = playing || currentTime > 0 ? formatAudioTime(currentTime) : formatAudioTime(duration);

  return (
    <div className="wa-audio-player">
      <audio ref={audioRef} src={src} preload="metadata" />
      {playing ? (
        <button type="button" className="wa-audio-avatar wa-audio-rate" onClick={cycleRate} aria-label="Velocidade de reprodução">
          {rate}x
        </button>
      ) : (
        <div className="wa-audio-avatar" aria-hidden="true">
          {avatarLabel}
          <span className="wa-audio-mic">
            <SolidIcon path={PATH_MIC} />
          </span>
        </div>
      )}
      <button
        type="button"
        className="wa-audio-play"
        onClick={togglePlay}
        aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
      >
        <SolidIcon path={playing ? PATH_PAUSE : PATH_PLAY} />
      </button>
      <div className="wa-audio-body">
        <div className="wa-audio-wave">
          {peaks.map((p, i) => (
            <span
              key={i}
              className={i / WAVE_BARS < ratio ? 'played' : undefined}
              style={{ height: `${Math.round(p * 100)}%` }}
            />
          ))}
          <span className="wa-audio-knob" style={{ left: `${ratio * 100}%` }} />
          <input
            type="range"
            className="wa-audio-seek"
            min={0}
            max={duration || 0}
            step={0.01}
            value={currentTime}
            onChange={handleSeek}
            aria-label="Progresso do áudio"
          />
        </div>
        <span className="wa-audio-time">{timeLabel}</span>
      </div>
    </div>
  );
};

export default WaAudioPlayer;
