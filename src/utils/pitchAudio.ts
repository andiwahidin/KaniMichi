import type { PitchPatternType } from '../types/pronunciation';
import { setExternalAudioPlaying } from './audio';

const SMALL_KANA = new Set([
  'ゃ',
  'ゅ',
  'ょ',
  'ぁ',
  'ぃ',
  'ぅ',
  'ぇ',
  'ぉ',
  'ャ',
  'ュ',
  'ョ',
  'ァ',
  'ィ',
  'ゥ',
  'ェ',
  'ォ',
]);

/**
 * Splits a kana string into Japanese moras (拍 / haku).
 * Small combining kana (ゃ, ゅ, ょ, ぁ, etc.) attach to the preceding mora,
 * whereas っ / ッ and ー count as their own full rhythmic beat.
 */
export function splitIntoMoras(kana: string): string[] {
  const cleaned = kana.replace(/[\s・]/g, '');
  const moras: string[] = [];
  for (const ch of cleaned) {
    if (SMALL_KANA.has(ch) && moras.length > 0) {
      moras[moras.length - 1] += ch;
    } else {
      moras.push(ch);
    }
  }
  return moras;
}

/**
 * Computes exact Standard Tokyo pitch levels ('L' | 'H') for each mora + trailing particle.
 */
export function getPitchLevels(
  moraCount: number,
  accentNucleus: number
): { wordLevels: ('L' | 'H')[]; particleLevel: 'L' | 'H' } {
  if (moraCount <= 0) {
    return { wordLevels: [], particleLevel: 'L' };
  }

  const wordLevels: ('L' | 'H')[] = [];

  if (accentNucleus === 0) {
    // Heiban: L H H H ... + particle H
    for (let i = 0; i < moraCount; i++) {
      wordLevels.push(i === 0 ? 'L' : 'H');
    }
    return { wordLevels, particleLevel: 'H' };
  }

  if (accentNucleus === 1) {
    // Atamadaka: H L L L ... + particle L
    for (let i = 0; i < moraCount; i++) {
      wordLevels.push(i === 0 ? 'H' : 'L');
    }
    return { wordLevels, particleLevel: 'L' };
  }

  // Nakadaka (2..n-1) or Odaka (n): L on mora 1, H up to accentNucleus, then L
  for (let i = 0; i < moraCount; i++) {
    const moraPos = i + 1; // 1-indexed
    if (moraPos === 1) {
      wordLevels.push('L');
    } else if (moraPos <= accentNucleus) {
      wordLevels.push('H');
    } else {
      wordLevels.push('L');
    }
  }

  return { wordLevels, particleLevel: 'L' };
}

export function classifyPitchPattern(
  moraCount: number,
  accentNucleus: number
): PitchPatternType {
  if (accentNucleus === 0) return 'heiban';
  if (accentNucleus === 1) return 'atamadaka';
  if (accentNucleus >= moraCount) return 'odaka';
  return 'nakadaka';
}

export const PITCH_PATTERN_META: Record<
  PitchPatternType,
  {
    name: string;
    jpName: string;
    code: string;
    shortDesc: string;
    color: string;
  }
> = {
  heiban: {
    name: 'Heiban (Datar)',
    jpName: '平板型',
    code: '0',
    shortDesc: 'Rendah di ketukan 1, lalu naik dan tetap tinggi hingga partikel.',
    color: '#0284C7',
  },
  atamadaka: {
    name: 'Atamadaka (Tinggi Awal)',
    jpName: '頭高型',
    code: '1',
    shortDesc: 'Mulai tinggi di ketukan 1, lalu langsung turun tajam di ketukan 2.',
    color: '#DB2777',
  },
  nakadaka: {
    name: 'Nakadaka (Tinggi Tengah)',
    jpName: '中高型',
    code: '2+',
    shortDesc: 'Naik di ketukan 2, lalu turun di tengah sebelum kata berakhir.',
    color: '#7C3AED',
  },
  odaka: {
    name: 'Odaka (Turun di Partikel)',
    jpName: '尾高型',
    code: 'N',
    shortDesc: 'Tinggi sampai akhir kata, lalu turun tajam saat bertemu partikel (が/は).',
    color: '#0F766E',
  },
};

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new Ctx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

