import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  ArrowDown,
  Award,
  Check,
  ChevronRight,
  Clock,
  Home,
  Info,
  Volume2,
  XCircle,
} from 'lucide-react';
import { ReviewOutcome, useApp } from '../context/AppContext';
import { CurriculumItem, ExtraStudyMode } from '../types/curriculum';
import { speakJapanese } from '../utils/audio';
import {
  romajiToHiragana,
  validateMeaningAnswer,
  validateReadingAnswer,
} from '../utils/kana';
import { getItemTypeLabel, SRS_STAGE_NAMES } from '../utils/srs';

interface ReviewQuestion {
  item: CurriculumItem;
  kind: 'meaning' | 'reading';
}

interface ItemTracker {
  item: CurriculumItem;
  needsReading: boolean;
  meaningDone: boolean;
  readingDone: boolean;
  meaningErrors: number;
  readingErrors: number;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface ReviewSessionProps {
  mode: 'srs' | 'extra';
  extraMode?: ExtraStudyMode;
}

export const ReviewSession: React.FC<ReviewSessionProps> = ({ mode, extraMode }) => {
  const {
    dataset,
    state,
    availableReviews,
    submitItemReview,
    setActiveView,
    openItemDetail,
  } = useApp();

  // Select initial item pool once when entering the session
  const initialItems = useMemo<CurriculumItem[]>(() => {
    if (mode === 'srs') {
      return shuffle(availableReviews);
    }
    if (extraMode === 'recent-mistakes') {
      const mistakes = Object.entries(state.progress)
        .filter(([, p]) => p.lastIncorrectAt !== null)
        .sort((a, b) => (b[1].lastIncorrectAt ?? 0) - (a[1].lastIncorrectAt ?? 0))
        .map(([id]) => dataset.byId[id])
        .filter((i): i is CurriculumItem => Boolean(i));
      return mistakes.slice(0, 12);
    }
    if (extraMode === 'burned-items') {
      const burned = Object.entries(state.progress)
        .filter(([, p]) => p.srsStage === 9)
        .map(([id]) => dataset.byId[id])
        .filter((i): i is CurriculumItem => Boolean(i));
      return shuffle(burned).slice(0, 12);
    }
    // recently-learned
    return Object.entries(state.progress)
      .filter(([, p]) => p.startedAt !== null && p.srsStage !== null && p.srsStage >= 1)
      .sort((a, b) => (b[1].startedAt ?? 0) - (a[1].startedAt ?? 0))
      .map(([id]) => dataset.byId[id])
      .filter((i): i is CurriculumItem => Boolean(i))
      .slice(0, 12);
  }, []); // Intentionally captured at session start

  const [trackers, setTrackers] = useState<Record<string, ItemTracker>>(() => {
    const map: Record<string, ItemTracker> = {};
    for (const item of initialItems) {
      map[item.id] = {
        item,
        needsReading: item.type !== 'radical',
        meaningDone: false,
        readingDone: item.type === 'radical',
        meaningErrors: 0,
        readingErrors: 0,
      };
    }
    return map;
  });

  const [queue, setQueue] = useState<ReviewQuestion[]>(() => {
    const qs: ReviewQuestion[] = [];
    for (const item of initialItems) {
      qs.push({ item, kind: 'meaning' });
      if (item.type !== 'radical') {
        qs.push({ item, kind: 'reading' });
      }
    }
    return shuffle(qs);
  });

  const [wrapUpMode, setWrapUpMode] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [answerState, setAnswerState] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [srsToast, setSrsToast] = useState<{
    label: string;
    direction: 'up' | 'down';
  } | null>(null);

  const [outcomes, setOutcomes] = useState<ReviewOutcome[]>([]);
  const [extraDoneIds, setExtraDoneIds] = useState<{ id: string; hadError: boolean }[]>([]);
  const [answeredCorrectCount, setAnsweredCorrectCount] = useState(0);
  const [answeredTotalCount, setAnsweredTotalCount] = useState(0);
  const [sessionFinished, setSessionFinished] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const currentQuestion = queue[0];

  useEffect(() => {
    if (!sessionFinished && inputRef.current) {
      inputRef.current.focus();
    }
  }, [sessionFinished, queue.length, answerState]);

  // Keyboard shortcuts: F to toggle Item Info, J to replay audio, W for Wrap-up
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (sessionFinished || !currentQuestion) return;
      if (answerState !== 'idle') {
        if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          setShowInfo((v) => !v);
        } else if (e.key === 'j' || e.key === 'J') {
          e.preventDefault();
          const item = currentQuestion.item;
          const txt =
            item.type === 'vocabulary'
              ? item.readings?.[0]
              : item.type === 'kanji'
              ? item.primaryReadingType === 'kunyomi'
                ? item.kunyomi?.[0]
                : item.onyomi?.[0]
              : null;
          if (txt) speakJapanese(txt);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sessionFinished, currentQuestion, answerState]);

