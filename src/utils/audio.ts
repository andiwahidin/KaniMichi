import { Capacitor, registerPlugin } from '@capacitor/core';
import type { CurriculumItem } from '../types/curriculum';
import type { SpeakerRole } from '../types/listening';
import { stripFuriganaMarkup } from '../data/reading';

export interface NativeAndroidTtsEngineInfo {
  name: string;
  label: string;
}

export interface NativeAndroidTtsStatus {
  ready: boolean;
  hasJapaneseVoice: boolean;
  hasOfflineJapaneseVoice: boolean;
  engine?: string;
  engineLabel?: string;
  engines?: NativeAndroidTtsEngineInfo[];
  selectedVoiceName?: string;
  lastError?: string;
}

interface NativeTtsPluginInterface {
  speak(options: {
    text: string;
    lang?: string;
    rate?: number;
    pitch?: number;
  }): Promise<{ spoken: boolean; engine?: string; voice?: string; reason?: string }>;
  stop(): Promise<void>;
  getStatus(): Promise<NativeAndroidTtsStatus>;
  setEngine(options: { engine: string }): Promise<NativeAndroidTtsStatus & { switched?: boolean }>;
  openInstallVoiceData(): Promise<void>;
}

const NativeTts = registerPlugin<NativeTtsPluginInterface>('NativeTts');

