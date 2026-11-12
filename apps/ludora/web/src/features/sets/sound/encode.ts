import { CLIP_MAX_SECONDS } from '@ludora/shared';

/*
 * Turning what an author recorded or chose into the one kind of file the server takes: a plain
 * WAV, 16-bit, one channel, 16,000 samples a second (clear for speech and simple music, and a
 * 20-second clip stays under 700 KB). Silence at either end is trimmed. The browser decodes the
 * original, so any format it can play works, and nothing from the original file's metadata
 * survives. Pictures are shrunk here too, before upload, so they fit a small database allowance.
 */

export const CLIP_RATE = 16_000;

/** One channel: the average of all of them. */
export function downmix(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]!;
  const n = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (const c of channels) sum += c[i]!;
    out[i] = sum / channels.length;
  }
  return out;
}

/** The samples without the silence at either end (quieter than `threshold`), keeping a short margin. */
export function trimSilence(samples: Float32Array, rate: number, threshold = 0.01, marginSec = 0.08): Float32Array {
  let start = 0;
  let end = samples.length - 1;
  while (start < samples.length && Math.abs(samples[start]!) < threshold) start++;
  while (end > start && Math.abs(samples[end]!) < threshold) end--;
  if (start >= samples.length) return new Float32Array(0);
  const margin = Math.round(marginSec * rate);
  return samples.slice(Math.max(0, start - margin), Math.min(samples.length, end + 1 + margin));
}

/** A WAV file of the samples: 16-bit PCM, one channel. */
export function encodeWav(samples: Float32Array, rate: number): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(out.buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i);
  };
  text(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

export class ClipError extends Error {}

/** Decodes any audio the browser can play and returns a clean, trimmed WAV ready to upload. */
export async function toClip(file: Blob): Promise<{ file: File; seconds: number }> {
  const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor || typeof OfflineAudioContext === 'undefined') throw new ClipError('This browser cannot prepare sound clips. Try another browser.');
  const ctx = new Ctor();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new ClipError('That file could not be read as a sound. Try an MP3, WAV, M4A or OGG file.');
  } finally {
    void ctx.close().catch(() => {});
  }
  // Resample to one channel at CLIP_RATE.
  const frames = Math.max(1, Math.ceil(decoded.duration * CLIP_RATE));
  const offline = new OfflineAudioContext(1, frames, CLIP_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  const samples = trimSilence(downmix([rendered.getChannelData(0)]), CLIP_RATE);
  if (samples.length < CLIP_RATE * 0.1) throw new ClipError('That sound is silent or too short. Record it again a little closer to the microphone.');
  const seconds = samples.length / CLIP_RATE;
  if (seconds > CLIP_MAX_SECONDS + 0.05) throw new ClipError(`Sound clips can be up to ${CLIP_MAX_SECONDS} seconds; this one is ${Math.round(seconds)}. Trim it and try again.`);
  return { file: new File([encodeWav(samples, CLIP_RATE) as BlobPart], 'clip.wav', { type: 'audio/wav' }), seconds: Math.round(seconds * 100) / 100 };
}

/** The size to draw a picture at so neither side is longer than `max`. */
export function fitSide(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * A picture small enough to upload under `maxBytes`: returned as it is when it already fits,
 * otherwise drawn smaller and saved as JPEG (or WebP for pictures with see-through parts),
 * stepping the size and quality down until it fits. GIFs stay as they are (they may move).
 */
export async function shrinkImage(file: File, maxBytes: number): Promise<File> {
  if (file.size <= maxBytes || file.type === 'image/gif' || typeof createImageBitmap !== 'function') return file;
  const bitmap = await createImageBitmap(file);
  const keepAlpha = file.type === 'image/png' || file.type === 'image/webp';
  const type = keepAlpha ? 'image/webp' : 'image/jpeg';
  try {
    for (const [side, quality] of [
      [1600, 0.85],
      [1280, 0.8],
      [1024, 0.75],
      [800, 0.7],
      [640, 0.65],
    ] as const) {
      const size = fitSide(bitmap.width, bitmap.height, side);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, size.width, size.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
      if (blob && blob.size <= maxBytes) return new File([blob], file.name, { type: blob.type || type });
    }
  } finally {
    bitmap.close();
  }
  return file;
}
