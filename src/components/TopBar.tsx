import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Globe, Menu, Sparkles, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ActiveView } from '../types/curriculum';
import type { ActiveLanguageScope } from '../types/language';
import { PWAInstallButton } from './PWAInstallButton';
import { openAiTutorWithPrompt } from './AiTutorDrawer';

interface NavLinkItem {
  id: ActiveView;
  label: string;
  targetLang?: ActiveLanguageScope;
  matchViews?: ActiveView[];
}

const LANGUAGE_OPTIONS: {
  id: ActiveLanguageScope;
  label: string;
  shortLabel: string;
  subtitle: string;
  accentDot: string;
}[] = [
  {
    id: 'all',
    label: 'Semua Bahasa',
    shortLabel: 'Semua',
    subtitle: 'Beranda Gabungan',
    accentDot: 'bg-[#0284C7]',
  },
  {
    id: 'ja',
    label: 'Bahasa Jepang',
    shortLabel: 'Jepang',
    subtitle: 'JLPT N5–N1 · Kurikulum Resmi',
    accentDot: 'bg-[#E11D48]',
  },
  {
    id: 'en',
    label: 'Bahasa Inggris',
    shortLabel: 'Inggris',
    subtitle: 'TOEFL · IELTS · TOEIC',
    accentDot: 'bg-[#2563EB]',
  },
  {
    id: 'ar',
    label: 'Bahasa Arab',
    shortLabel: 'Arab',
    subtitle: 'TOAFL · Fusha RTL',
    accentDot: 'bg-[#059669]',
  },
];

function getNavItemsForScope(scope: ActiveLanguageScope): NavLinkItem[] {
  switch (scope) {
    case 'ja':
      return [
        { id: 'dashboard', label: 'Beranda' },
        { id: 'levels', label: 'Materi N5–N1', matchViews: ['levels', 'radicals', 'kanji', 'vocabulary', 'kana-vocab'] },
        { id: 'grammar', label: 'Tata Bahasa' },
        { id: 'reading', label: 'Membaca' },
        { id: 'listening', label: 'Mendengar' },
        { id: 'mock-exam', label: 'Simulasi JLPT' },
      ];
    case 'en':
      return [
        { id: 'lang-home', label: 'Beranda' },
        { id: 'lang-vocab', label: 'Kosakata' },
        { id: 'lang-grammar', label: 'Tata Bahasa' },
        { id: 'lang-reading', label: 'Membaca' },
        { id: 'lang-listening', label: 'Mendengar' },
        { id: 'lang-studio', label: 'Studio AI' },
        { id: 'lang-exam', label: 'Simulasi' },
      ];
    case 'ar':
      return [
        { id: 'lang-home', label: 'Beranda' },
        { id: 'lang-vocab', label: 'Mufradat' },
        { id: 'lang-grammar', label: 'Qawaid' },
        { id: 'lang-reading', label: "Qira'ah" },
        { id: 'lang-listening', label: "Istima'" },
        { id: 'lang-exam', label: 'Simulasi TOAFL' },
      ];
    case 'all':
    default:
      return [
        { id: 'dashboard', label: 'Beranda', targetLang: 'all' },
        { id: 'dashboard', label: 'Jepang · JLPT', targetLang: 'ja' },
        { id: 'lang-home', label: 'Inggris · TOEFL/IELTS', targetLang: 'en' },
        { id: 'lang-home', label: 'Arab · TOAFL', targetLang: 'ar' },
      ];
  }
}

