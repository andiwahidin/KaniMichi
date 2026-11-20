import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Mic,
  MicOff,
  Music,
  Square,
  Volume2,
  XCircle,
} from 'lucide-react';
import { sanitizeKanaReading, speakJapanese, stopSpeech } from '../utils/audio';
import { katakanaToHiragana, romajiToHiragana } from '../utils/kana';
import {
  classifyPitchPattern,
  detectPitchAutocorrelation,
  getPitchLevels,
  PITCH_PATTERN_META,
  playPitchMelody,
} from '../utils/pitchAudio';
import { resolvePitchAccent } from '../utils/pitchResolver';
import { PitchDiagram } from './PitchDiagram';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function normalizeSpokenJp(text: string): string {
  const cleaned = text
    .trim()
    .replace(/[\s　、。,.!?！？「」『』・]/g, '');
  return katakanaToHiragana(romajiToHiragana(cleaned, true));
}

function deterministicShuffle(nums: number[], seedStr: string): number[] {
  const arr = [...nums];
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface VocabPronunciationQuizPanelProps {
  questionKey: string;
  kanji: string;
  kana: string;
  acceptedReadings?: string[];
  partOfSpeech?: string;
  answered: boolean;
  onAnswer: (isCorrect: boolean, detailMessage: string) => void;
}

export const VocabPronunciationQuizPanel: React.FC<
  VocabPronunciationQuizPanelProps
> = ({
  questionKey,
  kanji,
  kana,
  acceptedReadings,
  partOfSpeech,
  answered,
  onAnswer,
}) => {
  const resolved = useMemo(
    () => resolvePitchAccent(kanji, kana, partOfSpeech),
    [kanji, kana, partOfSpeech]
  );

  // Build 2–4 distinct, valid pitch accent candidates for this word's exact mora count
  const pitchOptions = useMemo(() => {
    const n = Math.max(1, resolved.moras.length);
    const allPossible: number[] = [];
    for (let k = 0; k <= n; k++) {
      // If there's no trailing particle, Odaka (k === n) looks identical to Heiban (0) for 2+ moras
      if (!resolved.particle && k === n && n >= 2) continue;
      allPossible.push(k);
    }

    const picked = new Set<number>([resolved.accentNucleus]);
    // Prefer standard contrast anchors: 0 (Heiban), 1 (Atamadaka), n (Odaka), and mid (2 or n-1)
    const priority = [0, 1, Math.min(2, n), Math.max(1, n - 1), n];
    for (const p of priority) {
      if (picked.size >= 4) break;
      if (allPossible.includes(p)) picked.add(p);
    }
    for (const p of allPossible) {
      if (picked.size >= 4) break;
      picked.add(p);
    }

    return deterministicShuffle(Array.from(picked), `${questionKey}-${kanji}`);
  }, [resolved.moras.length, resolved.accentNucleus, resolved.particle, questionKey, kanji]);

  const [selectedNucleus, setSelectedNucleus] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [recognizedText, setRecognizedText] = useState<string | null>(null);
  const [pitchSamples, setPitchSamples] = useState<number[]>([]);
  const [activeToneStep, setActiveToneStep] = useState<number | null>(null);
  const [sttSupported] = useState<boolean>(() => Boolean(getSpeechRecognitionCtor()));

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const cancelToneRef = useRef<(() => void) | null>(null);
  const answeredRef = useRef(answered);
  answeredRef.current = answered;

  const stopMicAndAudio = () => {
    setIsRecording(false);
    if (cancelToneRef.current) {
      cancelToneRef.current();
      cancelToneRef.current = null;
    }
    stopSpeech();
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setActiveToneStep(null);
  };

  // Reset state whenever question changes & clean up on unmount
  useEffect(() => {
    stopMicAndAudio();
    setSelectedNucleus(null);
    setMicError(null);
    setRecognizedText(null);
    setPitchSamples([]);
    return () => {
      stopMicAndAudio();
    };
  }, [questionKey]);

  const playReferenceVoice = (rate = 0.92) => {
    if (cancelToneRef.current) {
      cancelToneRef.current();
      cancelToneRef.current = null;
    }
    // Verify TTS base text is sanitized pure kana matching the tested reading
    const sanitizedKana = sanitizeKanaReading(kana);
    const normalizedAccepted = (acceptedReadings ?? []).map((r) =>
      katakanaToHiragana(sanitizeKanaReading(r))
    );
    const verifiedBase =
      sanitizedKana &&
      (normalizedAccepted.length === 0 ||
        normalizedAccepted.includes(katakanaToHiragana(sanitizedKana)))
        ? sanitizedKana
        : sanitizeKanaReading(acceptedReadings?.[0] ?? '') || sanitizedKana || kanji;
    const phrase = resolved.particle
      ? `${verifiedBase}${resolved.particle}`
      : verifiedBase;
    speakJapanese(phrase, rate);
  };

  const playReferenceMelody = () => {
    if (cancelToneRef.current) {
      cancelToneRef.current();
      cancelToneRef.current = null;
    }
    stopSpeech();
    const { wordLevels, particleLevel } = getPitchLevels(
      resolved.moras.length,
      resolved.accentNucleus
    );
    const levels = resolved.particle
      ? [...wordLevels, particleLevel]
      : wordLevels;
    cancelToneRef.current = playPitchMelody(levels, {
      stepMs: 230,
      onStep: (idx) => setActiveToneStep(idx),
      onComplete: () => {
        setActiveToneStep(null);
        cancelToneRef.current = null;
      },
    });
  };

  const evaluateTranscript = (transcript: string) => {
    if (answeredRef.current) return;
    const normSpoken = normalizeSpokenJp(transcript);
    const allTargets = [
      kana,
      kanji,
      ...(acceptedReadings ?? []),
      resolved.particle ? `${kana}${resolved.particle}` : '',
      resolved.particle ? `${kanji}${resolved.particle}` : '',
    ]
      .filter(Boolean)
      .map(normalizeSpokenJp);

    const matched = allTargets.some(
      (t) =>
        normSpoken === t ||
        (t.length >= 2 && normSpoken.includes(t)) ||
        transcript.includes(kanji)
    );

    const meta = PITCH_PATTERN_META[resolved.pattern];
    if (matched) {
      onAnswer(
        true,
        `Pelafalan tepat! Terdeteksi "${transcript}" · ${meta.name} [${resolved.accentNucleus}]`
      );
    } else {
      onAnswer(
        false,
        `Terdeteksi "${transcript}". Target bacaan: ${kana} (${resolved.romaji}) · ${meta.name} [${resolved.accentNucleus}]`
      );
    }
  };

  const startMicCheck = async () => {
    if (answered) return;
    stopMicAndAudio();
    setMicError(null);
    setRecognizedText(null);
    setPitchSamples([]);

    const RecCtor = getSpeechRecognitionCtor();
    if (!RecCtor) {
      setMicError(
        'Pengenalan suara (SpeechRecognition) tidak tersedia di browser ini. Silakan jawab menggunakan pilihan pola Pitch Accent di bawah.'
      );
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setMicError(
        'Akses mikrofon tidak tersedia. Gunakan pilihan pola Pitch Accent di bawah untuk menjawab.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      setIsRecording(true);

      // Real-time F0 pitch curve preview
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        const buf = new Float32Array(analyser.fftSize);
        const samples: number[] = [];
        let lastPush = 0;

        const tick = (ts: number) => {
          if (!mediaStreamRef.current) return;
          analyser.getFloatTimeDomainData(buf);
          if (ts - lastPush >= 50) {
            lastPush = ts;
            const f0 = detectPitchAutocorrelation(buf, ctx.sampleRate);
            if (f0 !== null) {
              samples.push(Math.round(f0));
              if (samples.length > 48) samples.shift();
              setPitchSamples([...samples]);
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }

      const rec = new RecCtor();
      rec.lang = 'ja-JP';
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 3;
      let latestTranscript = '';

      rec.onresult = (ev) => {
        let combined = '';
        for (let i = 0; i < ev.results.length; i++) {
          combined += ev.results[i][0]?.transcript ?? '';
        }
        if (combined.trim()) {
          latestTranscript = combined.trim();
          setRecognizedText(latestTranscript);
        }
      };

      rec.onerror = () => {
        setMicError(
          'Suara kurang terdengar jelas. Coba ucapkan lagi atau pilih pola Pitch Accent di bawah.'
        );
      };

      rec.onend = () => {
        setIsRecording(false);
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        if (latestTranscript.trim() && !answeredRef.current) {
          evaluateTranscript(latestTranscript.trim());
        }
      };

      rec.start();
      recognitionRef.current = rec;

      // Auto-stop after 4s
      window.setTimeout(() => {
        if (recognitionRef.current === rec) {
          try {
            rec.stop();
          } catch {
            // Ignore
          }
        }
      }, 4000);
    } catch {
      setMicError(
        'Izin mikrofon ditolak. Kamu tetap bisa menjawab dengan memilih pola Pitch Accent di bawah.'
      );
      setIsRecording(false);
    }
  };

  const handleStopMic = () => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        stopMicAndAudio();
      }
    } else {
      stopMicAndAudio();
    }
  };

  const handlePickPitchOption = (nucleus: number) => {
    if (answered) return;
    stopMicAndAudio();
    setSelectedNucleus(nucleus);
    const isCorrect = nucleus === resolved.accentNucleus;
    const trueMeta = PITCH_PATTERN_META[resolved.pattern];
    playReferenceVoice(0.92);
    if (isCorrect) {
      onAnswer(
        true,
        `Tepat! Pola pitch ${kanji} (${kana}) adalah ${trueMeta.name} [${resolved.accentNucleus}].`
      );
    } else {
      onAnswer(
        false,
        `Belum tepat. Pola pitch ${kanji} (${kana}) yang benar adalah ${trueMeta.name} [${resolved.accentNucleus}].`
      );
    }
  };

  const livePitchPolyline = useMemo(() => {
    if (pitchSamples.length < 2) return null;
    const minHz = Math.min(...pitchSamples);
    const maxHz = Math.max(...pitchSamples);
    const span = Math.max(25, maxHz - minHz);
    return pitchSamples
      .map((hz, i) => {
        const x = 8 + (i / (pitchSamples.length - 1)) * 224;
        const y = 36 - ((hz - minHz) / span) * 28;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [pitchSamples]);

  return (
    <div className="space-y-4">
      {/* Path 1: Microphone Speaking Check */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold text-[#0F766E] dark:text-teal-400">
              Cara 1 · Ucapkan Lewat Mikrofon (ja-JP)
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Dengarkan referensi lalu ucapkan{' '}
              <strong className="font-jp text-slate-800 dark:text-slate-200">
                {kana}
                {resolved.particle ? `(${resolved.particle})` : ''}
              </strong>{' '}
              ({resolved.romaji}) dengan jelas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => playReferenceVoice(0.92)}
              className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#0284C7] cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5" />
              Dengar
            </button>
            <button
              type="button"
              onClick={() => playReferenceVoice(0.65)}
              className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#0284C7] cursor-pointer"
            >
              Pelan
            </button>
            <button
              type="button"
              onClick={playReferenceMelody}
              className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#0284C7] cursor-pointer"
            >
              <Music className="w-3.5 h-3.5 text-[#0284C7]" />
              Nada
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {!isRecording ? (
            <button
              type="button"
              disabled={answered || !sttSupported}
              onClick={startMicCheck}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F766E] hover:bg-[#115E59] disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
            >
              <Mic className="w-4 h-4" />
              Ucapkan Sekarang
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStopMic}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition-colors cursor-pointer shrink-0"
            >
              <Square className="w-4 h-4 fill-current" />
              Berhenti (Mendengarkan...)
            </button>
          )}

          {livePitchPolyline ? (
            <div className="flex-1 flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <svg
                viewBox="0 0 240 44"
                className="w-full max-w-[220px] h-9 block"
                aria-hidden="true"
              >
                <polyline
                  fill="none"
                  stroke="#0F766E"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={livePitchPolyline}
                />
              </svg>
              {recognizedText && (
                <span className="font-jp text-sm font-bold text-slate-800 dark:text-white truncate">
                  {recognizedText}
                </span>
              )}
            </div>
          ) : recognizedText ? (
            <div className="text-xs text-slate-600 dark:text-slate-300">
              Terdeteksi:{' '}
              <strong className="font-jp text-sm text-slate-900 dark:text-white">
                {recognizedText}
              </strong>
            </div>
          ) : (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {sttSupported
                ? 'Atau sedang di tempat sepi? Jawab lewat pilihan pola Pitch Accent di bawah.'
                : 'Mikrofon STT tidak tersedia di browser ini — gunakan pilihan pola Pitch di bawah.'}
            </span>
          )}
        </div>

        {micError && (
          <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <MicOff className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{micError}</span>
          </div>
        )}
      </div>

      {/* Path 2: Pitch Accent Pattern Identification (Works Everywhere Without Mic) */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold text-[#0284C7]">
              Cara 2 · Pilih Pola Pitch Accent yang Benar
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Dengarkan tombol <strong>Dengar</strong> atau <strong>Nada</strong> di atas, lalu pilih kurva pitch yang cocok untuk{' '}
              <span className="font-jp font-semibold text-slate-800 dark:text-slate-200">
                {kanji} ({kana})
              </span>
              .
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {pitchOptions.map((nucleus) => {
            const pat = classifyPitchPattern(resolved.moras.length, nucleus);
            const meta = PITCH_PATTERN_META[pat];
            const isCorrectOpt = nucleus === resolved.accentNucleus;
            const isPicked = selectedNucleus === nucleus;

            let cardStyle =
              'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 hover:border-[#0284C7]';
            if (answered) {
              if (isCorrectOpt) {
                cardStyle =
                  'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40';
              } else if (isPicked && !isCorrectOpt) {
                cardStyle =
                  'border-rose-500 bg-rose-50/80 dark:bg-rose-950/40';
              } else {
                cardStyle = 'border-slate-200 dark:border-slate-800 opacity-60';
              }
            }

            return (
              <button
                key={nucleus}
                type="button"
                disabled={answered}
                onClick={() => handlePickPitchOption(nucleus)}
                className={`p-3 rounded-xl border-2 text-left space-y-1.5 transition-colors cursor-pointer disabled:cursor-default ${cardStyle}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-xs font-bold"
                    style={{ color: meta.color }}
                  >
                    {meta.name} [{nucleus}]
                  </span>
                  {answered && isCorrectOpt && (
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  )}
                  {answered && isPicked && !isCorrectOpt && (
                    <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  )}
                </div>
                <PitchDiagram
                  kana={kana}
                  accentNucleus={nucleus}
                  particle={resolved.particle}
                  activeStep={
                    answered && isCorrectOpt ? activeToneStep : null
                  }
                  compact
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