  const toggleWrapUp = () => {
    if (wrapUpMode) {
      setWrapUpMode(false);
      return;
    }
    setWrapUpMode(true);
    // Keep only started items + up to 5 active items
    const activeIds = new Set<string>();
    for (const q of queue) {
      const tr = trackers[q.item.id];
      if (tr && (tr.meaningDone || tr.readingDone)) {
        activeIds.add(q.item.id);
      }
    }
    for (const q of queue) {
      if (activeIds.size >= 5) break;
      activeIds.add(q.item.id);
    }
    setQueue((prev) => prev.filter((q) => activeIds.has(q.item.id)));
  };

  const triggerShake = (msg: string) => {
    setFeedbackMsg(msg);
    setShake(true);
    window.setTimeout(() => setShake(false), 360);
  };

  const handleInputChange = (val: string) => {
    if (answerState !== 'idle') return;
    if (currentQuestion?.kind === 'reading') {
      setInputValue(romajiToHiragana(val, false));
    } else {
      setInputValue(val);
    }
  };

  const advanceToNext = () => {
    if (!currentQuestion) return;
    const rest = queue.slice(1);
    if (answerState === 'correct') {
      if (rest.length === 0) {
        setSessionFinished(true);
        return;
      }
      setQueue(rest);
    } else {
      const insertAt = Math.min(rest.length, 3);
      setQueue([...rest.slice(0, insertAt), currentQuestion, ...rest.slice(insertAt)]);
    }
    setInputValue('');
    setAnswerState('idle');
    setFeedbackMsg(null);
    setShowInfo(false);
    setSrsToast(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentQuestion) return;

    if (answerState !== 'idle') {
      advanceToNext();
      return;
    }

    const item = currentQuestion.item;
    const userSynonyms = state.progress[item.id]?.userSynonyms ?? [];
    const result =
      currentQuestion.kind === 'meaning'
        ? validateMeaningAnswer(inputValue, item, userSynonyms)
        : validateReadingAnswer(inputValue, item);

    if (result.finalizedInput !== undefined) {
      setInputValue(result.finalizedInput);
    }

    if (result.status === 'shake') {
      triggerShake(result.message ?? 'Periksa kembali format jawabanmu.');
      return;
    }

    setAnsweredTotalCount((c) => c + 1);
    const prevTracker = trackers[item.id];

    if (result.status === 'correct' || result.status === 'typo-accepted') {
      setAnsweredCorrectCount((c) => c + 1);
      setAnswerState('correct');
      setFeedbackMsg(
        result.message ?? 'Benar! Tekan Enter untuk lanjut, atau F untuk info item.'
      );

      // Autoplay audio on correct reading
      if (currentQuestion.kind === 'reading' && state.settings.autoplayAudio) {
        const audioTxt =
          item.type === 'vocabulary'
            ? item.readings?.[0]
            : item.primaryReadingType === 'kunyomi'
            ? item.kunyomi?.[0]
            : item.onyomi?.[0];
        if (audioTxt) speakJapanese(audioTxt);
      }

      const updatedTracker: ItemTracker = {
        ...prevTracker,
        meaningDone:
          currentQuestion.kind === 'meaning' ? true : prevTracker.meaningDone,
        readingDone:
          currentQuestion.kind === 'reading' ? true : prevTracker.readingDone,
      };
      setTrackers((prev) => ({ ...prev, [item.id]: updatedTracker }));

      // If both meaning & reading (or radical meaning) are completed, finalize item!
      if (updatedTracker.meaningDone && updatedTracker.readingDone) {
        if (mode === 'srs') {
          const outcome = submitItemReview(
            item.id,
            updatedTracker.meaningErrors,
            updatedTracker.readingErrors
          );
          setOutcomes((prev) => [...prev, outcome]);
          const wentUp = outcome.newStage >= outcome.previousStage;
          setSrsToast({
            label: SRS_STAGE_NAMES[outcome.newStage],
            direction: wentUp ? 'up' : 'down',
          });
        } else {
          setExtraDoneIds((prev) => [
            ...prev,
            {
              id: item.id,
              hadError:
                updatedTracker.meaningErrors + updatedTracker.readingErrors > 0,
            },
          ]);
        }
      }
    } else {
      setAnswerState('incorrect');
      setShowInfo(true);
      const correctStr =
        currentQuestion.kind === 'meaning'
          ? item.primaryMeaning
          : item.type === 'vocabulary'
          ? item.readings?.join('、 ')
          : (item.primaryReadingType === 'kunyomi' ? item.kunyomi : item.onyomi)?.join(
              '、 '
            );
      setFeedbackMsg(`Belum tepat. Jawaban benar: ${correctStr}`);

      const updatedTracker: ItemTracker = {
        ...prevTracker,
        meaningErrors:
          currentQuestion.kind === 'meaning'
            ? prevTracker.meaningErrors + 1
            : prevTracker.meaningErrors,
        readingErrors:
          currentQuestion.kind === 'reading'
            ? prevTracker.readingErrors + 1
            : prevTracker.readingErrors,
      };
      setTrackers((prev) => ({ ...prev, [item.id]: updatedTracker }));
    }
  };

