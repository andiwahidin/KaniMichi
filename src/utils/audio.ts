import type { SpeakerRole } from '../types/listening';
import { stripFuriganaMarkup } from '../data/reading';

function pickJapaneseVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const voices = window.speechSynthesis.getVoices();
  const jaVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('ja'));
  // Prefer local service voices first for lower latency
  return jaVoices.sort((a, b) => Number(b.localService) - Number(a.localService));
}

function getVoiceAndPitch(
  role: SpeakerRole,
  jaVoices: SpeechSynthesisVoice[]
): { voice?: SpeechSynthesisVoice; pitch: number } {
  const primary = jaVoices[0];
  const secondary = jaVoices[1] ?? primary;
  const tertiary = jaVoices[2] ?? primary;

  switch (role) {
    case 'female':
      return { voice: primary, pitch: 1.12 };
    case 'male':
      return { voice: secondary, pitch: 0.84 };
    case 'female2':
      return { voice: tertiary, pitch: 1.24 };
    case 'male2':
      return { voice: secondary, pitch: 0.74 };
    case 'narrator':
    default:
      return { voice: primary, pitch: 1.0 };
  }
}

const activeAudioSources = new Set<string>();
const audioListeners = new Set<() => void>();
let audioPlayingSnapshot = false;

function emitAudioState(): void {
  const next = activeAudioSources.size > 0;
  if (next === audioPlayingSnapshot) return;
  audioPlayingSnapshot = next;
  audioListeners.forEach((listener) => listener());
}

/**
 * Register or unregister an active audio playback source (TTS, pitch melody, dialogue).
 * Used by quiz auto-advance timers so they wait until audio finishes playing.
 */
export function setExternalAudioPlaying(sourceId: string, playing: boolean): void {
  if (playing) {
    activeAudioSources.add(sourceId);
  } else {
    activeAudioSources.delete(sourceId);
  }
  emitAudioState();
}

export function isAudioPlaying(): boolean {
  return audioPlayingSnapshot;
}

export function subscribeAudioPlaying(listener: () => void): () => void {
  audioListeners.add(listener);
  return () => {
    audioListeners.delete(listener);
  };
}

let speechToken = 0;
let speechPollTimer: number | null = null;
let speechWatchdogTimer: number | null = null;

function clearSpeechMonitors(): void {
  if (speechPollTimer !== null) {
    window.clearInterval(speechPollTimer);
    speechPollTimer = null;
  }
  if (speechWatchdogTimer !== null) {
    window.clearTimeout(speechWatchdogTimer);
    speechWatchdogTimer = null;
  }
}

/**
 * Stop any ongoing Japanese speech synthesis playback.
 */
export function stopSpeech(): void {
  speechToken += 1;
  clearSpeechMonitors();
  setExternalAudioPlaying('tts', false);
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Ignore errors in restricted environments
  }
}

/**
 * Speak a single Japanese utterance using Web Speech API (ja-JP).
 * Tracks live playback state reliably (including browser onend fallback monitors)
 * and gracefully degrades if speechSynthesis is unavailable.
 */
export function speakJapanese(
  text: string,
  rate = 0.92,
  role: SpeakerRole = 'narrator',
  onEnd?: () => void
): void {
  const clean = stripFuriganaMarkup(text).trim();
  if (
    !clean ||
    typeof window === 'undefined' ||
    !('speechSynthesis' in window)
  ) {
    onEnd?.();
    return;
  }

  speechToken += 1;
  const myToken = speechToken;
  clearSpeechMonitors();

  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    if (myToken === speechToken) {
      clearSpeechMonitors();
      setExternalAudioPlaying('tts', false);
    }
    onEnd?.();
  };

  try {
    window.speechSynthesis.cancel();
    setExternalAudioPlaying('tts', true);

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'ja-JP';
    utterance.rate = rate;

    const jaVoices = pickJapaneseVoices();
    const { voice, pitch } = getVoiceAndPitch(role, jaVoices);
    utterance.pitch = pitch;
    if (voice) {
      utterance.voice = voice;
    }

    let hasStarted = false;
    const startedAt = Date.now();

    utterance.onstart = () => {
      if (myToken !== speechToken) return;
      hasStarted = true;
    };
    utterance.onend = finish;
    utterance.onerror = finish;

    // Fallback monitor in case mobile/desktop browsers silently drop utterance.onend
    speechPollTimer = window.setInterval(() => {
      if (myToken !== speechToken) {
        clearSpeechMonitors();
        return;
      }
      const synth = window.speechSynthesis;
      const elapsed = Date.now() - startedAt;
      if (hasStarted && !synth.speaking && !synth.pending) {
        finish();
      } else if (!hasStarted && elapsed > 1800 && !synth.speaking && !synth.pending) {
        finish();
      }
    }, 220);

    const maxDurationMs = Math.min(
      30000,
      Math.max(4500, Math.round((clean.length * 420) / Math.max(0.5, rate)) + 3000)
    );
    speechWatchdogTimer = window.setTimeout(finish, maxDurationMs);

    window.speechSynthesis.speak(utterance);
  } catch {
    finish();
  }
}

export interface DialogueCue {
  id: string;
  role: SpeakerRole;
  text: string;
  pauseAfterMs?: number;
}

/**
 * Sequentially play a multi-speaker Japanese dialogue with natural pauses and speaker pitch/voice differentiation.
 * Returns a cancel function that immediately stops playback and prevents subsequent cues.
 */
export function playDialogueSequence(
  cues: DialogueCue[],
  options: {
    rate?: number;
    onCueStart?: (cueId: string, index: number) => void;
    onComplete?: () => void;
    onError?: () => void;
  } = {}
): () => void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || cues.length === 0) {
    options.onComplete?.();
    return () => {};
  }

  let cancelled = false;
  let timerId: number | null = null;
  const rate = options.rate ?? 0.94;
  const jaVoices = pickJapaneseVoices();

  const cancel = () => {
    cancelled = true;
    if (timerId !== null) {
      window.clearTimeout(timerId);
      timerId = null;
    }
    setExternalAudioPlaying('dialogue', false);
    stopSpeech();
  };

  stopSpeech();
  setExternalAudioPlaying('dialogue', true);

  const speakAt = (idx: number) => {
    if (cancelled) return;
    if (idx >= cues.length) {
      setExternalAudioPlaying('dialogue', false);
      options.onComplete?.();
      return;
    }

    const cue = cues[idx];
    options.onCueStart?.(cue.id, idx);

    try {
      const clean = stripFuriganaMarkup(cue.text);
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = 'ja-JP';
      utterance.rate = rate;

      const { voice, pitch } = getVoiceAndPitch(cue.role, jaVoices);
      utterance.pitch = pitch;
      if (voice) {
        utterance.voice = voice;
      }

      const nextStep = () => {
        if (cancelled) return;
        const pause = cue.pauseAfterMs ?? 380;
        timerId = window.setTimeout(() => {
          timerId = null;
          speakAt(idx + 1);
        }, pause);
      };

      utterance.onend = nextStep;
      utterance.onerror = (ev) => {
        if (cancelled) return;
        // 'interrupted' / 'canceled' happen when user stops manually
        if (ev.error === 'interrupted' || ev.error === 'canceled') return;
        nextStep();
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      if (!cancelled) {
        setExternalAudioPlaying('dialogue', false);
        options.onError?.();
      }
    }
  };

  speakAt(0);
  return cancel;
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