export const TopBar: React.FC = () => {
  const {
    state,
    now,
    activeLanguage,
    setActiveLanguage,
    activeView,
    setActiveView,
    availableReviews,
    lessonQueue,
    cloudUser,
    isAdmin,
    openAuthModal,
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        langDropdownRef.current &&
        !langDropdownRef.current.contains(e.target as Node)
      ) {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Compute due SRS reviews per scope
  const langDueCounts = React.useMemo(() => {
    let enDue = 0;
    let arDue = 0;
    if (!state.settings.vacationMode) {
      for (const p of Object.values(state.langSrsProgress ?? {})) {
        if (
          p.srsStage >= 1 &&
          p.srsStage <= 8 &&
          p.nextReviewAt !== null &&
          p.nextReviewAt <= now
        ) {
          if (p.lang === 'en') enDue += 1;
          else if (p.lang === 'ar') arDue += 1;
        }
      }
    }
    return { enDue, arDue };
  }, [state.langSrsProgress, state.settings.vacationMode, now]);

  const jaDue = availableReviews.length;
  const totalDueAll = jaDue + langDueCounts.enDue + langDueCounts.arDue;

  const currentLangMeta =
    LANGUAGE_OPTIONS.find((opt) => opt.id === activeLanguage) ?? LANGUAGE_OPTIONS[0];
  const navItems = getNavItemsForScope(activeLanguage);

  const accentBg =
    activeLanguage === 'ja'
      ? 'bg-[#E11D48] hover:bg-[#BE123C]'
      : activeLanguage === 'en'
      ? 'bg-[#2563EB] hover:bg-[#1D4ED8]'
      : activeLanguage === 'ar'
      ? 'bg-[#059669] hover:bg-[#047857]'
      : 'bg-[#0284C7] hover:bg-[#0369A1]';

  const accentBar =
    activeLanguage === 'ja'
      ? 'bg-[#E11D48]'
      : activeLanguage === 'en'
      ? 'bg-[#2563EB]'
      : activeLanguage === 'ar'
      ? 'bg-[#059669]'
      : 'bg-[#0284C7]';

  const handlePrimaryAction = () => {
    setMobileMenuOpen(false);
    if (activeLanguage === 'ja') {
      if (jaDue > 0) setActiveView('review');
      else if (lessonQueue.length > 0) setActiveView('lesson');
      else setActiveView('mock-exam');
      return;
    }
    if (activeLanguage === 'en') {
      if (langDueCounts.enDue > 0) setActiveView('lang-vocab');
      else setActiveView('lang-exam');
      return;
    }
    if (activeLanguage === 'ar') {
      if (langDueCounts.arDue > 0) setActiveView('lang-vocab');
      else setActiveView('lang-exam');
      return;
    }
    // Unified mode
    if (jaDue > 0) {
      setActiveLanguage('ja', 'review');
    } else if (langDueCounts.enDue > 0) {
      setActiveLanguage('en', 'lang-vocab');
    } else if (langDueCounts.arDue > 0) {
      setActiveLanguage('ar', 'lang-vocab');
    } else {
      setActiveLanguage('en', 'lang-exam');
    }
  };

  const primaryLabel =
    activeLanguage === 'ja'
      ? jaDue > 0
        ? `Review (${jaDue})`
        : lessonQueue.length > 0
        ? `Pelajaran (${lessonQueue.length})`
        : 'Mogi Shiken'
      : activeLanguage === 'en'
      ? langDueCounts.enDue > 0
        ? `Review EN (${langDueCounts.enDue})`
        : 'Simulasi Tes'
      : activeLanguage === 'ar'
      ? langDueCounts.arDue > 0
        ? `Review AR (${langDueCounts.arDue})`
        : 'Simulasi TOAFL'
      : totalDueAll > 0
      ? `Review (${totalDueAll})`
      : 'Mulai Simulasi';

  return (
    <header className="sticky top-0 z-30 safe-top bg-white/95 dark:bg-[#161A22]/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-6">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => {
            setActiveLanguage('all', 'dashboard');
            setMobileMenuOpen(false);
          }}
          className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0284C7] cursor-pointer"
        >
          Leksika
        </button>

        {/* Zone 2: Concise Adaptive Single-Line Text Nav Links */}
        <nav
          aria-label="Navigasi utama"
          className="hidden lg:flex items-center gap-5 xl:gap-6 text-sm font-medium"
        >
          {navItems.map((item) => {
            const isActive = item.targetLang
              ? activeLanguage === item.targetLang && activeView === item.id
              : item.matchViews
              ? item.matchViews.includes(activeView)
              : activeView === item.id;
            return (
              <button
                key={`${item.targetLang ?? activeLanguage}-${item.label}`}
                type="button"
                onClick={() => {
                  if (item.targetLang) {
                    setActiveLanguage(item.targetLang, item.id);
                  } else {
                    setActiveView(item.id);
                  }
                }}
                className={`relative py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0284C7] ${
                  isActive
                    ? 'text-slate-950 dark:text-white font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 right-0 -bottom-[21px] h-0.5 ${accentBar}`}
                  />
                )}
              </button>
            );
          })}

          {isAdmin ? (
            <button
              type="button"
              onClick={() => setActiveView('admin')}
              className={`relative py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeView === 'admin'
                  ? 'text-[#7C3AED] dark:text-violet-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-[#7C3AED] dark:hover:text-violet-400'
              }`}
            >
              Admin
              {activeView === 'admin' && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 right-0 -bottom-[21px] h-0.5 bg-[#7C3AED]"
                />
              )}
            </button>
          ) : cloudUser ? (
            <button
              type="button"
              onClick={() => setActiveView('profile')}
              className={`relative py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeView === 'profile'
                  ? 'text-slate-950 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              Profil
              {activeView === 'profile' && (
                <span
                  aria-hidden="true"
                  className={`absolute left-0 right-0 -bottom-[21px] h-0.5 ${accentBar}`}
                />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="relative py-1 whitespace-nowrap shrink-0 text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white transition-colors cursor-pointer"
            >
              Masuk
            </button>
          )}
        </nav>

        {/* Zone 3: Compact Language Switcher + Primary CTA + Mobile Trigger */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Header Language Switcher */}
          <div ref={langDropdownRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={langMenuOpen}
              onClick={() => setLangMenuOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap transition-colors cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
              <span>{currentLangMeta.shortLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {langMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-60 rounded-xl bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50"
              >
                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Pilih Jalur Bahasa
                </div>
                {LANGUAGE_OPTIONS.map((opt) => {
                  const selected = activeLanguage === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setActiveLanguage(opt.id);
                        setLangMenuOpen(false);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        selected
                          ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-950 dark:text-white'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${opt.accentDot}`} />
                          <span>{opt.label}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 pl-4">
                          {opt.subtitle}
                        </div>
                      </div>
                      {selected && (
                        <span className="text-[11px] font-semibold text-[#0284C7] dark:text-sky-400 shrink-0">
                          Aktif
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              openAiTutorWithPrompt('', activeLanguage);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 min-h-[36px] rounded-lg border border-sky-200 dark:border-sky-900 bg-sky-50/70 dark:bg-sky-950/30 hover:bg-sky-100/80 dark:hover:bg-sky-950/60 text-xs sm:text-sm font-semibold text-[#0284C7] dark:text-sky-300 whitespace-nowrap transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Tutor AI</span>
            <span className="sm:hidden">AI</span>
          </button>

          <PWAInstallButton variant="topbar" />

          <button
            type="button"
            onClick={handlePrimaryAction}
            className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-white rounded-lg transition-colors whitespace-nowrap shrink-0 font-mono-num cursor-pointer ${accentBg}`}
          >
            {primaryLabel}
          </button>

          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Tutup menu' : 'Buka menu'}
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="lg:hidden p-2 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Tablet Portrait Quick-Nav Strip (768px–1023px) */}
      <nav
        aria-label="Navigasi tablet"
        className="hidden md:flex lg:hidden items-center gap-1.5 px-6 py-2 border-t border-slate-100 dark:border-slate-800/80 overflow-x-auto no-scrollbar bg-slate-50/70 dark:bg-[#12161D]/80"
      >
        {navItems.map((item) => {
          const isActive = item.targetLang
            ? activeLanguage === item.targetLang && activeView === item.id
            : item.matchViews
            ? item.matchViews.includes(activeView)
            : activeView === item.id;
          return (
            <button
              key={`tab-${item.targetLang ?? activeLanguage}-${item.label}`}
              type="button"
              onClick={() => {
                if (item.targetLang) {
                  setActiveLanguage(item.targetLang, item.id);
                } else {
                  setActiveView(item.id);
                }
              }}
              className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                isActive
                  ? `${accentBar} text-white`
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] px-4 py-3 max-h-[80vh] overflow-y-auto">
          <nav className="flex flex-col gap-1">
            <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Menu {currentLangMeta.label}
            </div>
            {navItems.map((item) => {
              const isActive = item.targetLang
                ? activeLanguage === item.targetLang && activeView === item.id
                : activeView === item.id;
              return (
                <button
                  key={`mob-${item.targetLang ?? activeLanguage}-${item.label}`}
                  type="button"
                  onClick={() => {
                    if (item.targetLang) {
                      setActiveLanguage(item.targetLang, item.id);
                    } else {
                      setActiveView(item.id);
                    }
                    setMobileMenuOpen(false);
                  }}
                  className={`text-left px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-950 dark:text-white font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}

            {activeLanguage === 'ja' && (
              <>
                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Modul JLPT Lainnya
                </div>
                {(
                  [
                    ['radicals', 'Radikal'],
                    ['kanji', 'Kanji'],
                    ['vocabulary', 'Kosakata Kanji'],
                    ['kana-vocab', 'Kosakata Non-Kanji (Kana JLPT)'],
                    ['writing', 'Menulis (Kakitori)'],
                    ['pronunciation', 'Pelafalan & Pitch Accent'],
                  ] as [ActiveView, string][]
                ).map(([vId, vLabel]) => (
                  <button
                    key={vId}
                    type="button"
                    onClick={() => {
                      setActiveView(vId);
                      setMobileMenuOpen(false);
                    }}
                    className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeView === vId
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-950 dark:text-white font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {vLabel}
                  </button>
                ))}
              </>
            )}

            <div className="my-1.5 border-t border-slate-100 dark:border-slate-800" />

            <PWAInstallButton
              variant="drawer"
              onAfterAction={() => setMobileMenuOpen(false)}
            />

            {cloudUser ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('profile');
                    setMobileMenuOpen(false);
                  }}
                  className="text-left px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  Profil &amp; Skor Sertifikasi Saya
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView('admin');
                      setMobileMenuOpen(false);
                    }}
                    className="text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-[#7C3AED] dark:text-violet-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    Panel Admin
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openAuthModal('login');
                }}
                className="text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-[#0284C7] hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                Masuk / Daftar Akun
              </button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
};
