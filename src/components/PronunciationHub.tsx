import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  Ear,
  Mic,
  MicOff,
  Music,
  Play,
  RotateCcw,
  Search,
  Square,
  Volume2,
  X,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getLevelMeta } from '../data/curriculum';
import { useIsAudioPlaying } from '../hooks/useIsAudioPlaying';
import { loadKanaVocabDataset } from '../data/kanaVocab';
import {
  MINIMAL_PAIRS,
  PITCH_PATTERN_EXAMPLES,
  SOUND_RULE_GUIDES,
} from '../data/pronunciation';
import type { KanaVocabDataset } from '../types/kanaVocab';
import type {
  MinimalPair,
  PitchPatternType,
  PronunciationCategory,
  PronunciationTargetWord,
  PronunciationWord,
} from '../types/pronunciation';
import {
  setExternalAudioPlaying,
  speakJapanese,
  stopSpeech,
} from '../utils/audio';
import { katakanaToHiragana, romajiToHiragana } from '../utils/kana';
import {
  detectPitchAutocorrelation,
  getPitchLevels,
  PITCH_PATTERN_META,
  playPitchMelody,
  splitIntoMoras,
} from '../utils/pitchAudio';
import {
  resolvePitchAccent,
  toPronunciationWord,
} from '../utils/pitchResolver';
import { PitchDiagram } from './PitchDiagram';
import { PronunciationCard, type HomophoneRef } from './PronunciationCard';
import {
  translatePartOfSpeech,
  translateSync,
  useTranslationVersion,
} from '../utils/idTranslator';

type StudioTab = 'pairs' | 'database' | 'guide' | 'ear-quiz' | 'speaking';
type CategoryFilter = 'all' | PronunciationCategory;
type DbSourceFilter = 'all' | 'curriculum' | 'kana';
type DbPitchFilter = 'all' | PitchPatternType;

interface UniversalVocabEntry {
  id: string;
  source: 'curriculum' | 'kana';
  kanji: string;
  kana: string;
  romaji: string;
  meaning: string;
  partOfSpeech?: string;
  level?: number;
  jlpt?: number;
  sourceLabel: string;
  accentNucleus: number;
  pattern: PitchPatternType;
  particle: string;
  pitchSource: 'verified' | 'rule';
  exampleJp?: string;
  exampleReading?: string;
  exampleTranslation?: string;
  searchKey: string;
}

interface EarQuestion {
  pair: MinimalPair;
  targetIdx: 0 | 1;
  id: string;
}

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

function normalizeJapaneseSpeech(text: string): string {
  const cleaned = text
    .trim()
    .replace(/[\s　、。,.!?！？「」『』・]/g, '');
  return katakanaToHiragana(romajiToHiragana(cleaned, true));
}

