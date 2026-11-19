import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Mic, Music, Volume2 } from 'lucide-react';
import type { PronunciationTargetWord } from '../types/pronunciation';
import { speakJapanese, stopSpeech } from '../utils/audio';
import {
  getPitchLevels,
  PITCH_PATTERN_META,
  playPitchMelody,
} from '../utils/pitchAudio';
import { resolvePitchAccent } from '../utils/pitchResolver';
import { PitchDiagram } from './PitchDiagram';

export interface HomophoneRef {
  id: string;
  kanji: string;
  kana: string;
  meaning: string;
  accentNucleus: number;
  onSelect?: () => void;
}

interface PronunciationCardProps {
  target: PronunciationTargetWord;
  homophones?: HomophoneRef[];
  compact?: boolean;
  onPracticeSpeak?: (target: PronunciationTargetWord) => void;
  className?: string;
}

export const PronunciationCard: React.FC<PronunciationCardProps> = ({
  target,
  homophones = [],
  compact = false,
  onPracticeSpeak,
  className = '',
}) => {
  const resolved = useMemo(
    () =>
      resolvePitchAccent(
        target.kanji,
        target.kana,
        target.partOfSpeech,
        target.accentNucleus,
        target.particle
      ),
    [
      target.kanji,
      target.kana,
      target.partOfSpeech,
      target.accentNucleus,
      target.particle,
    ]
  );

  const meta = PITCH_PATTERN_META[resolved.pattern];
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [showTips, setShowTips] = useState(!compact);
  const cancelToneRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setShowTips(!compact);
  }, [compact, target.id]);

  useEffect(() => {
    return () => {
      if (cancelToneRef.current) {
        cancelToneRef.current();
        cancelToneRef.current = null;
      }
    };
  }, [target.id]);

  const stopTone = () => {
    if (cancelToneRef.current) {
      cancelToneRef.current();
      cancelToneRef.current = null;
    }
    stopSpeech();
    setActiveStep(null);
  };

  const handlePlayVoice = (rate = 0.94) => {
    stopTone();
    // Using Kanji + natural particle helps browser ja-JP TTS follow standard Tokyo pitch
    const phrase =
      resolved.particle && target.kanji
        ? `${target.kanji}${resolved.particle}`
        : target.kanji || target.kana;
    speakJapanese(phrase, rate);
  };

  const handlePlayMelody = () => {
    stopTone();
    const { wordLevels, particleLevel } = getPitchLevels(
      resolved.moras.length,
      resolved.accentNucleus
    );
    const levels = resolved.particle
      ? [...wordLevels, particleLevel]
      : wordLevels;
    const cancel = playPitchMelody(levels, {
      stepMs: 240,
      onStep: (idx) => setActiveStep(idx),
      onComplete: () => {
        setActiveStep(null);
        cancelToneRef.current = null;
      },
    });
    cancelToneRef.current = cancel;
  };

  return (
    <div
      className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 ${
        compact ? 'p-3.5 space-y-3' : 'p-4 sm:p-5 space-y-4'
      } ${className}`}
    >
      {/* Header: Pitch Pattern + Mora / Romaji + Source Transparency */}
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-xs font-bold tracking-tight"
              style={{ color: meta.color }}
            >
              {meta.name} [{resolved.accentNucleus}]
            </span>
            <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
              ·
            </span>
            <span className="font-mono-num text-xs text-slate-600 dark:text-slate-400">
              {resolved.romaji}
            </span>
            <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
              ·
            </span>
            <span className="font-mono-num text-xs text-slate-500 dark:text-slate-400">
              {resolved.moras.length} mora
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {resolved.source === 'verified'
              ? 'Aksen Tokyo terverifikasi (NHK/Standar)'
              : 'Pola standar Tokyo (estimasi aturan fonologi)'}
          </div>
        </div>

        {/* Audio & Speaking Studio Controls */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => handlePlayVoice(0.94)}
            className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
          >
            <Volume2 className="w-3.5 h-3.5" />
            Dengar
          </button>
          <button
            type="button"
            onClick={() => handlePlayVoice(0.64)}
            className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-slate-700 dark:text-slate-200 hover:border-[#0284C7] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            Pelan
          </button>
          <button
            type="button"
            onClick={handlePlayMelody}
            className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-slate-700 dark:text-slate-200 hover:border-[#0284C7] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <Music className="w-3.5 h-3.5 text-[#0284C7]" />
            Nada Pitch
          </button>
          {onPracticeSpeak && (
            <button
              type="button"
              onClick={() => {
                stopTone();
                onPracticeSpeak(target);
              }}
              className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Mic className="w-3.5 h-3.5" />
              Latih Ucap
            </button>
          )}
        </div>
      </div>

      {/* Interactive SVG Pitch Contour Diagram */}
      <div className="rounded-lg bg-white dark:bg-[#161A22] border border-slate-200/80 dark:border-slate-800 px-3 py-2">
        <PitchDiagram
          kana={target.kana}
          accentNucleus={resolved.accentNucleus}
          particle={resolved.particle}
          activeStep={activeStep}
          compact={compact}
        />
      </div>

      {/* Homophones in Database (same reading, different kanji/meaning/pitch) */}
      {homophones.length > 0 && (
        <div className="rounded-lg border border-amber-200/80 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/25 px-3 py-2.5 space-y-1.5">
          <div className="text-[11px] font-semibold text-amber-900 dark:text-amber-300">
            Hati-hati Homofon ({target.kana}) di Database:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {homophones.slice(0, 5).map((h) => (
              <button
                key={h.id}
                type="button"
                disabled={!h.onSelect}
                onClick={h.onSelect}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-amber-200 dark:border-amber-800/80 bg-white/90 dark:bg-[#161A22] text-xs text-slate-800 dark:text-slate-200 hover:border-[#0284C7] transition-colors cursor-pointer disabled:cursor-default"
              >
                <span className="font-jp font-bold">{h.kanji}</span>
                <span className="font-mono-num text-[11px] text-amber-700 dark:text-amber-400">
                  [{h.accentNucleus}]
                </span>
                <span className="text-slate-500 dark:text-slate-400 truncate max-w-[110px]">
                  {h.meaning}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Automatic Phonetic & Articulation Tips */}
      {resolved.tips.length > 0 && (
        <div>
          {compact ? (
            <button
              type="button"
              onClick={() => setShowTips((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              {showTips ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              Tips Pelafalan &amp; Ritme ({resolved.tips.length})
            </button>
          ) : (
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
              Panduan Pengucapan Kata Ini
            </div>
          )}

          {showTips && (
            <div className={`grid grid-cols-1 ${compact ? 'gap-2 mt-2' : 'sm:grid-cols-2 gap-2.5'}`}>
              {resolved.tips.map((tip) => (
                <div
                  key={tip.id}
                  className="p-2.5 rounded-lg bg-white dark:bg-[#161A22] border border-slate-200/80 dark:border-slate-800 space-y-0.5"
                >
                  <div className="text-[11px] font-bold text-[#0284C7] dark:text-sky-400">
                    {tip.tag} · {tip.title}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {tip.detail}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