  // Empty Pool Fallback
  if (initialItems.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          {mode === 'srs'
            ? 'Tidak Ada Review Harian yang Menunggu'
            : 'Belum Ada Item untuk Mode Latihan Ini'}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {mode === 'srs'
            ? 'Semua item terjadwal sudah selesai. Cek Prakiraan Review di Beranda atau pelajari Pelajaran baru.'
            : 'Selesaikan beberapa sesi Pelajaran dan Review terlebih dahulu agar daftar latihan terisi.'}
        </p>
        <button
          type="button"
          onClick={() => setActiveView('dashboard')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0284C7] text-white text-sm font-semibold hover:bg-[#0369A1] cursor-pointer"
        >
          <Home className="w-4 h-4" />
          Kembali ke Beranda
        </button>
      </div>
    );
  }

  // SESSION SUMMARY SCREEN
  if (sessionFinished || !currentQuestion) {
    const accuracy =
      answeredTotalCount > 0
        ? Math.round((answeredCorrectCount / answeredTotalCount) * 100)
        : 100;

    const correctList =
      mode === 'srs'
        ? outcomes.filter((o) => o.meaningErrors + o.readingErrors === 0)
        : extraDoneIds.filter((e) => !e.hadError);

    const incorrectList =
      mode === 'srs'
        ? outcomes.filter((o) => o.meaningErrors + o.readingErrors > 0)
        : extraDoneIds.filter((e) => e.hadError);

    const allNewlyUnlocked =
      mode === 'srs'
        ? Array.from(new Set(outcomes.flatMap((o) => o.newlyUnlockedIds)))
        : [];
    const leveledUpTo =
      mode === 'srs'
        ? outcomes.reduce<number | null>(
            (acc, o) => (o.leveledUpTo ? Math.max(acc ?? 0, o.leveledUpTo) : acc),
            null
          )
        : null;

    return (
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        {leveledUpTo && (
          <div className="bg-[#0284C7] text-white rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Award className="w-10 h-10 shrink-0" />
              <div>
                <h2 className="font-display text-xl font-bold">
                  Selamat! Kamu Naik ke Level {leveledUpTo}
                </h2>
                <p className="text-sm text-white/90">
                  Lebih dari 90% Kanji level sebelumnya mencapai tahap Guru. Radikal Level {leveledUpTo} kini terbuka di Pelajaran!
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {mode === 'srs' ? 'Ringkasan Review Harian' : 'Ringkasan Latihan Tambahan'}
              </div>
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                Sesi Selesai
              </h1>
            </div>
            <div className="flex items-center gap-6 font-mono-num">
              <div className="text-right">
                <div className="text-xs text-slate-500 dark:text-slate-400">Akurasi</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {accuracy}%
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500 dark:text-slate-400">Selesai</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {mode === 'srs' ? outcomes.length : extraDoneIds.length}
                </div>
              </div>
            </div>
          </div>

          {/* Newly Unlocked Items */}
          {allNewlyUnlocked.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Item Baru Terbuka di Pelajaran ({allNewlyUnlocked.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {allNewlyUnlocked.map((id) => {
                  const item = dataset.byId[id];
                  if (!item) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => openItemDetail(id)}
                      className={`px-3 py-1.5 rounded-lg text-white font-jp font-bold text-sm flex items-center gap-1.5 cursor-pointer ${
                        item.type === 'radical'
                          ? 'bg-[#0284C7]'
                          : item.type === 'kanji'
                          ? 'bg-[#DB2777]'
                          : 'bg-[#7C3AED]'
                      }`}
                    >
                      <span>{item.characters}</span>
                      <span className="font-sans text-xs font-medium text-white/90">
                        {item.primaryMeaning}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Correct Items */}
          <div className="space-y-2.5">
            <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Dijawab Tepat ({correctList.length})
            </h3>
            {correctList.length === 0 ? (
              <p className="text-xs text-slate-500">Tidak ada item.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {mode === 'srs'
                  ? (correctList as ReviewOutcome[]).map((o) => {
                      const item = dataset.byId[o.itemId];
                      if (!item) return null;
                      return (
                        <button
                          key={o.itemId}
                          type="button"
                          onClick={() => openItemDetail(o.itemId)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-400 cursor-pointer bg-slate-50 dark:bg-slate-800/60"
                        >
                          <span
                            className={`font-jp font-bold text-white px-1.5 py-0.5 rounded text-sm ${
                              item.type === 'radical'
                                ? 'bg-[#0284C7]'
                                : item.type === 'kanji'
                                ? 'bg-[#DB2777]'
                                : 'bg-[#7C3AED]'
                            }`}
                          >
                            {item.characters}
                          </span>
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                            {SRS_STAGE_NAMES[o.newStage]}
                          </span>
                        </button>
                      );
                    })
                  : (correctList as { id: string }[]).map((entry) => {
                      const item = dataset.byId[entry.id];
                      if (!item) return null;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => openItemDetail(entry.id)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                        >
                          <span className="font-jp font-bold text-sm">{item.characters}</span>
                          <span className="text-xs text-slate-600 dark:text-slate-300">
                            {item.primaryMeaning}
                          </span>
                        </button>
                      );
                    })}
              </div>
            )}
          </div>

          {/* Incorrect Items */}
          {incorrectList.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-400">
                Perlu Diperkuat ({incorrectList.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {mode === 'srs'
                  ? (incorrectList as ReviewOutcome[]).map((o) => {
                      const item = dataset.byId[o.itemId];
                      if (!item) return null;
                      return (
                        <button
                          key={o.itemId}
                          type="button"
                          onClick={() => openItemDetail(o.itemId)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/30 cursor-pointer"
                        >
                          <span className="font-jp font-bold text-sm text-rose-900 dark:text-rose-200">
                            {item.characters}
                          </span>
                          <span className="text-xs text-rose-700 dark:text-rose-300">
                            {item.primaryMeaning} · {SRS_STAGE_NAMES[o.newStage]}
                          </span>
                        </button>
                      );
                    })
                  : (incorrectList as { id: string }[]).map((entry) => {
                      const item = dataset.byId[entry.id];
                      if (!item) return null;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => openItemDetail(entry.id)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 cursor-pointer"
                        >
                          <span className="font-jp font-bold text-sm">{item.characters}</span>
                          <span className="text-xs text-rose-700 dark:text-rose-300">
                            {item.primaryMeaning}
                          </span>
                        </button>
                      );
                    })}
              </div>
            </div>
          )}

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveView('dashboard')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-sm font-semibold cursor-pointer"
            >
              <Home className="w-4 h-4" />
              Kembali ke Beranda
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ACTIVE REVIEW STAGE
  const item = currentQuestion.item;
  const bannerColor =
    item.type === 'radical'
      ? 'bg-[#0284C7]'
      : item.type === 'kanji'
      ? 'bg-[#DB2777]'
      : 'bg-[#7C3AED]';

  const completedItemsCount =
    mode === 'srs' ? outcomes.length : extraDoneIds.length;
  const totalItemsInSession = initialItems.length;
  const progressPct = Math.round((completedItemsCount / Math.max(1, totalItemsInSession)) * 100);
  const liveAccuracy =
    answeredTotalCount > 0
      ? Math.round((answeredCorrectCount / answeredTotalCount) * 100)
      : 100;

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      {/* Progress Bar */}
      <div className="h-1 bg-slate-200 dark:bg-slate-800 w-full">
        <div
          className="h-full bg-[#0284C7] transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Character Banner */}
      <div className={`${bannerColor} text-white px-4 py-10 sm:py-14 relative`}>
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-white/85 mb-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setSessionFinished(true)}
              className="inline-flex items-center gap-1.5 hover:text-white cursor-pointer"
            >
              <Home className="w-4 h-4" />
              Akhiri Sesi
            </button>
            <button
              type="button"
              onClick={toggleWrapUp}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors cursor-pointer ${
                wrapUpMode ? 'bg-white text-slate-900 font-semibold' : 'bg-white/15 hover:bg-white/25 text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              {wrapUpMode ? 'Mode Akhiri Aktif' : 'Akhiri Cepat (5 Item)'}
            </button>
          </div>

          <div className="flex items-center gap-4 font-mono-num">
            <span>{mode === 'extra' ? 'Latihan Tambahan' : 'Review SRS'}</span>
            <span aria-hidden="true">·</span>
            <span>Akurasi {liveAccuracy}%</span>
            <span aria-hidden="true">·</span>
            <span>
              Selesai {completedItemsCount}/{totalItemsInSession}
            </span>
          </div>
        </div>

        <div className="max-w-3xl mx-auto text-center relative">
          <div className="text-xs font-medium text-white/85 mb-2">
            Level {item.level} · {getItemTypeLabel(item.type)}
          </div>
          <div className="font-jp text-6xl sm:text-8xl font-bold tracking-tight leading-none select-all">
            {item.characters}
          </div>

          {/* SRS Level Up/Down Floating Indicator */}
          {srsToast && (
            <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-black/30 text-white text-xs font-semibold">
              {srsToast.direction === 'up' ? (
                <ArrowUp className="w-3.5 h-3.5 text-emerald-300" />
              ) : (
                <ArrowDown className="w-3.5 h-3.5 text-rose-300" />
              )}
              <span>{srsToast.label}</span>
            </div>
          )}
        </div>
      </div>

      {/* Question Type Header Strip */}
      <div className="bg-slate-900 text-white py-3 px-4 text-center text-sm font-medium border-t border-white/10">
        {currentQuestion.kind === 'meaning' ? (
          <span>
            {getItemTypeLabel(item.type)} — <strong className="font-bold">Arti (Bahasa Inggris)</strong>
          </span>
        ) : (
          <span>
            {getItemTypeLabel(item.type)} —{' '}
            <strong className="font-bold">
              Bacaan{' '}
              {item.type === 'kanji'
                ? item.primaryReadingType === 'kunyomi'
                  ? "(Kun'yomi)"
                  : "(On'yomi)"
                : '(Hiragana)'}
            </strong>
          </span>
        )}
      </div>

      {/* Answer Input Area */}
      <div className="max-w-2xl w-full mx-auto px-4 py-8 flex-1 space-y-5">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className={`relative ${shake ? 'animate-shake' : ''}`}>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              readOnly={answerState !== 'idle'}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={
                currentQuestion.kind === 'meaning'
                  ? 'Ketik arti dalam Bahasa Inggris...'
                  : 'Ketik romaji (otomatis ke ひらがな)...'
              }
              className={`w-full text-center text-xl sm:text-2xl py-4 px-12 rounded-xl border-2 transition-colors focus:outline-none ${
                currentQuestion.kind === 'reading' ? 'font-jp' : 'font-body'
              } ${
                answerState === 'correct'
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : answerState === 'incorrect'
                  ? 'bg-rose-600 border-rose-600 text-white'
                  : 'bg-white dark:bg-[#161A22] border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:border-[#0284C7]'
              }`}
            />
            <button
              type="submit"
              aria-label="Kirim atau lanjutkan"
              className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-colors cursor-pointer ${
                answerState === 'idle'
                  ? 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  : 'text-white/90 hover:text-white'
              }`}
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {currentQuestion.kind === 'reading'
                ? 'IME Hiragana aktif: ketik romaji (mis. yama → やま, nn → ん)'
                : 'Ketik arti Bahasa Inggris, alternatif, atau sinonim pribadimu'}
            </span>
            <div className="flex items-center gap-3">
              {answerState !== 'idle' && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowInfo((v) => !v)}
                    className="inline-flex items-center gap-1 font-semibold text-[#0284C7] hover:underline cursor-pointer"
                  >
                    <Info className="w-3.5 h-3.5" />
                    Info Item (F)
                  </button>
                  {item.type !== 'radical' && (
                    <button
                      type="button"
                      onClick={() => {
                        const txt =
                          item.type === 'vocabulary'
                            ? item.readings?.[0]
                            : item.primaryReadingType === 'kunyomi'
                            ? item.kunyomi?.[0]
                            : item.onyomi?.[0];
                        if (txt) speakJapanese(txt);
                      }}
                      className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300 hover:text-[#0284C7] cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      Audio (J)
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </form>

        {feedbackMsg && (
          <div
            className={`px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2.5 ${
              answerState === 'correct'
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
                : answerState === 'incorrect'
                ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
                : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800'
            }`}
          >
            {answerState === 'correct' ? (
              <Check className="w-4 h-4 shrink-0" />
            ) : answerState === 'incorrect' ? (
              <XCircle className="w-4 h-4 shrink-0" />
            ) : null}
            <span>{feedbackMsg}</span>
          </div>
        )}

        {/* Expandable Item Info Drawer */}
        {showInfo && answerState !== 'idle' && (
          <div className="p-6 rounded-xl bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 space-y-4 text-sm">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Arti</div>
                <div className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  {item.primaryMeaning}
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                    {' '}
                    · {item.acceptedMeanings.slice(0, 4).join(', ')}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openItemDetail(item.id)}
                className="text-xs font-semibold text-[#0284C7] hover:underline whitespace-nowrap cursor-pointer"
              >
                Buka Halaman Penuh
              </button>
            </div>

            {item.type === 'kanji' && (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">On&apos;yomi: </span>
                  <span className="font-jp text-sm font-semibold text-slate-900 dark:text-white">
                    {item.onyomi?.join('、 ') || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Kun&apos;yomi: </span>
                  <span className="font-jp text-sm font-semibold text-slate-900 dark:text-white">
                    {item.kunyomi?.join('、 ') || '—'}
                  </span>
                </div>
              </div>
            )}

            {item.type === 'vocabulary' && (
              <div className="text-xs">
                <span className="text-slate-500 dark:text-slate-400">Bacaan: </span>
                <span className="font-jp text-base font-semibold text-slate-900 dark:text-white">
                  {item.readings?.join('、 ')}
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Mnemonik Arti
              </div>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                {item.meaningMnemonic}
              </p>
            </div>

            {item.readingMnemonic && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Mnemonik Bacaan
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  {item.readingMnemonic}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
