import { Mp3Encoder } from '@breezystack/lamejs';

const CHUNK = 1152;

function floatToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Converte um áudio gravado pelo navegador (ex.: WebM/Opus) em MP3 mono — formato aceito pela API do WhatsApp. */
export async function convertAudioBlobToMp3(blob: Blob): Promise<Blob> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const channels = decoded.numberOfChannels;
    const mono = new Float32Array(decoded.length);
    for (let c = 0; c < channels; c += 1) {
      const data = decoded.getChannelData(c);
      for (let i = 0; i < data.length; i += 1) mono[i] += data[i] / channels;
    }

    const samples = floatToInt16(mono);
    const encoder = new Mp3Encoder(1, decoded.sampleRate, 64);
    const parts: Uint8Array[] = [];
    for (let i = 0; i < samples.length; i += CHUNK) {
      const buf = encoder.encodeBuffer(samples.subarray(i, i + CHUNK));
      if (buf.length) parts.push(buf);
    }
    const end = encoder.flush();
    if (end.length) parts.push(end);
    return new Blob(parts as BlobPart[], { type: 'audio/mpeg' });
  } finally {
    void ctx.close();
  }
}