function buildEarQuestion(
  pool: MinimalPair[],
  prevPairId?: string
): EarQuestion {
  const candidates =
    pool.length > 1 && prevPairId
      ? pool.filter((p) => p.id !== prevPairId)
      : pool;
  const picked =
    candidates[Math.floor(Math.random() * candidates.length)] ?? MINIMAL_PAIRS[0];
  const targetIdx: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
  return {
    pair: picked,
    targetIdx,
    id: `${picked.id}-${targetIdx}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  };
}

export const PronunciationHub: React.FC = () => {
  const {
    dataset,
    state,
    pronunciationTarget,
    clearPronunciationTarget,
    recordPronunciationAttempt,
  } = useApp();
  const autoAdvanceDelayMs = state.settings.autoAdvanceDelayMs ?? 1500;
  const isAudioPlaying = useIsAudioPlaying();
  const progress = state.pronunciationProgress;
  const translationVersion = useTranslationVersion();

  const [kanaVocabData, setKanaVocabData] = useState<KanaVocabDataset | null>(null);

  useEffect(() => {
    let active = true;
    loadKanaVocabDataset()
      .then((ds) => {
        if (active) setKanaVocabData(ds);
      })
      .catch(() => {
        // Curriculum database remains available even if secondary dataset fails
      });
    return () => {
      active = false;
    };
  }, []);

  // Build unified index of ALL vocabulary across Curriculum (6,584) + Kana JLPT (150)
  const allDbEntries = useMemo<UniversalVocabEntry[]>(() => {
    const entries: UniversalVocabEntry[] = [];

    for (const item of dataset.byType.vocabulary) {
      const primaryKana = item.readings?.[0];
      if (!primaryKana) continue;
      const resolved = resolvePitchAccent(
        item.characters,
        primaryKana,
        item.partOfSpeech
      );
      entries.push({
        id: item.id,
        source: 'curriculum',
        kanji: item.characters,
        kana: primaryKana,
        romaji: resolved.romaji,
        meaning: translateSync(item.primaryMeaning),
        partOfSpeech: translatePartOfSpeech(item.partOfSpeech),
        level: item.level,
        sourceLabel: `${getLevelMeta(item.level).jlpt} Bab ${getLevelMeta(item.level).unitInTier}`,
        accentNucleus: resolved.accentNucleus,
        pattern: resolved.pattern,
        particle: resolved.particle,
        pitchSource: resolved.source,
        exampleJp: item.contextSentences?.[0]?.jp,
        exampleReading: item.contextSentences?.[0]?.reading,
        exampleTranslation: item.contextSentences?.[0]?.en
          ? translateSync(item.contextSentences[0].en)
          : undefined,
        searchKey: `${item.characters} ${primaryKana} ${resolved.romaji} ${item.primaryMeaning} ${translateSync(item.primaryMeaning)} ${item.acceptedMeanings.join(' ')}`.toLowerCase(),
      });
    }

    if (kanaVocabData) {
      for (const kv of kanaVocabData.items) {
        const resolved = resolvePitchAccent(kv.word, kv.reading, kv.partOfSpeech);
        const translatedMeaning = translateSync(kv.primaryMeaning);
        entries.push({
          id: kv.id,
          source: 'kana',
          kanji: kv.word,
          kana: kv.reading,
          romaji: resolved.romaji,
          meaning: translatedMeaning,
          partOfSpeech: translatePartOfSpeech(kv.partOfSpeech),
          jlpt: kv.jlpt,
          sourceLabel: `Kana JLPT N${kv.jlpt}`,
          accentNucleus: resolved.accentNucleus,
          pattern: resolved.pattern,
          particle: resolved.particle,
          pitchSource: resolved.source,
          exampleJp: kv.example.jp,
          exampleReading: kv.example.reading,
          exampleTranslation: translateSync(kv.example.en),
          searchKey: `${kv.word} ${kv.reading} ${resolved.romaji} ${kv.primaryMeaning} ${translatedMeaning} ${kv.acceptedMeanings.join(' ')}`.toLowerCase(),
        });
      }
    }

    return entries;
  }, [dataset.byType.vocabulary, kanaVocabData, translationVersion]);

  // Index homophones by Hiragana reading across ALL 6,734 words
  const homophonesByKana = useMemo(() => {
    const map = new Map<string, UniversalVocabEntry[]>();
    for (const e of allDbEntries) {
      const hira = katakanaToHiragana(e.kana);
      const list = map.get(hira);
      if (list) {
        list.push(e);
      } else {
        map.set(hira, [e]);
      }
    }
    return map;
  }, [allDbEntries]);

  // Set of studied vocab IDs from both Curriculum SRS and Kana JLPT SRS
  const studiedVocabIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, prog] of Object.entries(state.progress)) {
      if (prog && prog.srsStage !== null && prog.srsStage >= 1) {
        set.add(id);
      }
    }
    if (state.kanaVocabProgress) {
      for (const [id, prog] of Object.entries(state.kanaVocabProgress)) {
        if (prog && prog.srsStage >= 1) {
          set.add(id);
        }
      }
    }
    return set;
  }, [state.progress, state.kanaVocabProgress]);

  // Dynamically generate Ear Training minimal pairs from ALL database homophones with distinct pitch
  const dbHomophonePairs = useMemo<MinimalPair[]>(() => {
    const pairs: MinimalPair[] = [];
    for (const [kanaKey, list] of homophonesByKana.entries()) {
      if (list.length < 2) continue;
      // Pick first two entries with different kanji AND different pitch nucleus
      let chosenA: UniversalVocabEntry | null = null;
      let chosenB: UniversalVocabEntry | null = null;
      for (let i = 0; i < list.length && !chosenB; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (
            list[i].kanji !== list[j].kanji &&
            list[i].accentNucleus !== list[j].accentNucleus
          ) {
            chosenA = list[i];
            chosenB = list[j];
            break;
          }
        }
      }
      if (!chosenA || !chosenB) continue;

      const wordA = toPronunciationWord({
        id: chosenA.id,
        kanji: chosenA.kanji,
        kana: chosenA.kana,
        meaning: chosenA.meaning,
        partOfSpeech: chosenA.partOfSpeech,
        sourceLabel: chosenA.sourceLabel,
        accentNucleus: chosenA.accentNucleus,
        particle: chosenA.particle,
        exampleJp: chosenA.exampleJp,
        exampleReading: chosenA.exampleReading,
        exampleTranslation: chosenA.exampleTranslation,
      });
      const wordB = toPronunciationWord({
        id: chosenB.id,
        kanji: chosenB.kanji,
        kana: chosenB.kana,
        meaning: chosenB.meaning,
        partOfSpeech: chosenB.partOfSpeech,
        sourceLabel: chosenB.sourceLabel,
        accentNucleus: chosenB.accentNucleus,
        particle: chosenB.particle,
        exampleJp: chosenB.exampleJp,
        exampleReading: chosenB.exampleReading,
        exampleTranslation: chosenB.exampleTranslation,
      });

      pairs.push({
        id: `db-hom-${kanaKey}-${chosenA.id}-${chosenB.id}`,
        category: 'pitch',
        title: `${chosenA.kanji} vs ${chosenB.kanji}`,
        subtitle: `${kanaKey} · ${chosenA.sourceLabel} & ${chosenB.sourceLabel}`,
        jlpt: 4,
        focusNote: `Keduanya dibaca "${kanaKey}", tetapi pola nadanya berbeda: ${chosenA.kanji} memakai ${PITCH_PATTERN_META[wordA.pattern].name} [${wordA.accentNucleus}] sedangkan ${chosenB.kanji} memakai ${PITCH_PATTERN_META[wordB.pattern].name} [${wordB.accentNucleus}].`,
        mouthTip: 'Dengarkan letak turunnya nada (↘) saat kata diikuti partikel.',
        words: [wordA, wordB],
      });
    }
    return pairs;
  }, [homophonesByKana]);

  const [activeTab, setActiveTab] = useState<StudioTab>('pairs');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [selectedPairId, setSelectedPairId] = useState<string>(MINIMAL_PAIRS[0].id);

  // All-Database Pronunciation Explorer state
  const [dbSearch, setDbSearch] = useState('');
  const [dbSourceFilter, setDbSourceFilter] = useState<DbSourceFilter>('all');
  const [dbPitchFilter, setDbPitchFilter] = useState<DbPitchFilter>('all');
  const [dbStudiedOnly, setDbStudiedOnly] = useState(false);
  const [dbLevelFilter, setDbLevelFilter] = useState<number>(0); // 0 = all
  const [dbPage, setDbPage] = useState(1);
  const [selectedDbId, setSelectedDbId] = useState<string | null>(null);

  // Playback / live mora step highlighter
  const [activePitchId, setActivePitchId] = useState<string | null>(null);
  const [activePitchStep, setActivePitchStep] = useState<number | null>(null);
  const [comparingWordId, setComparingWordId] = useState<string | null>(null);
  const cancelAudioRef = useRef<(() => void) | null>(null);

  // Ear Training Quiz state
  const [earSource, setEarSource] = useState<'curated' | 'database'>('curated');
  const [earCategory, setEarCategory] = useState<CategoryFilter>('all');
  const [earAudioMode, setEarAudioMode] = useState<'voice-and-tone' | 'voice-only'>(
    'voice-and-tone'
  );
  const [earQuestion, setEarQuestion] = useState<EarQuestion>(() =>
    buildEarQuestion(MINIMAL_PAIRS)
  );
  const [earSelection, setEarSelection] = useState<0 | 1 | null>(null);
  const [earPausedAuto, setEarPausedAuto] = useState(false);
  const [earStats, setEarStats] = useState({ correct: 0, total: 0, streak: 0 });
  const nextEarRef = useRef<() => void>(() => {});

  // Speaking Studio state (supports both Minimal Pairs AND any of the 6,734 DB words)
  const [speakingPairId, setSpeakingPairId] = useState<string>(MINIMAL_PAIRS[0].id);
  const [speakingWordIdx, setSpeakingWordIdx] = useState<0 | 1>(0);
  const [speakingPickerMode, setSpeakingPickerMode] = useState<'pairs' | 'database'>(
    'pairs'
  );
  const [speakingDbSearch, setSpeakingDbSearch] = useState('');
  const [speakingDbStudiedOnly, setSpeakingDbStudiedOnly] = useState(false);
  const [customSpeakingTarget, setCustomSpeakingTarget] =
    useState<PronunciationTargetWord | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [pitchSamples, setPitchSamples] = useState<number[]>([]);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recognizedText, setRecognizedText] = useState<string | null>(null);
  const [speechMatchStatus, setSpeechMatchStatus] = useState<
    'idle' | 'matched' | 'close' | 'mismatch' | 'no-stt'
  >('idle');
  const [sttSupported] = useState<boolean>(() => Boolean(getSpeechRecognitionCtor()));

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recordedUrlRef = useRef<string | null>(null);

  // Handle cross-app deep link ("Latih Ucap" from ItemDetailModal / Lesson / Review / KanaVocabHub)
  useEffect(() => {
    if (!pronunciationTarget) return;
    setCustomSpeakingTarget(pronunciationTarget);
    setSpeakingPickerMode('database');
    setActiveTab('speaking');
    setPitchSamples([]);
    setRecognizedText(null);
    setSpeechMatchStatus('idle');
    clearPronunciationTarget();
  }, [pronunciationTarget, clearPronunciationTarget]);

  const categoryCounts = useMemo(
    () => ({
      all: MINIMAL_PAIRS.length,
      pitch: MINIMAL_PAIRS.filter((p) => p.category === 'pitch').length,
      consonant: MINIMAL_PAIRS.filter((p) => p.category === 'consonant').length,
      'length-sokuon': MINIMAL_PAIRS.filter((p) => p.category === 'length-sokuon')
        .length,
    }),
    []
  );

  const filteredPairs = useMemo(
    () =>
      categoryFilter === 'all'
        ? MINIMAL_PAIRS
        : MINIMAL_PAIRS.filter((p) => p.category === categoryFilter),
    [categoryFilter]
  );

  const selectedPair = useMemo(
    () =>
      filteredPairs.find((p) => p.id === selectedPairId) ??
      filteredPairs[0] ??
      MINIMAL_PAIRS[0],
    [filteredPairs, selectedPairId]
  );

  // Filtered list for "Semua Kosakata (6.734)" tab
  const filteredDbEntries = useMemo(() => {
    const q = dbSearch.trim().toLowerCase();
    return allDbEntries.filter((e) => {
      if (dbSourceFilter !== 'all' && e.source !== dbSourceFilter) return false;
      if (dbPitchFilter !== 'all' && e.pattern !== dbPitchFilter) return false;
      if (dbStudiedOnly && !studiedVocabIds.has(e.id)) return false;
      if (dbLevelFilter > 0) {
        if (dbSourceFilter === 'kana') {
          if (e.jlpt !== dbLevelFilter) return false;
        } else if (e.source === 'curriculum' && e.level !== dbLevelFilter) {
          return false;
        } else if (e.source === 'kana') {
          return false;
        }
      }
      if (q && !e.searchKey.includes(q)) return false;
      return true;
    });
  }, [
    allDbEntries,
    dbSearch,
    dbSourceFilter,
    dbPitchFilter,
    dbStudiedOnly,
    dbLevelFilter,
    studiedVocabIds,
  ]);

  const DB_PAGE_SIZE = 24;
  const totalDbPages = Math.max(1, Math.ceil(filteredDbEntries.length / DB_PAGE_SIZE));
  const safeDbPage = Math.min(dbPage, totalDbPages);
  const paginatedDbEntries = useMemo(() => {
    const start = (safeDbPage - 1) * DB_PAGE_SIZE;
    return filteredDbEntries.slice(start, start + DB_PAGE_SIZE);
  }, [filteredDbEntries, safeDbPage]);

  const selectedDbEntry = useMemo(() => {
    if (selectedDbId) {
      const found = filteredDbEntries.find((e) => e.id === selectedDbId);
      if (found) return found;
      const globalFound = allDbEntries.find((e) => e.id === selectedDbId);
      if (globalFound) return globalFound;
    }
    return paginatedDbEntries[0] ?? filteredDbEntries[0] ?? allDbEntries[0] ?? null;
  }, [selectedDbId, filteredDbEntries, paginatedDbEntries, allDbEntries]);

  const selectedDbHomophones = useMemo<HomophoneRef[]>(() => {
    if (!selectedDbEntry) return [];
    const hira = katakanaToHiragana(selectedDbEntry.kana);
    const sameKana = homophonesByKana.get(hira) ?? [];
    return sameKana
      .filter((e) => e.id !== selectedDbEntry.id && e.kanji !== selectedDbEntry.kanji)
      .slice(0, 6)
      .map((e) => ({
        id: e.id,
        kanji: e.kanji,
        kana: e.kana,
        meaning: e.meaning,
        accentNucleus: e.accentNucleus,
        onSelect: () => setSelectedDbId(e.id),
      }));
  }, [selectedDbEntry, homophonesByKana]);

  // Filtered quick-picker list for Speaking Studio database search
  const speakingDbMatches = useMemo(() => {
    const q = speakingDbSearch.trim().toLowerCase();
    const out: UniversalVocabEntry[] = [];
    for (const e of allDbEntries) {
      if (speakingDbStudiedOnly && !studiedVocabIds.has(e.id)) continue;
      if (q && !e.searchKey.includes(q)) continue;
      out.push(e);
      if (out.length >= 40) break;
    }
    return out;
  }, [allDbEntries, speakingDbSearch, speakingDbStudiedOnly, studiedVocabIds]);

  const speakingPair = useMemo(
    () => MINIMAL_PAIRS.find((p) => p.id === speakingPairId) ?? MINIMAL_PAIRS[0],
    [speakingPairId]
  );

  const speakingWord = useMemo<PronunciationWord>(() => {
    if (customSpeakingTarget) {
      return toPronunciationWord(customSpeakingTarget);
    }
    return speakingPair.words[speakingWordIdx];
  }, [customSpeakingTarget, speakingPair, speakingWordIdx]);

  const speakingMouthTip = customSpeakingTarget
    ? 'Perhatikan tinggi-rendah nada per mora pada diagram target dan bandingkan dengan grafik suaramu.'
    : speakingPair.mouthTip;

  const speakingTrackId = customSpeakingTarget
    ? customSpeakingTarget.id
    : speakingPair.id;

  const speakingUseParticle = customSpeakingTarget
    ? Boolean(speakingWord.particle)
    : speakingPair.category === 'pitch';

  const launchSpeakingForTarget = (target: PronunciationTargetWord) => {
    stopAllPlayback();
    if (isRecording) stopRecording();
    setCustomSpeakingTarget(target);
    setSpeakingPickerMode('database');
    setActiveTab('speaking');
    setPitchSamples([]);
    setRecognizedText(null);
    setSpeechMatchStatus('idle');
  };

  const stopAllPlayback = () => {
    if (cancelAudioRef.current) {
      cancelAudioRef.current();
      cancelAudioRef.current = null;
    }
    stopSpeech();
    setActivePitchId(null);
    setActivePitchStep(null);
    setComparingWordId(null);
  };

  // Cleanup playback & microphone on unmount
  useEffect(() => {
    return () => {
      stopAllPlayback();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (recordedUrlRef.current) {
        URL.revokeObjectURL(recordedUrlRef.current);
      }
    };
  }, []);

  const playWordPitchTone = (
    id: string,
    kana: string,
    accentNucleus: number,
    particle = 'が',
    stepMs = 240,
    onDone?: () => void
  ) => {
    stopAllPlayback();
    const moras = splitIntoMoras(kana);
    const { wordLevels, particleLevel } = getPitchLevels(
      moras.length,
      accentNucleus
    );
    const levels = particle ? [...wordLevels, particleLevel] : wordLevels;
    setActivePitchId(id);
    const cancel = playPitchMelody(levels, {
      stepMs,
      onStep: (idx) => setActivePitchStep(idx),
      onComplete: () => {
        setActivePitchId(null);
        setActivePitchStep(null);
        onDone?.();
      },
    });
    cancelAudioRef.current = cancel;
  };

  const playWordSpeech = (
    word: PronunciationWord,
    options: { slow?: boolean; sentence?: boolean; withParticle?: boolean } = {}
  ) => {
    stopAllPlayback();
    const rate = options.slow ? 0.68 : 0.92;
    const text = options.sentence
      ? word.exampleJp
      : options.withParticle
      ? `${word.kanji}${word.particle ?? 'が'}`
      : word.kanji;
    setComparingWordId(word.id);
    speakJapanese(text, rate, 'narrator', () => {
      setComparingWordId(null);
    });
  };

  const compareMinimalPair = (pair: MinimalPair) => {
    stopAllPlayback();
    let cancelled = false;
    let timerId: number | null = null;
    const [wordA, wordB] = pair.words;

    const cleanup = () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
      stopSpeech();
      setActivePitchId(null);
      setActivePitchStep(null);
      setComparingWordId(null);
    };
    cancelAudioRef.current = cleanup;

    const playSingle = (w: PronunciationWord, after: () => void) => {
      if (cancelled) return;
      setComparingWordId(w.id);
      const moras = splitIntoMoras(w.kana);
      const { wordLevels, particleLevel } = getPitchLevels(
        moras.length,
        w.accentNucleus
      );
      const levels = w.particle ? [...wordLevels, particleLevel] : wordLevels;
      setActivePitchId(w.id);
      const stopTone = playPitchMelody(levels, {
        stepMs: 220,
        onStep: (step) => {
          if (!cancelled) setActivePitchStep(step);
        },
        onComplete: () => {
          if (cancelled) return;
          setActivePitchId(null);
          setActivePitchStep(null);
          timerId = window.setTimeout(() => {
            if (cancelled) return;
            speakJapanese(`${w.kanji}${w.particle ?? 'が'}`, 0.88, 'narrator', () => {
              if (cancelled) return;
              after();
            });
          }, 160);
        },
      });
      const prevCleanup = cleanup;
      cancelAudioRef.current = () => {
        stopTone();
        prevCleanup();
      };
    };

    playSingle(wordA, () => {
      timerId = window.setTimeout(() => {
        if (cancelled) return;
        playSingle(wordB, () => {
          if (!cancelled) {
            setComparingWordId(null);
          }
        });
      }, 600);
    });
  };

  // =========================================================================
  // EAR TRAINING QUIZ LOGIC
  // =========================================================================
  const earPool = useMemo(() => {
    if (earSource === 'database' && dbHomophonePairs.length > 0) {
      return dbHomophonePairs;
    }
    return earCategory === 'all'
      ? MINIMAL_PAIRS
      : MINIMAL_PAIRS.filter((p) => p.category === earCategory);
  }, [earSource, earCategory, dbHomophonePairs]);

  const playEarPrompt = (
    question: EarQuestion,
    modeOverride?: 'voice-and-tone' | 'voice-only' | 'slow' | 'tone-only'
  ) => {
    const word = question.pair.words[question.targetIdx];
    const mode = modeOverride ?? earAudioMode;
    stopAllPlayback();

    const speechText =
      question.pair.category === 'pitch'
        ? `${word.kanji}${word.particle ?? 'が'}`
        : word.kana || word.kanji;

    if (mode === 'tone-only') {
      playWordPitchTone(
        `ear-${question.id}`,
        word.kana,
        word.accentNucleus,
        word.particle ?? 'が',
        250
      );
      return;
    }

    if (mode === 'slow') {
      speakJapanese(speechText, 0.66);
      return;
    }

    if (mode === 'voice-only') {
      speakJapanese(speechText, 0.9);
      return;
    }

    // Default: voice + pitch melody (for pitch pairs) or clear voice (for consonant/length)
    if (question.pair.category === 'pitch') {
      const moras = splitIntoMoras(word.kana);
      const { wordLevels, particleLevel } = getPitchLevels(
        moras.length,
        word.accentNucleus
      );
      let cancelled = false;
      let timerId: number | null = null;
      const earParticle = word.particle ?? 'が';
      const levels = earParticle ? [...wordLevels, particleLevel] : wordLevels;
      setExternalAudioPlaying('ear-seq', true);
      const stopTone = playPitchMelody(levels, {
        stepMs: 220,
        onComplete: () => {
          if (cancelled) return;
          timerId = window.setTimeout(() => {
            if (!cancelled) {
              speakJapanese(speechText, 0.88, 'narrator', () => {
                setExternalAudioPlaying('ear-seq', false);
              });
            } else {
              setExternalAudioPlaying('ear-seq', false);
            }
          }, 160);
        },
      });
      cancelAudioRef.current = () => {
        cancelled = true;
        if (timerId !== null) window.clearTimeout(timerId);
        setExternalAudioPlaying('ear-seq', false);
        stopTone();
        stopSpeech();
      };
    } else {
      speakJapanese(speechText, 0.88);
    }
  };

  const loadNextEarQuestion = (overridePool?: MinimalPair[]) => {
    stopAllPlayback();
    const pool = overridePool ?? earPool;
    const nextQ = buildEarQuestion(pool, earQuestion.pair.id);
    setEarQuestion(nextQ);
    setEarSelection(null);
    setEarPausedAuto(false);
    window.setTimeout(() => {
      playEarPrompt(nextQ);
    }, 180);
  };

  nextEarRef.current = () => loadNextEarQuestion();

  const handleEarChoice = (chosenIdx: 0 | 1) => {
    if (earSelection !== null) return;
    setEarSelection(chosenIdx);
    const isCorrect = chosenIdx === earQuestion.targetIdx;
    setEarStats((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
      streak: isCorrect ? prev.streak + 1 : 0,
    }));
    recordPronunciationAttempt('ear', isCorrect, earQuestion.pair.id);
  };

  // Auto-advance Ear Quiz after audio finishes + brief hold on correct answer
  useEffect(() => {
    if (
      activeTab !== 'ear-quiz' ||
      earSelection === null ||
      earSelection !== earQuestion.targetIdx ||
      earPausedAuto ||
      isAudioPlaying ||
      autoAdvanceDelayMs <= 0
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      nextEarRef.current();
    }, Math.max(1500, autoAdvanceDelayMs));
    return () => window.clearTimeout(timer);
  }, [
    activeTab,
    earSelection,
    earQuestion.id,
    earQuestion.targetIdx,
    earPausedAuto,
    isAudioPlaying,
    autoAdvanceDelayMs,
  ]);

  // =========================================================================
  // SPEAKING STUDIO (LIVE MIC PITCH ANALYZER + SPEECH RECOGNITION)
  // =========================================================================
  const evaluateSpokenTranscript = (transcript: string, word: PronunciationWord) => {
    const normSpoken = normalizeJapaneseSpeech(transcript);
    const normKana = normalizeJapaneseSpeech(word.kana);
    const normKanji = normalizeJapaneseSpeech(word.kanji);
    const normWithParticle = normalizeJapaneseSpeech(
      `${word.kana}${word.particle ?? ''}`
    );

    const exact =
      normSpoken === normKana ||
      normSpoken === normKanji ||
      normSpoken === normWithParticle ||
      normSpoken.includes(normKana) ||
      transcript.includes(word.kanji);

    if (exact) {
      setSpeechMatchStatus('matched');
      recordPronunciationAttempt('speak', true, speakingTrackId);
      return;
    }

    // Check close partial overlap (e.g. first or last mora matched)
    if (
      normSpoken.length > 0 &&
      (normKana.includes(normSpoken) ||
        normSpoken.slice(0, 1) === normKana.slice(0, 1))
    ) {
      setSpeechMatchStatus('close');
      recordPronunciationAttempt('speak', false, speakingTrackId);
      return;
    }

    setSpeechMatchStatus('mismatch');
    recordPronunciationAttempt('speak', false, speakingTrackId);
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore
      }
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  const startRecording = async () => {
    stopAllPlayback();
    setMicError(null);
    setPitchSamples([]);
    setRecognizedText(null);
    setSpeechMatchStatus('idle');

    if (recordedUrlRef.current) {
      URL.revokeObjectURL(recordedUrlRef.current);
      recordedUrlRef.current = null;
      setRecordedAudioUrl(null);
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setMicError(
        'Browser ini tidak mendukung akses mikrofon. Kamu tetap bisa berlatih menirukan (shadowing) dengan tombol audio dan panduan nada di atas.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      setIsRecording(true);

      // 1. Record user audio for A/B self-playback
      recChunksRef.current = [];
      if (typeof MediaRecorder !== 'undefined') {
        try {
          const recorder = new MediaRecorder(stream);
          recorder.ondataavailable = (ev) => {
            if (ev.data.size > 0) recChunksRef.current.push(ev.data);
          };
          recorder.onstop = () => {
            if (recChunksRef.current.length > 0) {
              const blob = new Blob(recChunksRef.current, {
                type: recorder.mimeType || 'audio/webm',
              });
              const url = URL.createObjectURL(blob);
              recordedUrlRef.current = url;
              setRecordedAudioUrl(url);
            }
          };
          recorder.start();
          mediaRecorderRef.current = recorder;
        } catch {
          // MediaRecorder optional
        }
      }

      // 2. Real-time F0 Pitch Contour tracking via AudioContext + AnalyserNode
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

        const timeData = new Float32Array(analyser.fftSize);
        const collected: number[] = [];
        let lastPush = 0;

        const tick = (ts: number) => {
          if (!mediaStreamRef.current) return;
          analyser.getFloatTimeDomainData(timeData);
          if (ts - lastPush >= 45) {
            lastPush = ts;
            const f0 = detectPitchAutocorrelation(timeData, ctx.sampleRate);
            if (f0 !== null) {
              collected.push(Math.round(f0));
              if (collected.length > 60) collected.shift();
              setPitchSamples([...collected]);
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }

      // 3. Japanese Speech Recognition (ja-JP) if browser supports it
      const RecCtor = getSpeechRecognitionCtor();
      if (RecCtor) {
        try {
          const rec = new RecCtor();
          rec.lang = 'ja-JP';
          rec.continuous = false;
          rec.interimResults = true;
          rec.maxAlternatives = 3;
          let finalTranscript = '';

          rec.onresult = (ev) => {
            let combined = '';
            for (let i = 0; i < ev.results.length; i++) {
              combined += ev.results[i][0]?.transcript ?? '';
              if (ev.results[i].isFinal) {
                finalTranscript = combined;
              }
            }
            if (combined.trim()) {
              setRecognizedText(combined.trim());
            }
          };

          rec.onerror = () => {
            // Silently keep pitch recording working
          };

          rec.onend = () => {
            if (finalTranscript.trim()) {
              evaluateSpokenTranscript(finalTranscript.trim(), speakingWord);
            }
          };

          rec.start();
          recognitionRef.current = rec;
        } catch {
          setSpeechMatchStatus('no-stt');
        }
      } else {
        setSpeechMatchStatus('no-stt');
      }

      // Auto-stop after 4.5s so recording stays snappy
      window.setTimeout(() => {
        if (mediaStreamRef.current === stream) {
          stopRecording();
        }
      }, 4500);
    } catch {
      setMicError(
        'Izin mikrofon ditolak atau perangkat tidak ditemukan. Aktifkan izin mikrofon di browser untuk melihat kontur nada suaramu secara langsung.'
      );
      setIsRecording(false);
    }
  };

  // Evaluate interim transcript if user manually stopped recording before onend fired
  const handleManualStopRecording = () => {
    stopRecording();
    if (recognizedText && speechMatchStatus === 'idle') {
      evaluateSpokenTranscript(recognizedText, speakingWord);
    } else if (!recognizedText && pitchSamples.length > 0 && speechMatchStatus === 'idle') {
      setSpeechMatchStatus('no-stt');
      recordPronunciationAttempt('speak', true, speakingTrackId);
    }
  };

  const playRecordedSelf = () => {
    if (!recordedAudioUrl) return;
    stopAllPlayback();
    const audio = new Audio(recordedAudioUrl);
    audio.play().catch(() => {});
  };

  // Build normalized SVG polyline for user's recorded F0 pitch samples
  const userPitchSvgPoints = useMemo(() => {
    if (pitchSamples.length < 2) return null;
    const minHz = Math.min(...pitchSamples);
    const maxHz = Math.max(...pitchSamples);
    const span = Math.max(25, maxHz - minHz);
    const w = 320;
    const h = 76;
    const padX = 16;
    const padY = 12;

    const coords = pitchSamples.map((hz, i) => {
      const x = padX + (i / (pitchSamples.length - 1)) * (w - padX * 2);
      const norm = (hz - minHz) / span; // 0 = low, 1 = high
      const y = h - padY - norm * (h - padY * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return {
      points: coords.join(' '),
      minHz,
      maxHz,
      avgHz: Math.round(
        pitchSamples.reduce((s, v) => s + v, 0) / pitchSamples.length
      ),
    };
  }, [pitchSamples]);

  const earOverallAcc =
    progress && progress.earQuizAttempts > 0
      ? Math.round((progress.earQuizCorrect / progress.earQuizAttempts) * 100)
      : null;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Header & Progress Summary */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1 min-w-0">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
            <span>Hatsuon &amp; Kōtei Akusento (発音・高低アクセント)</span>
            <span aria-hidden="true">·</span>
            <span>Standar Tokyo</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num">
              {allDbEntries.length.toLocaleString('id-ID')} Kosakata Database
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num">{MINIMAL_PAIRS.length} Pasangan Mirip</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Studio Pelafalan &amp; Pitch Accent
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            Berlaku untuk seluruh{' '}
            <strong className="font-mono-num text-slate-800 dark:text-slate-200">
              {allDbEntries.length.toLocaleString('id-ID')}
            </strong>{' '}
            kosakata (Kurikulum Level 1–60 &amp; Kana JLPT N5–N1) plus pasangan minimal seperti{' '}
            <span className="font-jp font-semibold">花</span> vs{' '}
            <span className="font-jp font-semibold">鼻</span> dan{' '}
            <span className="font-jp font-semibold">好き</span> vs{' '}
            <span className="font-jp font-semibold">月</span>.
          </p>
        </div>

        {/* Quiet Tabular Progress Metrics */}
        <div className="flex flex-wrap items-center gap-5 text-xs tabular-nums shrink-0">
          <div>
            <div className="text-slate-500 dark:text-slate-400">Kata/Pasangan Dilatih</div>
            <div className="font-display text-lg font-bold text-slate-900 dark:text-white">
              {progress?.practicedPairIds.length ?? 0}
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">Akurasi Dengar</div>
            <div className="font-display text-lg font-bold text-[#0284C7]">
              {earOverallAcc !== null ? `${earOverallAcc}%` : '—'}
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">Latihan Ucap</div>
            <div className="font-display text-lg font-bold text-[#0F766E] dark:text-teal-400">
              {progress?.speakingAttempts ?? 0}x
            </div>
          </div>
        </div>
      </div>

      {/* Primary Studio Mode Switcher */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-900/70 rounded-xl overflow-x-auto no-scrollbar">
        {(
          [
            { id: 'pairs', label: 'Pasangan Mirip', icon: ArrowLeftRight },
            {
              id: 'database',
              label: `Semua Kosakata (${allDbEntries.length.toLocaleString('id-ID')})`,
              icon: Database,
            },
            { id: 'guide', label: 'Pola Pitch & Bunyi', icon: BookOpen },
            { id: 'ear-quiz', label: 'Tes Pendengaran', icon: Ear },
            { id: 'speaking', label: 'Latihan Ucap', icon: Mic },
          ] as { id: StudioTab; label: string; icon: React.ElementType }[]
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                stopAllPlayback();
                if (isRecording) stopRecording();
                setActiveTab(tab.id);
              }}
              className={`min-h-[42px] flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                active
                  ? 'bg-white dark:bg-[#161A22] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ===================================================================
          TAB 2 (UNIVERSAL): SEMUA KOSAKATA DATABASE (6,584 KURIKULUM + 150 KANA)
         =================================================================== */}
      {activeTab === 'database' && (
        <div className="space-y-5">
          {/* Search & Filter Toolbar */}
          <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-5 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={dbSearch}
                  onChange={(e) => {
                    setDbSearch(e.target.value);
                    setDbPage(1);
                  }}
                  placeholder="Cari kanji, hiragana, romaji, atau arti (mis. 花, はな, suki)..."
                  className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:outline-none focus:border-[#0284C7]"
                />
                {dbSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setDbSearch('');
                      setDbPage(1);
                    }}
                    aria-label="Hapus pencarian"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="md:col-span-7 flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filter sumber database"
                  value={dbSourceFilter}
                  onChange={(e) => {
                    setDbSourceFilter(e.target.value as DbSourceFilter);
                    setDbLevelFilter(0);
                    setDbPage(1);
                  }}
                  className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-slate-700 dark:text-slate-200"
                >
                  <option value="all">
                    Semua Database ({allDbEntries.length.toLocaleString('id-ID')})
                  </option>
                  <option value="curriculum">
                    Kurikulum Utama Lv 1–60 ({dataset.byType.vocabulary.length.toLocaleString('id-ID')})
                  </option>
                  <option value="kana">
                    Kosakata Kana JLPT ({kanaVocabData?.items.length ?? 0})
                  </option>
                </select>

                <select
                  aria-label="Filter pola pitch"
                  value={dbPitchFilter}
                  onChange={(e) => {
                    setDbPitchFilter(e.target.value as DbPitchFilter);
                    setDbPage(1);
                  }}
                  className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-slate-700 dark:text-slate-200"
                >
                  <option value="all">Semua Pola Pitch</option>
                  <option value="heiban">Heiban [0] · Datar</option>
                  <option value="atamadaka">Atamadaka [1] · Tinggi Awal</option>
                  <option value="nakadaka">Nakadaka [2+] · Tinggi Tengah</option>
                  <option value="odaka">Odaka [N] · Turun di Partikel</option>
                </select>

                {dbSourceFilter === 'kana' ? (
                  <select
                    aria-label="Filter level JLPT"
                    value={dbLevelFilter}
                    onChange={(e) => {
                      setDbLevelFilter(Number(e.target.value));
                      setDbPage(1);
                    }}
                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-slate-700 dark:text-slate-200"
                  >
                    <option value={0}>Semua JLPT (N5–N1)</option>
                    {[5, 4, 3, 2, 1].map((lvl) => (
                      <option key={lvl} value={lvl}>
                        JLPT N{lvl}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    aria-label="Filter bab JLPT"
                    value={dbLevelFilter}
                    onChange={(e) => {
                      setDbLevelFilter(Number(e.target.value));
                      setDbPage(1);
                    }}
                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-slate-700 dark:text-slate-200"
                  >
                    <option value={0}>Semua Bab JLPT (N5–N1)</option>
                    {Array.from({ length: 60 }, (_, idx) => idx + 1).map((lvl) => {
                      const m = getLevelMeta(lvl);
                      return (
                        <option key={lvl} value={lvl}>
                          {m.jlpt} · Bab {m.unitInTier}
                        </option>
                      );
                    })}
                  </select>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setDbStudiedOnly((v) => !v);
                    setDbPage(1);
                  }}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                    dbStudiedOnly
                      ? 'border-[#0284C7] bg-[#0284C7] text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-slate-700 dark:text-slate-200 hover:border-slate-400'
                  }`}
                >
                  Sudah Dipelajari ({studiedVocabIds.size})
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono-num">
                Menampilkan{' '}
                <strong className="text-slate-900 dark:text-white">
                  {filteredDbEntries.length.toLocaleString('id-ID')}
                </strong>{' '}
                kosakata · Halaman {safeDbPage} / {totalDbPages}
              </span>
              <span>
                Klik kosakata mana saja untuk melihat kurva pitch, mendengarkan nada, atau langsung latihan ucap mikrofon.
              </span>
            </div>
          </div>

          {filteredDbEntries.length === 0 ? (
            <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Tidak ada kosakata yang cocok dengan filter saat ini.
              </p>
              <button
                type="button"
                onClick={() => {
                  setDbSearch('');
                  setDbSourceFilter('all');
                  setDbPitchFilter('all');
                  setDbStudiedOnly(false);
                  setDbLevelFilter(0);
                  setDbPage(1);
                }}
                className="text-xs font-semibold text-[#0284C7] hover:underline cursor-pointer"
              >
                Reset semua filter
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Paginated Vocabulary List */}
              <aside className="lg:col-span-5 bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[420px] lg:max-h-[620px] overflow-y-auto">
                  {paginatedDbEntries.map((entry) => {
                    const isSelected = selectedDbEntry?.id === entry.id;
                    const pMeta = PITCH_PATTERN_META[entry.pattern];
                    return (
                      <div
                        key={entry.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedDbId(entry.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedDbId(entry.id);
                          }
                        }}
                        className={`px-4 py-3 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#0284C7]/[0.08] dark:bg-[#0284C7]/15'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-jp text-lg font-bold text-slate-900 dark:text-white">
                              {entry.kanji}
                            </span>
                            <span className="font-jp text-xs text-slate-500 dark:text-slate-400">
                              {entry.kana}
                            </span>
                            <span
                              className="font-mono-num text-[11px] font-bold"
                              style={{ color: pMeta.color }}
                            >
                              [{entry.accentNucleus}]
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 truncate mt-0.5">
                            {entry.meaning} · {entry.sourceLabel}
                          </div>
                        </div>

                        <button
                          type="button"
                          aria-label={`Dengarkan ${entry.kanji}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            const baseSpeak = entry.kana || entry.kanji;
                            speakJapanese(
                              entry.particle
                                ? `${baseSpeak}${entry.particle}`
                                : baseSpeak,
                              0.92
                            );
                          }}
                          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:border-[#0284C7] hover:text-[#0284C7] shrink-0 cursor-pointer"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination Bar */}
                {totalDbPages > 1 && (
                  <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900/40">
                    <button
                      type="button"
                      disabled={safeDbPage <= 1}
                      onClick={() => setDbPage((p) => Math.max(1, p - 1))}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-xs font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Sebelumnya
                    </button>
                    <span className="font-mono-num text-xs text-slate-500 dark:text-slate-400">
                      {safeDbPage} / {totalDbPages}
                    </span>
                    <button
                      type="button"
                      disabled={safeDbPage >= totalDbPages}
                      onClick={() => setDbPage((p) => Math.min(totalDbPages, p + 1))}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-xs font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Berikutnya
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </aside>

              {/* Right Selected Word Full Pronunciation Inspector */}
              <section className="lg:col-span-7 bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
                {selectedDbEntry && (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                      <div className="space-y-1 min-w-0">
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                          <span>{selectedDbEntry.sourceLabel}</span>
                          {selectedDbEntry.partOfSpeech && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{selectedDbEntry.partOfSpeech}</span>
                            </>
                          )}
                          {studiedVocabIds.has(selectedDbEntry.id) && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                Sudah Dipelajari
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex items-baseline gap-3 flex-wrap">
                          <h2 className="font-jp text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white">
                            {selectedDbEntry.kanji}
                          </h2>
                          <span className="font-jp text-lg text-slate-500 dark:text-slate-400">
                            {selectedDbEntry.kana}
                          </span>
                        </div>
                        <p className="font-display text-lg font-bold text-slate-800 dark:text-slate-200">
                          {selectedDbEntry.meaning}
                        </p>
                      </div>
                    </div>

                    <PronunciationCard
                      target={{
                        id: selectedDbEntry.id,
                        kanji: selectedDbEntry.kanji,
                        kana: selectedDbEntry.kana,
                        meaning: selectedDbEntry.meaning,
                        partOfSpeech: selectedDbEntry.partOfSpeech,
                        sourceLabel: selectedDbEntry.sourceLabel,
                        accentNucleus: selectedDbEntry.accentNucleus,
                        particle: selectedDbEntry.particle,
                        exampleJp: selectedDbEntry.exampleJp,
                        exampleReading: selectedDbEntry.exampleReading,
                        exampleTranslation: selectedDbEntry.exampleTranslation,
                      }}
                      homophones={selectedDbHomophones}
                      onPracticeSpeak={launchSpeakingForTarget}
                    />

                    {selectedDbEntry.exampleJp && (
                      <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            Contoh Kalimat Konteks
                          </div>
                          <p className="font-jp text-base font-medium text-slate-900 dark:text-white">
                            {selectedDbEntry.exampleJp}
                          </p>
                          {selectedDbEntry.exampleReading && (
                            <p className="font-jp text-xs text-slate-500 dark:text-slate-400">
                              {selectedDbEntry.exampleReading}
                            </p>
                          )}
                          {selectedDbEntry.exampleTranslation && (
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              {selectedDbEntry.exampleTranslation}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            speakJapanese(selectedDbEntry.exampleJp!, 0.88)
                          }
                          aria-label="Putar kalimat contoh"
                          className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-[#0284C7] hover:text-[#0284C7] shrink-0 cursor-pointer"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================
          TAB 1: MINIMAL PAIRS COMPARISON STUDIO (花 vs 鼻, 好き vs 月, dll.)
         =================================================================== */}
      {activeTab === 'pairs' && (
        <div className="space-y-5">
          {/* Category Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'all', label: `Semua (${categoryCounts.all})` },
                { id: 'pitch', label: `Beda Pitch Accent (${categoryCounts.pitch})` },
                { id: 'consonant', label: `Konsonan す/つ (${categoryCounts.consonant})` },
                {
                  id: 'length-sokuon',
                  label: `Vokal Panjang & っ (${categoryCounts['length-sokuon']})`,
                },
              ] as { id: CategoryFilter; label: string }[]
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setCategoryFilter(cat.id);
                  const nextList =
                    cat.id === 'all'
                      ? MINIMAL_PAIRS
                      : MINIMAL_PAIRS.filter((p) => p.category === cat.id);
                  if (nextList.length > 0 && !nextList.some((p) => p.id === selectedPairId)) {
                    setSelectedPairId(nextList[0].id);
                  }
                }}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  categoryFilter === cat.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-400'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Pair Selector List */}
            <aside className="lg:col-span-4 bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>Pilih Pasangan Kata</span>
                <span className="font-mono-num">{filteredPairs.length} item</span>
              </div>
              <div className="max-h-[320px] lg:max-h-[620px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {filteredPairs.map((pair) => {
                  const isSelected = pair.id === selectedPair.id;
                  const practiced = progress?.practicedPairIds.includes(pair.id);
                  return (
                    <button
                      key={pair.id}
                      type="button"
                      onClick={() => {
                        stopAllPlayback();
                        setSelectedPairId(pair.id);
                      }}
                      className={`w-full px-4 py-3 text-left transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                        isSelected
                          ? 'bg-[#0284C7]/10 dark:bg-[#0284C7]/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-jp text-sm font-bold text-slate-900 dark:text-white truncate">
                          {pair.title}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {pair.subtitle} · JLPT N{pair.jlpt}
                        </div>
                      </div>
                      {practiced && (
                        <Check
                          className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0"
                          aria-label="Sudah dilatih"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Right Interactive Comparison Stage */}
            <section className="lg:col-span-8 bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-6">
              {/* Stage Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    JLPT N{selectedPair.jlpt} · {selectedPair.subtitle}
                  </div>
                  <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white mt-0.5 font-jp">
                    {selectedPair.title}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => compareMinimalPair(selectedPair)}
                    className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Bandingkan A → B
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopAllPlayback();
                      setSpeakingPairId(selectedPair.id);
                      setSpeakingWordIdx(0);
                      setActiveTab('speaking');
                    }}
                    className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Mic className="w-4 h-4" />
                    Latih Ucap
                  </button>
                </div>
              </div>

              {/* Word A vs Word B Side-by-Side Pitch Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedPair.words.map((word, idx) => {
                  const meta = PITCH_PATTERN_META[word.pattern];
                  const isHighlighting = comparingWordId === word.id || activePitchId === word.id;
                  const morasCount = splitIntoMoras(word.kana).length;

                  return (
                    <div
                      key={word.id}
                      className={`rounded-xl border p-4 sm:p-5 space-y-4 transition-colors ${
                        isHighlighting
                          ? 'border-[#0284C7] bg-[#0284C7]/[0.04] dark:bg-[#0284C7]/10'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            Kata {idx === 0 ? 'A' : 'B'} · {morasCount} mora ·{' '}
                            <span style={{ color: meta.color }} className="font-semibold">
                              {meta.name} [{word.accentNucleus}]
                            </span>
                          </div>
                          <div className="flex items-baseline gap-2.5 mt-1 flex-wrap">
                            <span className="font-jp text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
                              {word.kanji}
                            </span>
                            <span className="font-jp text-sm text-slate-500 dark:text-slate-400">
                              {word.kana}
                            </span>
                          </div>
                          <div className="font-display text-base font-bold text-slate-800 dark:text-slate-100 mt-1">
                            {word.meaningId}
                            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                              {' '}
                              · {word.meaningEn}
                            </span>
                          </div>
                          <div className="font-mono-num text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {word.romaji}
                          </div>
                        </div>
                      </div>

                      {/* Live Pitch Contour SVG */}
                      <div className="rounded-lg bg-white dark:bg-[#161A22] border border-slate-200/80 dark:border-slate-800 px-3 py-2">
                        <PitchDiagram
                          kana={word.kana}
                          accentNucleus={word.accentNucleus}
                          particle={word.particle ?? 'が'}
                          activeStep={activePitchId === word.id ? activePitchStep : null}
                        />
                      </div>

                      {/* Audio Playback Controls */}
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            playWordSpeech(word, { withParticle: selectedPair.category === 'pitch' })
                          }
                          className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 cursor-pointer whitespace-nowrap"
                        >
                          <Volume2 className="w-3.5 h-3.5 shrink-0" />
                          Suara
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            playWordPitchTone(
                              word.id,
                              word.kana,
                              word.accentNucleus,
                              word.particle ?? 'が'
                            )
                          }
                          className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-slate-800 dark:text-slate-200 hover:border-[#0284C7] text-xs font-semibold cursor-pointer whitespace-nowrap"
                        >
                          <Music className="w-3.5 h-3.5 shrink-0" />
                          Nada
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            playWordSpeech(word, {
                              slow: true,
                              withParticle: selectedPair.category === 'pitch',
                            })
                          }
                          className="min-h-[40px] inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-slate-700 dark:text-slate-300 hover:border-[#0284C7] text-xs font-semibold cursor-pointer whitespace-nowrap"
                        >
                          Pelan
                        </button>
                      </div>

                      {/* Context Example Sentence */}
                      <div className="pt-3 border-t border-slate-200/70 dark:border-slate-800 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-jp text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                              {word.exampleJp}
                            </div>
                            <div className="font-jp text-[11px] text-slate-500 dark:text-slate-400">
                              {word.exampleReading}
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                              {word.exampleId}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => playWordSpeech(word, { sentence: true })}
                            aria-label="Putar kalimat contoh"
                            className="p-2 min-w-[36px] min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-slate-600 dark:text-slate-300 hover:text-[#0284C7] shrink-0 flex items-center justify-center cursor-pointer"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pt-1">
                          <strong className="text-slate-800 dark:text-slate-200">Tip:</strong>{' '}
                          {word.speakingTip}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Contrast Explanation & Mouth Articulation Guide */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs sm:text-sm">
                <div className="space-y-1">
                  <div className="font-display font-bold text-slate-900 dark:text-white">
                    Perbedaan Kunci
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    {selectedPair.focusNote}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="font-display font-bold text-slate-900 dark:text-white">
                    Cara Mengucapkan &amp; Membedakan
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    {selectedPair.mouthTip}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ===================================================================
          TAB 2: 4 TOKYO PITCH ACCENT PATTERNS & 5 SOUND RULES GUIDE
         =================================================================== */}
      {activeTab === 'guide' && (
        <div className="space-y-8">
          {/* 4 Pitch Accent Patterns */}
          <section className="space-y-4">
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                4 Pola Pitch Accent Bahasa Jepang (Standar Tokyo)
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-3xl">
                Bahasa Jepang menggunakan <strong>nada tinggi (T)</strong> dan{' '}
                <strong>nada rendah (R)</strong>, bukan tekanan keras seperti bahasa Inggris. Aturan emasnya: ketukan 1 dan 2 <strong>selalu berbeda nada</strong>, dan setelah nada turun sekali, ia tidak naik lagi di kata yang sama.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PITCH_PATTERN_EXAMPLES.map((ex) => {
                const meta = PITCH_PATTERN_META[ex.pattern];
                const guideId = `guide-${ex.pattern}`;
                return (
                  <div
                    key={ex.pattern}
                    className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div
                            className="text-xs font-semibold"
                            style={{ color: meta.color }}
                          >
                            {meta.jpName} · Kode [{ex.accentNucleus}]
                          </div>
                          <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                            {meta.name}
                          </h3>
                        </div>
                        <div className="text-right">
                          <div className="font-jp text-2xl font-bold text-slate-900 dark:text-white">
                            {ex.kanji}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {ex.meaningId}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800 px-3 py-2">
                        <PitchDiagram
                          kana={ex.kana}
                          accentNucleus={ex.accentNucleus}
                          particle={ex.particle}
                          activeStep={activePitchId === guideId ? activePitchStep : null}
                        />
                      </div>

                      <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                        {ex.tip}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs min-w-0">
                        <div className="font-jp font-semibold text-slate-900 dark:text-white">
                          {ex.exampleJp}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400">
                          {ex.exampleId}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            playWordPitchTone(
                              guideId,
                              ex.kana,
                              ex.accentNucleus,
                              ex.particle
                            )
                          }
                          className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#0284C7] cursor-pointer"
                        >
                          <Music className="w-3.5 h-3.5" />
                          Nada
                        </button>
                        <button
                          type="button"
                          onClick={() => speakJapanese(ex.exampleJp, 0.9)}
                          className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          Dengar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 5 Essential Japanese Sound & Rhythm Rules */}
          <section className="space-y-4">
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                5 Kunci Bunyi &amp; Irama Bahasa Jepang
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                Selain nada pitch, lima aturan artikulasi dan ketukan (mora) berikut membuat ucapanmu terdengar alami sekaligus tajam saat menyimak audio JLPT.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {SOUND_RULE_GUIDES.map((rule) => (
                <div
                  key={rule.id}
                  className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4"
                >
                  <div className="space-y-1">
                    <div className="font-jp text-xs text-[#0284C7] font-semibold">
                      {rule.japaneseName}
                    </div>
                    <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                      {rule.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      {rule.summary}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    <strong className="text-slate-900 dark:text-white">Cara Melatih:</strong>{' '}
                    {rule.keyRule}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {rule.examples.map((ex, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="font-jp text-base font-bold text-slate-900 dark:text-white">
                              {ex.kanji}
                            </span>
                            <span className="font-jp text-xs text-slate-500 dark:text-slate-400">
                              ({ex.kana})
                            </span>
                          </div>
                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                            {ex.meaningId}
                          </div>
                          <div className="font-mono-num text-[11px] text-slate-500 dark:text-slate-400">
                            {ex.romaji}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug pt-0.5">
                            {ex.note}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => speakJapanese(ex.kana || ex.kanji, 0.85)}
                          aria-label={`Putar ${ex.kanji}`}
                          className="p-2 min-w-[36px] min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-[#0284C7] hover:border-[#0284C7] shrink-0 flex items-center justify-center cursor-pointer"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ===================================================================
          TAB 3: EAR TRAINING QUIZ (TES PENDENGARAN PITCH & BUNYI)
         =================================================================== */}
      {activeTab === 'ear-quiz' && (
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Controls & Session Metrics */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-900/70 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setEarSource('curated');
                    const nextPool =
                      earCategory === 'all'
                        ? MINIMAL_PAIRS
                        : MINIMAL_PAIRS.filter((p) => p.category === earCategory);
                    loadNextEarQuestion(nextPool);
                  }}
                  className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer ${
                    earSource === 'curated'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Pasangan Kurasi ({MINIMAL_PAIRS.length})
                </button>
                <button
                  type="button"
                  disabled={dbHomophonePairs.length === 0}
                  onClick={() => {
                    setEarSource('database');
                    if (dbHomophonePairs.length > 0) {
                      loadNextEarQuestion(dbHomophonePairs);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer disabled:opacity-40 ${
                    earSource === 'database'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Homofon Database ({dbHomophonePairs.length})
                </button>
              </div>

              <div className="flex items-center gap-4 text-xs font-mono-num text-slate-600 dark:text-slate-300">
                <span>
                  Skor{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {earStats.correct}/{earStats.total}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Streak{' '}
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    {earStats.streak}
                  </strong>
                </span>
              </div>
            </div>

            {earSource === 'curated' && (
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: 'Semua' },
                    { id: 'pitch', label: 'Pitch Accent' },
                    { id: 'consonant', label: 'Konsonan す/つ' },
                    { id: 'length-sokuon', label: 'Panjang & っ' },
                  ] as { id: CategoryFilter; label: string }[]
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setEarCategory(cat.id);
                      const nextPool =
                        cat.id === 'all'
                          ? MINIMAL_PAIRS
                          : MINIMAL_PAIRS.filter((p) => p.category === cat.id);
                      loadNextEarQuestion(nextPool);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      earCategory === cat.id
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                        : 'bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quiz Card */}
          <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Kategori:{' '}
                <strong className="text-slate-800 dark:text-slate-200">
                  {earQuestion.pair.category === 'pitch'
                    ? 'Pitch Accent (Nada Tinggi-Rendah)'
                    : earQuestion.pair.category === 'consonant'
                    ? 'Artikulasi Konsonan'
                    : 'Durasi Vokal & Konsonan Ganda'}
                </strong>
              </div>

              <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-900/70 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setEarAudioMode('voice-and-tone')}
                  className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                    earAudioMode === 'voice-and-tone'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Nada + Suara
                </button>
                <button
                  type="button"
                  onClick={() => setEarAudioMode('voice-only')}
                  className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                    earAudioMode === 'voice-only'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Suara Saja
                </button>
              </div>
            </div>

            {/* Audio Prompt Stage */}
            <div className="text-center space-y-4 py-2">
              <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                Dengarkan baik-baik — kata mana yang diucapkan?
              </h2>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => playEarPrompt(earQuestion)}
                  className="min-h-[48px] inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  <Volume2 className="w-5 h-5" />
                  Putar Audio Soal
                </button>
                <button
                  type="button"
                  onClick={() => playEarPrompt(earQuestion, 'slow')}
                  className="min-h-[48px] inline-flex items-center gap-1.5 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#0284C7] text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  Pelan (0.66x)
                </button>
                <button
                  type="button"
                  onClick={() => playEarPrompt(earQuestion, 'tone-only')}
                  className="min-h-[48px] inline-flex items-center gap-1.5 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#0284C7] text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  <Music className="w-4 h-4" />
                  Nada Pitch
                </button>
              </div>
            </div>

            {/* 2 Choice Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {earQuestion.pair.words.map((w, idx) => {
                const choiceIdx = idx as 0 | 1;
                const answered = earSelection !== null;
                const isTarget = choiceIdx === earQuestion.targetIdx;
                const isPicked = choiceIdx === earSelection;
                const meta = PITCH_PATTERN_META[w.pattern];

                let cardStyle =
                  'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 hover:border-[#0284C7]';
                if (answered) {
                  if (isTarget) {
                    cardStyle =
                      'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40';
                  } else if (isPicked && !isTarget) {
                    cardStyle = 'border-rose-500 bg-rose-50/80 dark:bg-rose-950/40';
                  } else {
                    cardStyle =
                      'border-slate-200 dark:border-slate-800 opacity-75';
                  }
                }

                return (
                  <button
                    key={w.id}
                    type="button"
                    disabled={answered}
                    onClick={() => handleEarChoice(choiceIdx)}
                    className={`p-5 rounded-xl border-2 text-left space-y-3 transition-colors cursor-pointer disabled:cursor-default ${cardStyle}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-jp text-3xl font-bold text-slate-900 dark:text-white">
                          {w.kanji}
                        </div>
                        <div className="font-jp text-sm text-slate-500 dark:text-slate-400">
                          {w.kana}
                        </div>
                      </div>
                      {answered && isTarget && (
                        <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      )}
                      {answered && isPicked && !isTarget && (
                        <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                      )}
                    </div>

                    <div>
                      <div className="font-display text-base font-bold text-slate-900 dark:text-white">
                        {w.meaningId}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {answered
                          ? `${meta.name} [${w.accentNucleus}] · ${w.romaji}`
                          : w.meaningEn}
                      </div>
                    </div>

                    {/* Reveal Pitch Diagram AFTER answering so learner sees the visual contrast */}
                    {answered && (
                      <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800">
                        <PitchDiagram
                          kana={w.kana}
                          accentNucleus={w.accentNucleus}
                          particle={w.particle ?? 'が'}
                          compact
                        />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Post-Answer Feedback + Auto-Advance Countdown */}
            {earSelection !== null && (
              <div
                className={`relative overflow-hidden rounded-xl border p-4 space-y-3 ${
                  earSelection === earQuestion.targetIdx
                    ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30'
                    : 'border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div
                      className={`font-display font-bold text-sm sm:text-base ${
                        earSelection === earQuestion.targetIdx
                          ? 'text-emerald-800 dark:text-emerald-300'
                          : 'text-rose-800 dark:text-rose-300'
                      }`}
                    >
                      {earSelection === earQuestion.targetIdx
                        ? !earPausedAuto && autoAdvanceDelayMs > 0
                          ? isAudioPlaying
                            ? 'Tepat! Menunggu audio selesai...'
                            : 'Tepat! Lanjut otomatis ke soal berikutnya...'
                          : 'Tepat!'
                        : `Belum tepat — yang diucapkan adalah ${earQuestion.pair.words[earQuestion.targetIdx].kanji} (${earQuestion.pair.words[earQuestion.targetIdx].meaningId})`}
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      {earQuestion.pair.focusNote}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEarPausedAuto(true);
                        compareMinimalPair(earQuestion.pair);
                      }}
                      className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161A22] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
                    >
                      Bandingkan A → B
                    </button>
                    <button
                      type="button"
                      onClick={() => loadNextEarQuestion()}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Soal Berikutnya
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {earSelection === earQuestion.targetIdx &&
                  !earPausedAuto &&
                  !isAudioPlaying &&
                  autoAdvanceDelayMs > 0 && (
                    <div
                      key={earQuestion.id}
                      className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500/75 dark:bg-emerald-400/75 animate-auto-advance"
                      style={{
                        animationDuration: `${Math.max(1500, autoAdvanceDelayMs)}ms`,
                      }}
                    />
                  )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ===================================================================
          TAB 4: LIVE SPEAKING STUDIO (MICROPHONE PITCH + SPEECH RECOGNITION)
         =================================================================== */}
      {activeTab === 'speaking' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Word Selector (Minimal Pairs OR Any of 6,734 Database Words) */}
          <aside className="lg:col-span-4 bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 space-y-2.5">
              <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900/70 text-xs">
                <button
                  type="button"
                  onClick={() => setSpeakingPickerMode('pairs')}
                  className={`py-1.5 px-2 rounded-md font-semibold cursor-pointer ${
                    speakingPickerMode === 'pairs'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Pasangan ({MINIMAL_PAIRS.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSpeakingPickerMode('database')}
                  className={`py-1.5 px-2 rounded-md font-semibold cursor-pointer ${
                    speakingPickerMode === 'database'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Database ({allDbEntries.length.toLocaleString('id-ID')})
                </button>
              </div>

              {speakingPickerMode === 'database' && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={speakingDbSearch}
                      onChange={(e) => setSpeakingDbSearch(e.target.value)}
                      placeholder="Cari kosakata apa saja..."
                      className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:outline-none focus:border-[#0284C7]"
                    />
                    {speakingDbSearch && (
                      <button
                        type="button"
                        onClick={() => setSpeakingDbSearch('')}
                        aria-label="Hapus pencarian"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSpeakingDbStudiedOnly((v) => !v)}
                    className={`w-full py-1.5 px-2.5 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                      speakingDbStudiedOnly
                        ? 'border-[#0284C7] bg-[#0284C7] text-white'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Hanya Kosakata yang Sudah Dipelajari ({studiedVocabIds.size})
                  </button>
                </div>
              )}
            </div>

            {speakingPickerMode === 'pairs' ? (
              <div className="max-h-[300px] lg:max-h-[560px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {MINIMAL_PAIRS.map((pair) => {
                  const isPairActive = !customSpeakingTarget && pair.id === speakingPair.id;
                  return (
                    <div
                      key={pair.id}
                      className={`p-3 space-y-2 ${
                        isPairActive ? 'bg-[#0284C7]/[0.06] dark:bg-[#0284C7]/15' : ''
                      }`}
                    >
                      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {pair.subtitle}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {pair.words.map((w, idx) => {
                          const active = isPairActive && speakingWordIdx === idx;
                          return (
                            <button
                              key={w.id}
                              type="button"
                              onClick={() => {
                                stopAllPlayback();
                                if (isRecording) stopRecording();
                                setCustomSpeakingTarget(null);
                                setSpeakingPairId(pair.id);
                                setSpeakingWordIdx(idx as 0 | 1);
                                setPitchSamples([]);
                                setRecognizedText(null);
                                setSpeechMatchStatus('idle');
                              }}
                              className={`px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                                active
                                  ? 'border-[#0284C7] bg-white dark:bg-[#161A22] shadow-sm'
                                  : 'border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/40 hover:border-slate-400'
                              }`}
                            >
                              <div className="font-jp text-sm font-bold text-slate-900 dark:text-white truncate">
                                {w.kanji}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {w.meaningId}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="max-h-[300px] lg:max-h-[520px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {speakingDbMatches.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                    Tidak ada kosakata cocok. Coba kata kunci lain.
                  </div>
                ) : (
                  speakingDbMatches.map((entry) => {
                    const active = customSpeakingTarget?.id === entry.id;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() =>
                          launchSpeakingForTarget({
                            id: entry.id,
                            kanji: entry.kanji,
                            kana: entry.kana,
                            meaning: entry.meaning,
                            partOfSpeech: entry.partOfSpeech,
                            sourceLabel: entry.sourceLabel,
                            accentNucleus: entry.accentNucleus,
                            particle: entry.particle,
                            exampleJp: entry.exampleJp,
                            exampleReading: entry.exampleReading,
                            exampleTranslation: entry.exampleTranslation,
                          })
                        }
                        className={`w-full px-3.5 py-2.5 text-left transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                          active
                            ? 'bg-[#0284C7]/[0.08] dark:bg-[#0284C7]/15'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-jp text-base font-bold text-slate-900 dark:text-white truncate">
                              {entry.kanji}
                            </span>
                            <span className="font-jp text-xs text-slate-500 dark:text-slate-400 truncate">
                              {entry.kana}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {entry.meaning} · {entry.sourceLabel}
                          </div>
                        </div>
                        <span
                          className="font-mono-num text-[11px] font-bold shrink-0"
                          style={{ color: PITCH_PATTERN_META[entry.pattern].color }}
                        >
                          [{entry.accentNucleus}]
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </aside>

          {/* Right Live Speaking Stage */}
          <section className="lg:col-span-8 bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-6">
            {/* Target Word Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="space-y-1">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Target Ucap · {PITCH_PATTERN_META[speakingWord.pattern].name} [
                  {speakingWord.accentNucleus}]
                  {customSpeakingTarget ? ` · ${customSpeakingTarget.sourceLabel}` : ''}
                </div>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="font-jp text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white">
                    {speakingWord.kanji}
                  </span>
                  <span className="font-jp text-lg text-slate-500 dark:text-slate-400">
                    {speakingWord.kana}
                    {speakingWord.particle ? `(${speakingWord.particle})` : ''}
                  </span>
                </div>
                <div className="font-display text-base font-bold text-slate-800 dark:text-slate-200">
                  {speakingWord.meaningId}{' '}
                  <span className="font-mono-num text-xs font-normal text-slate-500 dark:text-slate-400">
                    · {speakingWord.romaji}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    playWordSpeech(speakingWord, {
                      withParticle: speakingUseParticle,
                    })
                  }
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                >
                  <Volume2 className="w-4 h-4" />
                  Dengar Contoh
                </button>
                <button
                  type="button"
                  onClick={() =>
                    playWordPitchTone(
                      `speak-${speakingWord.id}`,
                      speakingWord.kana,
                      speakingWord.accentNucleus,
                      speakingWord.particle ?? ''
                    )
                  }
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#0284C7] cursor-pointer"
                >
                  <Music className="w-4 h-4" />
                  Nada Pitch
                </button>
                <button
                  type="button"
                  onClick={() =>
                    playWordSpeech(speakingWord, {
                      slow: true,
                      withParticle: speakingUseParticle,
                    })
                  }
                  className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-[#0284C7] cursor-pointer"
                >
                  Pelan
                </button>
              </div>
            </div>

            {/* Target Pitch Contour + Live Mic Contour */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4 space-y-2">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Kontur Nada Target
                </div>
                <PitchDiagram
                  kana={speakingWord.kana}
                  accentNucleus={speakingWord.accentNucleus}
                  particle={speakingWord.particle ?? ''}
                  activeStep={
                    activePitchId === `speak-${speakingWord.id}`
                      ? activePitchStep
                      : null
                  }
                />
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4 space-y-2">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Kontur Nada Suaramu (Live Mikrofon)
                </div>
                {userPitchSvgPoints ? (
                  <div className="space-y-1.5">
                    <svg
                      viewBox="0 0 320 76"
                      className="w-full h-[84px] block"
                      role="img"
                      aria-label="Grafik kontur nada suara pengguna"
                    >
                      <line
                        x1={12}
                        y1={16}
                        x2={308}
                        y2={16}
                        stroke="currentColor"
                        strokeOpacity={0.12}
                        strokeDasharray="3 4"
                      />
                      <line
                        x1={12}
                        y1={60}
                        x2={308}
                        y2={60}
                        stroke="currentColor"
                        strokeOpacity={0.12}
                        strokeDasharray="3 4"
                      />
                      <polyline
                        fill="none"
                        stroke="#0F766E"
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={userPitchSvgPoints.points}
                      />
                    </svg>
                    <div className="flex items-center justify-between text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
                      <span>Rentang: {userPitchSvgPoints.minHz}–{userPitchSvgPoints.maxHz} Hz</span>
                      <span>Rata-rata: {userPitchSvgPoints.avgHz} Hz</span>
                    </div>
                  </div>
                ) : (
                  <div className="h-[104px] flex items-center justify-center text-center text-xs text-slate-400 dark:text-slate-500 px-4">
                    {isRecording
                      ? `Ucapkan "${speakingWord.kana}${
                          speakingUseParticle ? speakingWord.particle ?? '' : ''
                        }" sekarang dengan jelas...`
                      : 'Tekan "Rekam & Ucapkan" untuk melihat grafik naik-turun nada suaramu secara langsung.'}
                  </div>
                )}
              </div>
            </div>

            {/* Speaking Tip */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm space-y-1">
              <div className="font-semibold text-slate-900 dark:text-white">
                Panduan Pengucapan
              </div>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                {speakingWord.speakingTip} {speakingMouthTip}
              </p>
            </div>

            {/* Microphone Controls */}
            <div className="flex flex-wrap items-center gap-3">
              {!isRecording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="min-h-[46px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F766E] hover:bg-[#115E59] text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  Rekam &amp; Ucapkan
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleManualStopRecording}
                  className="min-h-[46px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  <Square className="w-4 h-4 fill-current" />
                  Berhenti Merekam
                </button>
              )}

              {recordedAudioUrl && (
                <button
                  type="button"
                  onClick={playRecordedSelf}
                  className="min-h-[46px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-[#0284C7] text-sm font-semibold cursor-pointer"
                >
                  <Play className="w-4 h-4" />
                  Putar Rekaman Saya
                </button>
              )}

              {(pitchSamples.length > 0 || recognizedText) && !isRecording && (
                <button
                  type="button"
                  onClick={() => {
                    setPitchSamples([]);
                    setRecognizedText(null);
                    setSpeechMatchStatus('idle');
                  }}
                  className="min-h-[46px] inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Ulangi
                </button>
              )}
            </div>

            {micError && (
              <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                <MicOff className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{micError}</span>
              </div>
            )}

            {/* Speech Recognition Result Card */}
            {(recognizedText || speechMatchStatus !== 'idle') && (
              <div
                className={`p-4 rounded-xl border space-y-1.5 text-sm ${
                  speechMatchStatus === 'matched'
                    ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30'
                    : speechMatchStatus === 'close'
                    ? 'border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30'
                    : speechMatchStatus === 'mismatch'
                    ? 'border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40'
                }`}
              >
                <div className="font-display font-bold text-slate-900 dark:text-white">
                  {speechMatchStatus === 'matched'
                    ? 'Pengucapan Terdeteksi Tepat!'
                    : speechMatchStatus === 'close'
                    ? 'Hampir Tepat — Perjelas Konsonan & Durasi Mora'
                    : speechMatchStatus === 'mismatch'
                    ? 'Coba Ucapkan Lagi Lebih Jelas'
                    : 'Rekaman Selesai — Bandingkan Grafik Nadamu'}
                </div>
                {recognizedText && (
                  <div className="text-xs text-slate-700 dark:text-slate-300">
                    Terdeteksi oleh pengenalan suara (ja-JP):{' '}
                    <strong className="font-jp text-sm text-slate-900 dark:text-white">
                      {recognizedText}
                    </strong>
                  </div>
                )}
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {speechMatchStatus === 'matched'
                    ? 'Bandingkan grafik kontur nada suaramu di atas dengan kontur target, lalu coba putar rekamanmu untuk mengecek apakah titik turun nadanya sudah sama.'
                    : !sttSupported || speechMatchStatus === 'no-stt'
                    ? 'Putar ulang rekamanmu lalu bandingkan bentuk naik-turun kurva suaramu dengan kontur target di sebelah kiri.'
                    : `Target: ${speakingWord.kanji} (${speakingWord.kana}). Putar tombol "Pelan" lalu ulangi pelan-pelan per ketukan mora.`}
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
};
