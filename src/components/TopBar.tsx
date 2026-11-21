import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ActiveView } from '../types/curriculum';
import { PWAInstallButton } from './PWAInstallButton';

const BASE_NAV_ITEMS: { id: ActiveView; label: string }[] = [
  { id: 'dashboard', label: 'Beranda' },
  { id: 'levels', label: 'Level' },
  { id: 'radicals', label: 'Radikal' },
  { id: 'kanji', label: 'Kanji' },
  { id: 'vocabulary', label: 'Kosakata' },
  { id: 'grammar', label: 'Grammar' },
  { id: 'writing', label: 'Menulis' },
  { id: 'pronunciation', label: 'Pelafalan' },
];

export const TopBar: React.FC = () => {
  const {
    activeView,
    setActiveView,
    availableReviews,
    lessonQueue,
    cloudUser,
    isAdmin,
    openAuthModal,
  } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handlePrimaryAction = () => {
    setMobileMenuOpen(false);
    if (availableReviews.length > 0) {
      setActiveView('review');
    } else if (lessonQueue.length > 0) {
      setActiveView('lesson');
    } else {
      setActiveView('levels');
    }
  };

  const primaryLabel =
    availableReviews.length > 0
      ? `Review (${availableReviews.length})`
      : lessonQueue.length > 0
      ? `Pelajaran (${lessonQueue.length})`
      : 'Jelajahi Level';

  return (
    <header className="sticky top-0 z-30 safe-top bg-white/95 dark:bg-[#161A22]/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-6 lg:gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => {
            setActiveView('dashboard');
            setMobileMenuOpen(false);
          }}
          className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0284C7] cursor-pointer"
        >
          KaniMichi
        </button>

        {/* Zone 2: Concise Single-Line Text Nav Links */}
        <nav
          aria-label="Navigasi utama"
          className="hidden lg:flex items-center gap-4 xl:gap-6 text-sm font-medium"
        >
          {BASE_NAV_ITEMS.map((item) => {
            const isActive =
              activeView === item.id ||
              (item.id === 'vocabulary' && activeView === 'kana-vocab');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
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
                    className="absolute left-0 right-0 -bottom-[21px] h-0.5 bg-[#0284C7]"
                  />
                )}
              </button>
            );
          })}

          {isAdmin ? (
            <button
              type="button"
              onClick={() => setActiveView('admin')}
              className={`relative py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7C3AED] ${
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
              className={`relative py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0284C7] ${
                activeView === 'profile'
                  ? 'text-slate-950 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              Profil
              {activeView === 'profile' && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 right-0 -bottom-[21px] h-0.5 bg-[#0284C7]"
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

        {/* Zone 3: Install App + Single Primary Action + Mobile Menu Trigger */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <PWAInstallButton variant="topbar" />

          <button
            type="button"
            onClick={handlePrimaryAction}
            className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-white bg-[#0284C7] hover:bg-[#0369A1] rounded-lg transition-colors whitespace-nowrap shrink-0 font-mono-num cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0284C7]"
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
        {BASE_NAV_ITEMS.map((item) => {
          const isActive =
            activeView === item.id ||
            (item.id === 'vocabulary' && activeView === 'kana-vocab');
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveView(item.id)}
              className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[#0284C7] text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
              }`}
            >
              {item.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setActiveView('reading')}
          className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
            activeView === 'reading'
              ? 'bg-[#0284C7] text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
          }`}
        >
          Dokkai
        </button>
        <button
          type="button"
          onClick={() => setActiveView('listening')}
          className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
            activeView === 'listening'
              ? 'bg-[#0284C7] text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
          }`}
        >
          Chōkai
        </button>
        <button
          type="button"
          onClick={() => setActiveView('mock-exam')}
          className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
            activeView === 'mock-exam'
              ? 'bg-[#0284C7] text-white'
              : 'text-[#0284C7] dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-slate-800'
          }`}
        >
          Mogi Shiken
        </button>
      </nav>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] px-4 py-3">
          <nav className="flex flex-col gap-1">
            {BASE_NAV_ITEMS.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveView(item.id);
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

            <button
              type="button"
              onClick={() => {
                setActiveView('kana-vocab');
                setMobileMenuOpen(false);
              }}
              className={`text-left px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeView === 'kana-vocab'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-950 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              Kosakata Non-Kanji (Kana JLPT)
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveView('reading');
                setMobileMenuOpen(false);
              }}
              className={`text-left px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeView === 'reading'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-950 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              Membaca (Dokkai JLPT)
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveView('listening');
                setMobileMenuOpen(false);
              }}
              className={`text-left px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeView === 'listening'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-950 dark:text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              Mendengarkan (Chōkai JLPT)
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveView('mock-exam');
                setMobileMenuOpen(false);
              }}
              className={`text-left px-3 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                activeView === 'mock-exam'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-950 dark:text-white'
                  : 'text-[#0284C7] hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              Simulasi Ujian (Mogi Shiken N5–N1)
            </button>

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
                  className={`text-left px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    activeView === 'profile'
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-950 dark:text-white font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  Profil Saya
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView('admin');
                      setMobileMenuOpen(false);
                    }}
                    className={`text-left px-3 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                      activeView === 'admin'
                        ? 'bg-[#7C3AED]/10 text-[#7C3AED] dark:text-violet-400'
                        : 'text-[#7C3AED] dark:text-violet-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
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
