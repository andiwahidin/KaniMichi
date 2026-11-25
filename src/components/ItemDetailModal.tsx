import React, { useEffect, useMemo, useState } from 'react';
import { Volume2, X, Plus, RotateCcw, ArrowRight, PenTool, Mic } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getLevelMeta } from '../data/curriculum';
import { getItemSpeechText, speakJapanese } from '../utils/audio';
import { resolvePitchAccent } from '../utils/pitchResolver';
import { AiExplainButton } from './AiExplainButton';
import { PronunciationCard, type HomophoneRef } from './PronunciationCard';
import {
  formatRelativeTime,
  getAccuracyPercent,
  getItemTypeLabel,
  getProgressOrDefault,
  SRS_STAGE_NAMES,
} from '../utils/srs';
import { translateSync, useAutoTranslateCurriculumItems } from '../utils/idTranslator';

export const ItemDetailModal: React.FC = () => {
  const {
    dataset,
    state,
    now,
    selectedItemId,
    openItemDetail,
    closeItemDetail,
    openWritingPractice,
    openPronunciationPractice,
    updateUserNotes,
    resurrectBurnedItem,
  } = useApp();

  const item = selectedItemId ? dataset.byId[selectedItemId] : null;
  const progress = selectedItemId ? getProgressOrDefault(state, selectedItemId) : null;

  const relatedItemsToTranslate = useMemo(() => {
    if (!item) return [];
    const comps = (item.componentIds ?? []).map((id) => dataset.byId[id]).filter(Boolean);
    const deps = (dataset.dependentsById[item.id] ?? []).slice(0, 16);
    return [item, ...comps, ...deps];
  }, [dataset.byId, dataset.dependentsById, item]);
  useAutoTranslateCurriculumItems(relatedItemsToTranslate);

  const [newSynonym, setNewSynonym] = useState('');
  const [meaningNote, setMeaningNote] = useState('');
  const [readingNote, setReadingNote] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);

  useEffect(() => {
    if (progress) {
      setMeaningNote(progress.meaningNote);
      setReadingNote(progress.readingNote);
      setNewSynonym('');
      setNotesSaved(false);
    }
  }, [selectedItemId, progress?.meaningNote, progress?.readingNote]);

  useEffect(() => {
    if (!selectedItemId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeItemDetail();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedItemId, closeItemDetail]);

  const primaryReading =
    item?.type === 'vocabulary' ? item.readings?.[0] ?? '' : '';

  const vocabHomophones = useMemo<HomophoneRef[]>(() => {
    if (!item || item.type !== 'vocabulary' || !primaryReading) return [];
    const results: HomophoneRef[] = [];
    for (const v of dataset.byType.vocabulary) {
      if (v.id === item.id || v.characters === item.characters) continue;
      if (v.readings?.includes(primaryReading)) {
        const res = resolvePitchAccent(v.characters, primaryReading, v.partOfSpeech);
        results.push({
          id: v.id,
          kanji: v.characters,
          kana: primaryReading,
          meaning: v.primaryMeaning,
          accentNucleus: res.accentNucleus,
          onSelect: () => openItemDetail(v.id),
        });
        if (results.length >= 6) break;
      }
    }
    return results;
  }, [dataset.byType.vocabulary, item, openItemDetail, primaryReading]);

  if (!item || !progress) return null;

  const itemMeta = getLevelMeta(item.level);

  const vocabPronunciationTarget =
    item.type === 'vocabulary' && primaryReading
      ? {
          id: item.id,
          kanji: item.characters,
          kana: primaryReading,
          meaning: item.primaryMeaning,
          partOfSpeech: item.partOfSpeech,
          sourceLabel: `${itemMeta.jlpt} · Bab ${itemMeta.unitInTier}`,
          exampleJp: item.contextSentences?.[0]?.jp,
          exampleReading: item.contextSentences?.[0]?.reading,
          exampleTranslation: translateSync(item.contextSentences?.[0]?.en),
        }
      : null;

  const headerBg =
    item.type === 'radical'
      ? 'bg-[#0284C7]'
      : item.type === 'kanji'
      ? 'bg-[#DB2777]'
      : 'bg-[#7C3AED]';

  const components = (item.componentIds ?? [])
    .map((id) => dataset.byId[id])
    .filter(Boolean);

  const dependents = (dataset.dependentsById[item.id] ?? []).slice(0, 16);
  const totalDependents = (dataset.dependentsById[item.id] ?? []).length;
  const accuracy = getAccuracyPercent(progress);
  const stageLabel =
    progress.srsStage === null ? 'Terkunci' : SRS_STAGE_NAMES[progress.srsStage];

  const primaryAudioText = getItemSpeechText(item);

  const handleAddSynonym = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newSynonym.trim();
    if (!cleaned) return;
    if (!progress.userSynonyms.includes(cleaned)) {
      updateUserNotes(item.id, {
        userSynonyms: [...progress.userSynonyms, cleaned],
      });
    }
    setNewSynonym('');
  };

  const handleRemoveSynonym = (syn: string) => {
    updateUserNotes(item.id, {
      userSynonyms: progress.userSynonyms.filter((s) => s !== syn),
    });
  };

  const handleSaveNotes = () => {
    updateUserNotes(item.id, { meaningNote, readingNote });
    setNotesSaved(true);
    window.setTimeout(() => setNotesSaved(false), 1800);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Detail ${getItemTypeLabel(item.type)} ${item.characters}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4 sm:p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeItemDetail();
      }}
    >
      <div className="w-full max-w-3xl bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Colored Item Banner */}
        <div className={`${headerBg} text-white px-4 sm:px-6 py-4 sm:py-6 flex items-start justify-between gap-3 sm:gap-4`}>
          <div className="flex items-center gap-3 sm:gap-5 min-w-0">
            <div className="font-jp text-4xl sm:text-6xl font-bold leading-none select-all shrink-0 max-w-[40%] break-words">
              {item.characters}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-white/85 flex flex-wrap items-center gap-2">
                <span className="font-mono-num">
                  {itemMeta.jlpt} · Bab {itemMeta.unitInTier}
                </span>
                <span aria-hidden="true">·</span>
                <span>{getItemTypeLabel(item.type)}</span>
                {item.partOfSpeech && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{item.partOfSpeech}</span>
                  </>
                )}
                {item.strokes ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-num">{item.strokes} goresan</span>
                  </>
                ) : null}
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold mt-1 leading-tight">
                {item.primaryMeaning}
              </h2>
              <div className="text-xs text-white/85 mt-1.5 flex flex-wrap items-center gap-2">
                <span>Status SRS: {stageLabel}</span>
                {progress.nextReviewAt && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Review {formatRelativeTime(progress.nextReviewAt, now)}</span>
                  </>
                )}
                {accuracy !== null && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-num">Akurasi {accuracy}%</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {item.type === 'kanji' && (
              <button
                type="button"
                onClick={() => openWritingPractice(item.characters)}
                title="Latih menulis urutan goresan kanji ini"
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
              >
                <PenTool className="w-4 h-4" />
                <span className="hidden sm:inline">Latih Menulis</span>
              </button>
            )}
            {vocabPronunciationTarget && (
              <button
                type="button"
                onClick={() => openPronunciationPractice(vocabPronunciationTarget)}
                title="Latih pengucapan & pitch accent kata ini"
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
              >
                <Mic className="w-4 h-4" />
                <span className="hidden sm:inline">Latih Ucap</span>
              </button>
            )}
            {primaryAudioText && (
              <button
                type="button"
                onClick={() => speakJapanese(primaryAudioText)}
                title="Putar pengucapan bahasa Jepang"
                className="p-2.5 rounded-lg bg-white/15 hover:bg-white/25 transition-colors cursor-pointer"
              >
                <Volume2 className="w-5 h-5" />
              </button>
            )}
            <button
              type="button"
              onClick={closeItemDetail}
              aria-label="Tutup detail"
              className="p-2.5 rounded-lg bg-white/15 hover:bg-white/25 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 sm:space-y-7 text-slate-800 dark:text-slate-200">
          {/* Component Hierarchy */}
          {components.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                {item.type === 'kanji' ? 'Kombinasi Radikal' : 'Komposisi Kanji'}
              </h3>
              <div className="flex flex-wrap items-center gap-2.5">
                {components.map((comp, idx) => (
                  <React.Fragment key={comp.id}>
                    {idx > 0 && (
                      <span className="text-slate-400 font-semibold" aria-hidden="true">
                        +
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => openItemDetail(comp.id)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 transition-colors cursor-pointer bg-slate-50 dark:bg-slate-800/60"
                    >
                      <span
                        className={`font-jp text-lg font-bold px-2 py-0.5 rounded text-white ${
                          comp.type === 'radical' ? 'bg-[#0284C7]' : 'bg-[#DB2777]'
                        }`}
                      >
                        {comp.characters}
                      </span>
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        {comp.primaryMeaning}
                      </span>
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </section>
          )}

          {/* Meaning & Mnemonic */}
          <section className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                Arti &amp; Mnemonik
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                Arti utama: <strong className="text-slate-900 dark:text-white">{item.primaryMeaning}</strong>
                {item.acceptedMeanings.length > 1 && (
                  <span> · Diterima: {item.acceptedMeanings.slice(0, 6).join(', ')}</span>
                )}
              </p>
              <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                {item.meaningMnemonic}
              </p>
            </div>
            <AiExplainButton
              language="ja"
              examContext={`JLPT ${itemMeta.jlpt} (${getItemTypeLabel(item.type)})`}
              content={`Item: ${item.characters} | Arti: ${item.primaryMeaning} | Bacaan: ${
                item.type === 'kanji'
                  ? `On: ${item.onyomi?.join(', ') || '-'} / Kun: ${item.kunyomi?.join(', ') || '-'}`
                  : item.readings?.join(', ') || '-'
              } | Mnemonik: ${item.meaningMnemonic}`}
              label="Terjemahkan & Jelaskan Lebih Mudah (AI)"
            />
          </section>

          {/* Readings (for Kanji & Vocabulary) */}
          {item.type !== 'radical' && (
            <section className="border-t border-slate-200 dark:border-slate-800 pt-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Cara Baca (Bacaan)
                </h3>
                {primaryAudioText && (
                  <button
                    type="button"
                    onClick={() => speakJapanese(primaryAudioText)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0284C7] hover:underline cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    Dengarkan Pelafalan
                  </button>
                )}
              </div>

              {item.type === 'kanji' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      On&apos;yomi {item.primaryReadingType === 'onyomi' ? '· Utama di Quiz' : ''}
                    </div>
                    <div className="font-jp text-lg font-semibold text-slate-900 dark:text-white mt-1">
                      {item.onyomi && item.onyomi.length > 0 ? item.onyomi.join('、 ') : '—'}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Kun&apos;yomi {item.primaryReadingType === 'kunyomi' ? '· Utama di Quiz' : ''}
                    </div>
                    <div className="font-jp text-lg font-semibold text-slate-900 dark:text-white mt-1">
                      {item.kunyomi && item.kunyomi.length > 0 ? item.kunyomi.join('、 ') : '—'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 mb-3">
                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Bacaan Hiragana</div>
                    <div className="font-jp text-xl font-semibold text-slate-900 dark:text-white mt-1">
                      {item.readings?.join('、 ')}
                    </div>
                  </div>
                  {vocabPronunciationTarget && (
                    <PronunciationCard
                      target={vocabPronunciationTarget}
                      homophones={vocabHomophones}
                      onPracticeSpeak={(t) => openPronunciationPractice(t)}
                    />
                  )}
                </div>
              )}

              {item.readingMnemonic && (
                <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                  {item.readingMnemonic}
                </p>
              )}
            </section>
          )}

          {/* Context Sentences for Vocabulary */}
          {item.contextSentences && item.contextSentences.length > 0 && (
            <section className="border-t border-slate-200 dark:border-slate-800 pt-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                Kalimat Contoh
              </h3>
              <div className="space-y-3">
                {item.contextSentences.map((sent, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <p className="font-jp text-base font-medium text-slate-900 dark:text-white">
                        {sent.jp}
                      </p>
                      <p className="font-jp text-xs text-slate-500 dark:text-slate-400">
                        {sent.reading}
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {translateSync(sent.en)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => speakJapanese(sent.reading || sent.jp, 0.88)}
                      title="Putar kalimat"
                      className="p-2 rounded-lg text-slate-500 hover:text-[#7C3AED] hover:bg-white dark:hover:bg-slate-700 transition-colors shrink-0 cursor-pointer"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Used In (Forward Hierarchy) */}
          {dependents.length > 0 && (
            <section className="border-t border-slate-200 dark:border-slate-800 pt-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {item.type === 'radical' ? 'Ditemukan di Kanji' : 'Ditemukan di Kosakata'}
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                  Menampilkan {dependents.length} dari {totalDependents}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {dependents.map((dep) => (
                  <button
                    key={dep.id}
                    type="button"
                    onClick={() => openItemDetail(dep.id)}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 transition-colors text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`font-jp text-lg font-bold px-2.5 py-1 rounded text-white shrink-0 ${
                          dep.type === 'kanji' ? 'bg-[#DB2777]' : 'bg-[#7C3AED]'
                        }`}
                      >
                        {dep.characters}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {dep.primaryMeaning}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {getLevelMeta(dep.level).jlpt} Bab {getLevelMeta(dep.level).unitInTier} ·{' '}
                          {dep.type === 'kanji'
                            ? dep.onyomi?.[0] ?? dep.kunyomi?.[0]
                            : dep.readings?.[0]}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* User Synonyms & Personal Notes */}
          <section className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                Sinonim Pengguna
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Tambahkan terjemahan pribadi agar diterima otomatis saat sesi Review.
              </p>
              <form onSubmit={handleAddSynonym} className="flex items-center gap-2 mb-2.5">
                <input
                  type="text"
                  value={newSynonym}
                  onChange={(e) => setNewSynonym(e.target.value)}
                  placeholder="Contoh: gunung berapi, puncak..."
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white focus:outline-none focus:border-[#0284C7]"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Tambah
                </button>
              </form>
              {progress.userSynonyms.length > 0 && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {progress.userSynonyms.map((syn) => (
                    <button
                      key={syn}
                      type="button"
                      onClick={() => handleRemoveSynonym(syn)}
                      title="Klik untuk menghapus sinonim"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/50 dark:hover:text-rose-300 transition-colors cursor-pointer"
                    >
                      <span>{syn}</span>
                      <X className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Catatan Mnemonik Arti
                </label>
                <textarea
                  rows={2}
                  value={meaningNote}
                  onChange={(e) => setMeaningNote(e.target.value)}
                  placeholder="Tulis pengingat pribadimu di sini..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white focus:outline-none focus:border-[#0284C7]"
                />
              </div>
              {item.type !== 'radical' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Catatan Mnemonik Bacaan
                  </label>
                  <textarea
                    rows={2}
                    value={readingNote}
                    onChange={(e) => setReadingNote(e.target.value)}
                    placeholder="Tulis asosiasi bunyi pribadimu..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white focus:outline-none focus:border-[#0284C7]"
                  />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={handleSaveNotes}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {notesSaved ? 'Catatan Tersimpan' : 'Simpan Catatan'}
              </button>

              {progress.srsStage === 9 && (
                <button
                  type="button"
                  onClick={() => resurrectBurnedItem(item.id)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  Bangkitkan dari Burned (Apprentice I)
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
