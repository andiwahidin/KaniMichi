import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  FileText,
  Headphones,
  Languages,
  PenTool,
  SlidersHorizontal,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  getLangGrammarLoader,
  getLangListeningLoader,
  getLangReadingLoader,
  getLangVocabLoader,
  enStudioLoader,
} from '../data/langPackLoader';
import { getLanguageDefinition } from '../data/languageRegistry';
import type { ActiveView } from '../types/curriculum';
import type { ExamTrackId } from '../types/language';
import { formatArabicDisplay } from '../utils/arabic';
import { speakText } from '../utils/audio';
import { openAiTutorWithPrompt } from './AiTutorDrawer';

interface LanguageWorkspaceHomeProps {
  lang: 'en' | 'ar';
}

export const LanguageWorkspaceHome: React.FC<LanguageWorkspaceHomeProps> = ({ lang }) => {
  const {
    state,
    now,
    setActiveView,
    setActiveExamTrack,
    setActiveLanguage,
    updateSettings,
    setSettingsOpen,
  } = useApp();

  const langDef = getLanguageDefinition(lang);
  const isAr = lang === 'ar';
  const showHarakat = state.settings.arabicShowHarakat ?? true;
  const englishAccent = state.settings.englishAccent ?? 'en-US';

  const [counts, setCounts] = useState({
    vocab: 0,
    grammar: 0,
    reading: 0,
    listening: 0,
    studio: 0,
  });

  useEffect(() => {
    let active = true;
    Promise.all([
      getLangVocabLoader(lang).loadManifest(),
      getLangGrammarLoader(lang).loadManifest(),
      getLangReadingLoader(lang).loadManifest(),
      getLangListeningLoader(lang).loadManifest(),
      lang === 'en' ? enStudioLoader.loadManifest() : Promise.resolve(null),
    ])
      .then(([v, g, r, l, s]) => {
        if (!active) return;
        setCounts({
          vocab: v.totalCount,
          grammar: g.totalCount,
          reading: r.totalCount,
          listening: l.totalCount,
          studio: s?.totalCount ?? 0,
        });
      })
      .catch(() => {
        // Manifest load errors handled inside individual hubs
      });
    return () => {
      active = false;
    };
  }, [lang]);

  const metrics = useMemo(() => {
    let vocabLearned = 0;
    let vocabDue = 0;
    let grammarLearned = 0;
    let grammarDue = 0;
    let burned = 0;

    for (const p of Object.values(state.langSrsProgress ?? {})) {
      if (p.lang !== lang) continue;
      if (p.srsStage === 9) burned += 1;
      const isDue =
        !state.settings.vacationMode &&
        p.srsStage >= 1 &&
        p.srsStage <= 8 &&
        p.nextReviewAt !== null &&
        p.nextReviewAt <= now;
      if (p.kind === 'vocab') {
        if (p.srsStage >= 1) vocabLearned += 1;
        if (isDue) vocabDue += 1;
      } else {
        if (p.srsStage >= 1) grammarLearned += 1;
        if (isDue) grammarDue += 1;
      }
    }

    let readingPassed = 0;
    let listeningPassed = 0;
    for (const r of Object.values(state.langPracticeProgress ?? {})) {
      if (r.lang !== lang) continue;
      if (r.kind === 'reading' && r.passed) readingPassed += 1;
      if (r.kind === 'listening' && r.passed) listeningPassed += 1;
    }

    const recentExams = (state.langMockExamHistory ?? []).filter((e) => e.lang === lang);
    const studioAttempts = lang === 'en' ? state.langStudioHistory ?? [] : [];

    return {
      vocabLearned,
      vocabDue,
      grammarLearned,
      grammarDue,
      burned,
      readingPassed,
      listeningPassed,
      recentExams,
      studioAttempts,
    };
  }, [
    lang,
    state.langSrsProgress,
    state.langPracticeProgress,
    state.langMockExamHistory,
    state.langStudioHistory,
    state.settings.vacationMode,
    now,
  ]);

  const moduleCards: {
    id: ActiveView;
    title: string;
    subtitle: string;
    metric: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'lang-vocab',
      title: isAr ? 'Mufradat & Akar Kata SRS' : 'Kosakata Akademik & Bisnis SRS',
      subtitle: isAr
        ? 'Kosakata Arab Fusha dengan akar 3 huruf, jamak, harakat, dan audio ar-SA.'
        : 'Academic Word List (TOEFL/IELTS) & Business Vocab (TOEIC) dengan IPA & kolokasi.',
      metric: `${metrics.vocabLearned}/${counts.vocab} dipelajari · ${metrics.vocabDue} review siap`,
      icon: <BookOpen className="w-5 h-5" />,
    },
    {
      id: 'lang-grammar',
      title: isAr ? 'Qawaid (Nahwu & Shorof)' : 'Grammar & Structure',
      subtitle: isAr
        ? 'Kaidah inti Nahwu-Shorof dan latihan Tarakib TOAFL dengan penjadwalan SRS.'
        : 'TOEFL ITP Structure & Error Identification, TOEIC Part 5–6 Cloze, & IELTS Cohesion.',
      metric: `${metrics.grammarLearned}/${counts.grammar} dikuasai · ${metrics.grammarDue} review siap`,
      icon: <Sparkles className="w-5 h-5" />,
    },
    {
      id: 'lang-reading',
      title: isAr ? "Qira'ah (Membaca RTL)" : 'Reading Comprehension',
      subtitle: isAr
        ? 'Wacana Fusha akademik & berita dengan toggle Harakat Penuh vs. Gundul.'
        : 'Wacana akademik TOEFL/IELTS (TFNG & Inference) serta dokumen bisnis TOEIC Part 7.',
      metric: `${metrics.readingPassed}/${counts.reading} wacana lulus`,
      icon: <FileText className="w-5 h-5" />,
    },
    {
      id: 'lang-listening',
      title: isAr ? "Istima' (Mendengarkan)" : 'Listening Comprehension',
      subtitle: isAr
        ? 'Dialog kampus, pengumuman, dan narasi Fusha dengan transkrip tersembunyi.'
        : 'Dialog pendek, kuliah kampus, & pengumuman kantor dengan suara US/UK.',
      metric: `${metrics.listeningPassed}/${counts.listening} trek lulus`,
      icon: <Headphones className="w-5 h-5" />,
    },
    {
      id: 'lang-studio' as ActiveView,
      title: isAr
        ? "Studio AI Insya' & Muhadatsah"
        : 'Studio AI Writing & Speaking',
      subtitle: isAr
        ? 'AI Agent pribadi untuk menilai karangan Fusha (Insya\') & rekaman percakapan (Muhadatsah) dengan koreksi Nahwu-Shorof dan memori perkembangan.'
        : 'AI Agent pribadi untuk menilai esai & rekaman suara IELTS/TOEFL iBT atau topik bebas dengan skor resmi, koreksi kalimat, dan memori akun.',
      metric: isAr
        ? `${metrics.studioAttempts.filter((a) => a.language === 'ar').length} evaluasi Arab tersimpan`
        : `${counts.studio} tugas + Topik Bebas · ${metrics.studioAttempts.length} evaluasi`,
      icon: <PenTool className="w-5 h-5" />,
    },
    {
      id: 'lang-exam',
      title: isAr ? 'Simulasi Ujian TOAFL Resmi' : 'Simulasi TOEFL · IELTS · TOEIC',
      subtitle: isAr
        ? '3 sesi resmi (Istima\', Tarakib, Qira\'ah) skala 310–677 dengan penanda standar UIN.'
        : 'Ujian berwaktu skala resmi: TOEFL ITP 310–677, TOEFL iBT 0–120, IELTS 0–9.0, TOEIC 10–990.',
      metric: `${metrics.recentExams.length} simulasi selesai`,
      icon: <Award className="w-5 h-5" />,
    },
  ];

  const handleTrackLaunch = (trackId: ExamTrackId) => {
    setActiveExamTrack(trackId);
    setActiveView('lang-exam');
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
      {/* Workspace Header */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setActiveLanguage('all', 'dashboard')}
              className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Beranda Gabungan
            </button>
            <span className="text-slate-400">/</span>
            <span className={`font-semibold ${langDef.accentTextClass}`}>
              {langDef.name}
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Workspace {langDef.name}
            </h1>
            <span
              dir={langDef.direction}
              className={`text-xl font-bold text-slate-400 dark:text-slate-500 ${
                isAr ? 'font-ar' : 'font-display'
              }`}
            >
              {langDef.nativeLabel}
            </span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            {langDef.summary}
          </p>
        </div>

        {/* Language-Specific Quick Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {isAr ? (
            <button
              type="button"
              onClick={() =>
                updateSettings({ arabicShowHarakat: !showHarakat })
              }
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 cursor-pointer"
            >
              <Languages className="w-4 h-4 text-[#059669]" />
              Harakat: <strong>{showHarakat ? 'Aktif (Penuh)' : 'Mati (Gundul)'}</strong>
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                updateSettings({
                  englishAccent: englishAccent === 'en-US' ? 'en-GB' : 'en-US',
                })
              }
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 cursor-pointer"
            >
              <Volume2 className="w-4 h-4 text-[#2563EB]" />
              Aksen Audio:{' '}
              <strong>{englishAccent === 'en-US' ? 'Amerika (US)' : 'Britania (UK)'}</strong>
            </button>
          )}

          <button
            type="button"
            onClick={() => openAiTutorWithPrompt(undefined, lang)}
            style={{ backgroundColor: langDef.accentHex }}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-white text-xs sm:text-sm font-semibold hover:opacity-95 transition-opacity cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            Tanya Tutor AI
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Pengaturan
          </button>
        </div>
      </section>

      {/* Arabic Harakat Live Demo Bar (Arabic workspace only) */}
      {isAr && (
        <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-[#059669] dark:text-emerald-400">
              Pratinjau Mode Baca Fusha RTL · {showHarakat ? 'Berharakat Lengkap' : 'Teks Gundul (Mode Ujian TOAFL)'}
            </div>
            <p
              dir="rtl"
              className="font-ar text-xl sm:text-2xl text-slate-900 dark:text-white"
            >
              {formatArabicDisplay(
                'مَنْ جَدَّ وَجَدَ، وَمَنْ طَلَبَ الْعِلْمَ بِإِخْلَاصٍ نَجَحَ بِتَفَوُّقٍ.',
                showHarakat
              )}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Siapa yang bersungguh-sungguh akan berhasil, dan siapa yang menuntut ilmu dengan ikhlas akan lulus dengan gemilang.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              speakText(
                'مَنْ جَدَّ وَجَدَ، وَمَنْ طَلَبَ الْعِلْمَ بِإِخْلَاصٍ نَجَحَ بِتَفَوُّقٍ.',
                'ar-SA',
                0.9
              )
            }
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 shrink-0 cursor-pointer"
          >
            <Volume2 className="w-4 h-4 text-[#059669]" />
            Dengar Fusha
          </button>
        </section>
      )}

      {/* Module Grid */}
      <section className="space-y-4">
        <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
          Modul Belajar {langDef.name}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {moduleCards.map((mod) => (
            <button
              key={mod.id}
              type="button"
              onClick={() => setActiveView(mod.id)}
              className="text-left bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 p-5 flex flex-col justify-between gap-4 transition-colors cursor-pointer"
            >
              <div className="space-y-2.5">
                <div className={`inline-flex p-2.5 rounded-lg ${langDef.accentSoftClass} ${langDef.accentTextClass}`}>
                  {mod.icon}
                </div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {mod.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {mod.subtitle}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                <span className="font-mono-num text-slate-500 dark:text-slate-400">
                  {mod.metric}
                </span>
                <span className={`font-semibold inline-flex items-center gap-1 ${langDef.accentTextClass}`}>
                  Buka <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Exam Tracks & Official Benchmarks */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Jalur Sertifikasi &amp; Ambang Skor Resmi
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {langDef.examTracks.map((track) => {
            const best = metrics.recentExams
              .filter((e) => e.examTrack === track.id)
              .sort((a, b) => b.scaledTotal - a.scaledTotal)[0];

            return (
              <div
                key={track.id}
                className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                      {track.name}
                    </h3>
                    <span className="font-mono-num text-xs text-slate-500 dark:text-slate-400">
                      {track.scoreRangeLabel}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {track.summary}
                  </p>
                  <div className="pt-2 space-y-1">
                    {track.passingBenchmarks.map((bm) => (
                      <div
                        key={bm.label}
                        className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400"
                      >
                        <span>{bm.label}</span>
                        <span className="font-mono-num font-semibold text-slate-900 dark:text-white">
                          {bm.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                  <span className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
                    {best ? `Skor terbaik: ${best.scaledLabel}` : 'Belum ada riwayat skor'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleTrackLaunch(track.id)}
                    style={{ backgroundColor: langDef.accentHex }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-95 cursor-pointer"
                  >
                    Simulasi {track.shortName}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
};