let pitchMelodySeq = 0;

/**
 * Plays a gentle musical pitch-contour guide (Low vs High mora tones) using Web Audio API
 * and calls `onStep(index)` in sync with each mora beat so the SVG pitch diagram animates live.
 * Returns a cancel function.
 */
export function playPitchMelody(
  levels: ('L' | 'H')[],
  options: {
    stepMs?: number;
    onStep?: (index: number | null) => void;
    onComplete?: () => void;
  } = {}
): () => void {
  const ctx = getAudioContext();
  if (!ctx || levels.length === 0) {
    options.onComplete?.();
    return () => {};
  }

  const sourceId = `pitch-${++pitchMelodySeq}`;
  setExternalAudioPlaying(sourceId, true);

  const stepMs = options.stepMs ?? 240;
  const stepSec = stepMs / 1000;
  const LOW_HZ = 207.65; // G#3 — warm, comfortable ear reference
  const HIGH_HZ = 293.66; // D4 — clear musical fifth/tritone separation

  let cancelled = false;
  const timers: number[] = [];
  const activeNodes: OscillatorNode[] = [];

  const now = ctx.currentTime + 0.03;

  levels.forEach((lvl, idx) => {
    const startAt = now + idx * stepSec;
    const dur = stepSec * 0.84;
    const freq = lvl === 'H' ? HIGH_HZ : LOW_HZ;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, startAt);

    // Smooth click-free envelope
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.11, startAt + dur * 0.65);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + dur + 0.02);
    activeNodes.push(osc);

    const t = window.setTimeout(() => {
      if (!cancelled) {
        options.onStep?.(idx);
      }
    }, Math.round(idx * stepMs));
    timers.push(t);
  });

  const endTimer = window.setTimeout(() => {
    if (!cancelled) {
      setExternalAudioPlaying(sourceId, false);
      options.onStep?.(null);
      options.onComplete?.();
    }
  }, Math.round(levels.length * stepMs + 80));
  timers.push(endTimer);

  return () => {
    cancelled = true;
    setExternalAudioPlaying(sourceId, false);
    timers.forEach((id) => window.clearTimeout(id));
    activeNodes.forEach((osc) => {
      try {
        osc.stop();
      } catch {
        // Already stopped
      }
    });
    options.onStep?.(null);
  };
}

/**
 * Real-time fundamental frequency (F0) pitch detector using normalized autocorrelation.
 * Tuned for human speaking voices (75 Hz - 460 Hz). Returns null for silence or unvoiced noise.
 */
export function detectPitchAutocorrelation(
  buf: Float32Array,
  sampleRate: number
): number | null {
  const size = buf.length;
  let rms = 0;
  for (let i = 0; i < size; i++) {
    rms += buf[i] * buf[i];
  }
  rms = Math.sqrt(rms / size);
  if (rms < 0.015) return null; // Too quiet / background noise

  const minLag = Math.floor(sampleRate / 460);
  const maxLag = Math.min(size - 1, Math.floor(sampleRate / 75));

  let bestOffset = -1;
  let bestCorr = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let num = 0;
    let denA = 0;
    let denB = 0;
    for (let i = 0; i < size - lag; i++) {
      const a = buf[i];
      const b = buf[i + lag];
      num += a * b;
      denA += a * a;
      denB += b * b;
    }
    const denom = Math.sqrt(denA * denB);
    if (denom <= 0) continue;
    const corr = num / denom;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestOffset = lag;
    }
  }

  if (bestCorr < 0.72 || bestOffset <= 0) return null;
  return sampleRate / bestOffset;
}