export function isNativeAndroidTts(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function getNativeAndroidTtsStatus(): Promise<NativeAndroidTtsStatus | null> {
  if (!isNativeAndroidTts()) return null;
  try {
    return await NativeTts.getStatus();
  } catch {
    return null;
  }
}

export async function setNativeAndroidTtsEngine(
  engine: string
): Promise<NativeAndroidTtsStatus | null> {
  if (!isNativeAndroidTts()) return null;
  try {
    return await NativeTts.setEngine({ engine });
  } catch {
    return null;
  }
}

export async function testNativeAndroidTts(
  text = 'こんにちは'
): Promise<{ spoken: boolean; engine?: string; voice?: string; reason?: string } | null> {
  if (!isNativeAndroidTts()) return null;
  try {
    return await NativeTts.speak({ text, lang: 'ja-JP', rate: 0.92, pitch: 1.0 });
  } catch (err) {
    return {
      spoken: false,
      reason: err instanceof Error ? err.message : 'Gagal memutar suara TTS.',
    };
  }
}

export async function openNativeAndroidTtsInstall(): Promise<void> {
  if (!isNativeAndroidTts()) return;
  try {
    await NativeTts.openInstallVoiceData();
  } catch {
    // Ignore if activity unavailable
  }
}

/**
 * Strip dictionary annotation markers (such as `^` kan'yō-on prefixes) so TTS
 * and reading comparisons always receive clean hiragana/katakana.
 */
export function sanitizeKanaReading(reading: string): string {
  return reading.replace(/[\^.\-・\s]/g, '').trim();
}

function normalizeKanaForMatch(text: string): string {
  return sanitizeKanaReading(text).replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

const PURE_KANA_RE = /^[\u3040-\u30ffー]+$/;
const HAS_KANJI_RE = /[\u4e00-\u9faf々ヶ〇]/;

export interface VerifiedItemPronunciation {
  /** Primary canonical kana reading displayed and tested in the session */
  testedReading: string;
  /** All sanitized kana readings accepted by the validator for the tested mode */
  acceptedReadings: string[];
  /** Exact verified kana string passed to Web Speech API */
  ttsText: string;
  /** Label describing which reading mode is active */
  readingTypeLabel: "Kosakata" | "On'yomi" | "Kun'yomi";
  /** True only when ttsText is pure kana and strictly matches acceptedReadings */
  isVerified: boolean;
  /** Diagnostic reason if verification flagged an anomaly */
  mismatchReason: string | null;
}

export interface TtsVerificationResult {
  matched: boolean;
  safeTtsText: string | null;
  testedReading: string | null;
  reason: string | null;
}

/**
 * Single source of truth for resolving and verifying a CurriculumItem's
 * pronunciation data (tested reading, accepted readings, and TTS kana mapping).
 */
export function resolveVerifiedItemPronunciation(
  item: CurriculumItem
): VerifiedItemPronunciation | null {
  if (item.type === 'radical') return null;

  let rawList: string[] = [];
  let readingTypeLabel: VerifiedItemPronunciation['readingTypeLabel'] = 'Kosakata';

  if (item.type === 'vocabulary') {
    rawList = item.readings ?? [];
    readingTypeLabel = 'Kosakata';
  } else {
    const isKun = item.primaryReadingType === 'kunyomi';
    const primaryList = isKun ? item.kunyomi ?? [] : item.onyomi ?? [];
    const fallbackList = isKun ? item.onyomi ?? [] : item.kunyomi ?? [];
    if (primaryList.length > 0) {
      rawList = primaryList;
      readingTypeLabel = isKun ? "Kun'yomi" : "On'yomi";
    } else {
      rawList = fallbackList;
      readingTypeLabel = isKun ? "On'yomi" : "Kun'yomi";
    }
  }

  const acceptedReadings = Array.from(
    new Set(rawList.map(sanitizeKanaReading).filter(Boolean))
  );

  if (acceptedReadings.length === 0) {
    return null;
  }

  const testedReading = acceptedReadings[0];
  const normalizedTested = normalizeKanaForMatch(testedReading);
  const normalizedAccepted = acceptedReadings.map(normalizeKanaForMatch);

  let mismatchReason: string | null = null;
  if (HAS_KANJI_RE.test(testedReading)) {
    mismatchReason = `Tested reading "${testedReading}" contains kanji characters.`;
  } else if (!PURE_KANA_RE.test(testedReading)) {
    mismatchReason = `Tested reading "${testedReading}" contains non-kana characters.`;
  } else if (!normalizedAccepted.includes(normalizedTested)) {
    mismatchReason = `Tested reading "${testedReading}" is not present in accepted readings.`;
  }

  return {
    testedReading,
    acceptedReadings,
    ttsText: testedReading,
    readingTypeLabel,
    isVerified: mismatchReason === null,
    mismatchReason,
  };
}

/**
 * Verification step that confirms a candidate TTS string matches the specific
 * reading being tested for `item` (and contains no ambiguous kanji). If a
 * mismatch is detected, it automatically resolves to the verified kana reading.
 */
export function verifyTtsReadingMatch(
  candidateTtsText: string | null | undefined,
  item: CurriculumItem
): TtsVerificationResult {
  const verified = resolveVerifiedItemPronunciation(item);
  if (!verified) {
    return {
      matched: false,
      safeTtsText: null,
      testedReading: null,
      reason: `No speakable pronunciation available for ${item.type} "${item.characters}".`,
    };
  }

  const cleanedCandidate = candidateTtsText
    ? sanitizeKanaReading(candidateTtsText)
    : '';
  const normCandidate = normalizeKanaForMatch(cleanedCandidate);
  const normAccepted = verified.acceptedReadings.map(normalizeKanaForMatch);

  const hasKanji = HAS_KANJI_RE.test(cleanedCandidate);
  const isPureKana = PURE_KANA_RE.test(cleanedCandidate);
  const inAccepted = normAccepted.includes(normCandidate);

  if (cleanedCandidate && !hasKanji && isPureKana && inAccepted) {
    return {
      matched: true,
      safeTtsText: cleanedCandidate,
      testedReading: verified.testedReading,
      reason: null,
    };
  }

  const reason = !cleanedCandidate
    ? `Empty TTS text for "${item.characters}"; fell back to "${verified.ttsText}".`
    : hasKanji
    ? `Blocked ambiguous kanji TTS "${cleanedCandidate}" for "${item.characters}"; remapped to "${verified.ttsText}".`
    : `TTS "${cleanedCandidate}" does not match tested reading "${verified.testedReading}" (${verified.readingTypeLabel}); remapped to "${verified.ttsText}".`;

  return {
    matched: false,
    safeTtsText: verified.ttsText,
    testedReading: verified.testedReading,
    reason,
  };
}

/**
 * Return the unambiguous Japanese kana text to pronounce via Web Speech API for
 * a CurriculumItem. Always prefers the verified canonical kana reading (never bare kanji).
 */
export function getItemSpeechText(item: CurriculumItem): string | null {
  return resolveVerifiedItemPronunciation(item)?.ttsText ?? null;
}

/**
 * Verify that the TTS payload matches the exact tested reading for `item`,
 * auto-remediating any mismatch, and speak the verified Japanese kana.
 */
export function speakVerifiedItem(
  item: CurriculumItem,
  rate = 0.92,
  role: SpeakerRole = 'narrator',
  onEnd?: () => void,
  candidateOverride?: string | null
): TtsVerificationResult {
  const verification = verifyTtsReadingMatch(
    candidateOverride ?? getItemSpeechText(item),
    item
  );
  if (!verification.matched && verification.reason && import.meta.env.DEV) {
    console.warn(`[KaniMichi TTS Verification] ${verification.reason}`);
  }
  if (verification.safeTtsText) {
    speakJapanese(verification.safeTtsText, rate, role, onEnd);
  } else {
    onEnd?.();
  }
  return verification;
}

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
let activeUtterance: SpeechSynthesisUtterance | null = null;
let speechStartTimer: number | null = null;
let speechPollTimer: number | null = null;
let speechWatchdogTimer: number | null = null;

function clearSpeechMonitors(): void {
  if (speechStartTimer !== null) {
    window.clearTimeout(speechStartTimer);
    speechStartTimer = null;
  }
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
  activeUtterance = null;
  clearSpeechMonitors();
  setExternalAudioPlaying('tts', false);
  if (isNativeAndroidTts()) {
    void NativeTts.stop().catch(() => {
      // Ignore native stop errors
    });
    return;
  }
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Ignore errors in restricted environments
  }
}

/**
 * Speak a single Japanese utterance using native Android TextToSpeech (offline-first)
 * inside the APK, or Web Speech API (ja-JP) on web browsers.
 * Tracks live playback state reliably so auto-advance always waits until audio finishes.
 */
export function speakJapanese(
  text: string,
  rate = 0.92,
  role: SpeakerRole = 'narrator',
  onEnd?: () => void
): void {
  const clean = stripFuriganaMarkup(text).trim();
  if (!clean) {
    onEnd?.();
    return;
  }

  if (isNativeAndroidTts()) {
    speechToken += 1;
    const myToken = speechToken;
    clearSpeechMonitors();
    setExternalAudioPlaying('tts', true);

    const safeRate = Math.max(0.5, Math.min(2, rate));
    const { pitch } = getVoiceAndPitch(role, []);
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

    const estimatedMs = Math.max(1200, Math.round((clean.length * 220) / safeRate) + 1000);
    speechWatchdogTimer = window.setTimeout(
      finish,
      Math.min(35000, Math.max(7000, estimatedMs * 2))
    );

    NativeTts.speak({ text: clean, lang: 'ja-JP', rate: safeRate, pitch })
      .then(() => finish())
      .catch(() => finish());
    return;
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
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
      activeUtterance = null;
      clearSpeechMonitors();
      setExternalAudioPlaying('tts', false);
    }
    onEnd?.();
  };

  try {
    const synth = window.speechSynthesis;
    const wasSpeaking = synth.speaking || synth.pending;
    synth.cancel();
    // Mark audio playing synchronously so quiz auto-advance timers pause immediately
    setExternalAudioPlaying('tts', true);

    const safeRate = Math.max(0.5, Math.min(2, rate));
    const estimatedMs = Math.max(
      900,
      Math.round((clean.length * 195) / safeRate) + 450
    );

    const startSpeaking = () => {
      if (myToken !== speechToken) return;
      try {
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.lang = 'ja-JP';
        utterance.rate = safeRate;

        const jaVoices = pickJapaneseVoices();
        const { voice, pitch } = getVoiceAndPitch(role, jaVoices);
        utterance.pitch = pitch;
        if (voice) {
          utterance.voice = voice;
        }

        // Keep strong module reference to prevent Chromium/Android GC from dropping onend
        activeUtterance = utterance;

        let hasStarted = false;
        let quietTicks = 0;
        const startedAt = Date.now();

        utterance.onstart = () => {
          if (myToken !== speechToken) return;
          hasStarted = true;
          quietTicks = 0;
        };
        utterance.onend = () => {
          if (myToken !== speechToken) return;
          finish();
        };
        utterance.onerror = (ev) => {
          if (myToken !== speechToken) return;
          // Ignore stale cancellation errors if another utterance replaced us
          if (ev.error === 'interrupted' || ev.error === 'canceled') {
            finish();
            return;
          }
          finish();
        };

        // Mobile-safe fallback monitor in case browser silently drops utterance.onend
        speechPollTimer = window.setInterval(() => {
          if (myToken !== speechToken) {
            clearSpeechMonitors();
            return;
          }
          const elapsed = Date.now() - startedAt;
          const isQuiet = !synth.speaking && !synth.pending;

          if (isQuiet) {
            quietTicks += 1;
          } else {
            quietTicks = 0;
            hasStarted = true;
          }

          if (hasStarted && quietTicks >= 3 && elapsed >= Math.min(1000, estimatedMs * 0.45)) {
            finish();
          } else if (!hasStarted && quietTicks >= 3 && elapsed >= Math.max(2600, estimatedMs)) {
            finish();
          }
        }, 250);

        const maxDurationMs = Math.min(
          35000,
          Math.max(6000, Math.round(estimatedMs * 2.2) + 3000)
        );
        speechWatchdogTimer = window.setTimeout(finish, maxDurationMs);

        synth.speak(utterance);
      } catch {
        finish();
      }
    };

    // On Chromium/Android, brief pause after cancel() avoids dropping the next utterance
    if (wasSpeaking) {
      speechStartTimer = window.setTimeout(() => {
        speechStartTimer = null;
        startSpeaking();
      }, 60);
    } else {
      startSpeaking();
    }
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
  if (cues.length === 0) {
    options.onComplete?.();
    return () => {};
  }

  if (isNativeAndroidTts()) {
    let cancelled = false;
    let timerId: number | null = null;
    const rate = Math.max(0.5, Math.min(2, options.rate ?? 0.94));

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

    const speakAtNative = (idx: number) => {
      if (cancelled) return;
      if (idx >= cues.length) {
        setExternalAudioPlaying('dialogue', false);
        options.onComplete?.();
        return;
      }

      const cue = cues[idx];
      options.onCueStart?.(cue.id, idx);
      const clean = stripFuriganaMarkup(cue.text).trim();
      const { pitch } = getVoiceAndPitch(cue.role, []);

      const nextStep = () => {
        if (cancelled) return;
        const pause = cue.pauseAfterMs ?? 380;
        timerId = window.setTimeout(() => {
          timerId = null;
          speakAtNative(idx + 1);
        }, pause);
      };

      if (!clean) {
        nextStep();
        return;
      }

      NativeTts.speak({ text: clean, lang: 'ja-JP', rate, pitch })
        .then(() => nextStep())
        .catch(() => nextStep());
    };

    speakAtNative(0);
    return cancel;
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
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
      activeUtterance = null;
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

      activeUtterance = utterance;

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
        activeUtterance = null;
        setExternalAudioPlaying('dialogue', false);
        options.onError?.();
      }
    }
  };

  speakAt(0);
  return cancel;
}

export function isSpeechSupported(): boolean {
  return (
    isNativeAndroidTts() ||
    (typeof window !== 'undefined' && 'speechSynthesis' in window)
  );
}
