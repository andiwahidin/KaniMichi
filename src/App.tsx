import React, { lazy, Suspense, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { AppProvider, useApp } from './context/AppContext';
import { TopBar } from './components/TopBar';
import { Dashboard } from './components/Dashboard';
import { ItemDetailModal } from './components/ItemDetailModal';
import { SettingsModal } from './components/SettingsModal';
import { AuthModal } from './components/AuthModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { AiTutorDrawer } from './components/AiTutorDrawer';

const CurriculumBrowser = lazy(() =>
  import('./components/CurriculumBrowser').then((m) => ({
    default: m.CurriculumBrowser,
  }))
);
const LessonSession = lazy(() =>
  import('./components/LessonSession').then((m) => ({
    default: m.LessonSession,
  }))
);
const ReviewSession = lazy(() =>
  import('./components/ReviewSession').then((m) => ({
    default: m.ReviewSession,
  }))
);
const UserProfileView = lazy(() =>
  import('./components/UserProfileView').then((m) => ({
    default: m.UserProfileView,
  }))
);
const AdminPanel = lazy(() =>
  import('./components/AdminPanel').then((m) => ({
    default: m.AdminPanel,
  }))
);
const GrammarHub = lazy(() =>
  import('./components/GrammarHub').then((m) => ({
    default: m.GrammarHub,
  }))
);
const KanaVocabHub = lazy(() =>
  import('./components/KanaVocabHub').then((m) => ({
    default: m.KanaVocabHub,
  }))
);
const ReadingHub = lazy(() =>
  import('./components/ReadingHub').then((m) => ({
    default: m.ReadingHub,
  }))
);
const ListeningHub = lazy(() =>
  import('./components/ListeningHub').then((m) => ({
    default: m.ListeningHub,
  }))
);
const MockExamHub = lazy(() =>
  import('./components/MockExamHub').then((m) => ({
    default: m.MockExamHub,
  }))
);
const WritingHub = lazy(() =>
  import('./components/WritingHub').then((m) => ({
    default: m.WritingHub,
  }))
);
const PronunciationHub = lazy(() =>
  import('./components/PronunciationHub').then((m) => ({
    default: m.PronunciationHub,
  }))
);

const UnifiedHomeDashboard = lazy(() =>
  import('./components/UnifiedHomeDashboard').then((m) => ({
    default: m.UnifiedHomeDashboard,
  }))
);
const LanguageWorkspaceHome = lazy(() =>
  import('./components/LanguageWorkspaceHome').then((m) => ({
    default: m.LanguageWorkspaceHome,
  }))
);
const LanguageVocabSrsHub = lazy(() =>
  import('./components/LanguageVocabSrsHub').then((m) => ({
    default: m.LanguageVocabSrsHub,
  }))
);
const LanguageGrammarHub = lazy(() =>
  import('./components/LanguageGrammarHub').then((m) => ({
    default: m.LanguageGrammarHub,
  }))
);
const LanguageReadingHub = lazy(() =>
  import('./components/LanguageReadingHub').then((m) => ({
    default: m.LanguageReadingHub,
  }))
);
const LanguageListeningHub = lazy(() =>
  import('./components/LanguageListeningHub').then((m) => ({
    default: m.LanguageListeningHub,
  }))
);
const WritingSpeakingStudio = lazy(() =>
  import('./components/WritingSpeakingStudio').then((m) => ({
    default: m.WritingSpeakingStudio,
  }))
);
const MultiExamSimulatorHub = lazy(() =>
  import('./components/MultiExamSimulatorHub').then((m) => ({
    default: m.MultiExamSimulatorHub,
  }))
);

const ModuleLoadingFallback: React.FC = () => (
  <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
    <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-2">
      <div className="font-display text-base font-bold text-slate-900 dark:text-white">
        Memuat modul latihan...
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Menyiapkan tampilan dan materi belajar Leksika.
      </p>
    </div>
  </main>
);

const AppShell: React.FC = () => {
  const {
    activeLanguage,
    setActiveLanguage,
    activeView,
    extraStudyMode,
    setActiveView,
    selectedItemId,
    closeItemDetail,
    settingsOpen,
    setSettingsOpen,
    authModalOpen,
    closeAuthModal,
  } = useApp();
  const isFullStudySession =
    activeView === 'lesson' || activeView === 'review' || activeView === 'extra-study';
  const workspaceLang: 'en' | 'ar' = activeLanguage === 'ar' ? 'ar' : 'en';

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    let removeListener: (() => Promise<void>) | null = null;

    CapacitorApp.addListener('backButton', () => {
      if (selectedItemId) {
        closeItemDetail();
      } else if (settingsOpen) {
        setSettingsOpen(false);
      } else if (authModalOpen) {
        closeAuthModal();
      } else if (activeView !== 'dashboard') {
        if (
          activeView === 'lang-vocab' ||
          activeView === 'lang-grammar' ||
          activeView === 'lang-reading' ||
          activeView === 'lang-listening' ||
          activeView === 'lang-studio' ||
          activeView === 'lang-exam'
        ) {
          setActiveView('lang-home');
        } else {
          setActiveView('dashboard');
        }
      } else {
        void CapacitorApp.exitApp();
      }
    }).then((handle) => {
      if (disposed) {
        void handle.remove();
      } else {
        removeListener = () => handle.remove();
      }
    });

    return () => {
      disposed = true;
      if (removeListener) {
        void removeListener();
      }
    };
  }, [
    activeView,
    authModalOpen,
    closeAuthModal,
    closeItemDetail,
    selectedItemId,
    setActiveView,
    setSettingsOpen,
    settingsOpen,
  ]);

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip flex flex-col bg-[#F8F9FA] dark:bg-[#0F1115] text-slate-900 dark:text-slate-100">
      <TopBar />

      <div className="flex-1 min-w-0 w-full">
        {activeView === 'dashboard' && activeLanguage === 'ja' && <Dashboard />}
        <Suspense fallback={<ModuleLoadingFallback />}>
          {activeView === 'dashboard' && activeLanguage === 'all' && <UnifiedHomeDashboard />}
          {activeView === 'dashboard' &&
            (activeLanguage === 'en' || activeLanguage === 'ar') && (
              <LanguageWorkspaceHome lang={activeLanguage} />
            )}

          {/* Multi-language workspace views (English & Arabic) */}
          {activeView === 'lang-home' && <LanguageWorkspaceHome lang={workspaceLang} />}
          {activeView === 'lang-vocab' && <LanguageVocabSrsHub lang={workspaceLang} />}
          {activeView === 'lang-grammar' && <LanguageGrammarHub lang={workspaceLang} />}
          {activeView === 'lang-reading' && <LanguageReadingHub lang={workspaceLang} />}
          {activeView === 'lang-listening' && <LanguageListeningHub lang={workspaceLang} />}
          {activeView === 'lang-studio' && <WritingSpeakingStudio />}
          {activeView === 'lang-exam' && <MultiExamSimulatorHub lang={workspaceLang} />}

          {/* Existing Japanese / JLPT views (100% preserved) */}
          {activeView === 'levels' && <CurriculumBrowser mode="levels" />}
          {activeView === 'radicals' && <CurriculumBrowser mode="radicals" />}
          {activeView === 'kanji' && <CurriculumBrowser mode="kanji" />}
          {activeView === 'vocabulary' && <CurriculumBrowser mode="vocabulary" />}
          {activeView === 'kana-vocab' && <KanaVocabHub />}
          {activeView === 'grammar' && <GrammarHub />}
          {activeView === 'reading' && <ReadingHub />}
          {activeView === 'listening' && <ListeningHub />}
          {activeView === 'writing' && <WritingHub />}
          {activeView === 'pronunciation' && <PronunciationHub />}
          {activeView === 'mock-exam' && <MockExamHub />}
          {activeView === 'lesson' && <LessonSession />}
          {activeView === 'review' && <ReviewSession mode="srs" />}
          {activeView === 'extra-study' && (
            <ReviewSession mode="extra" extraMode={extraStudyMode} />
          )}
          {activeView === 'profile' && <UserProfileView />}
          {activeView === 'admin' && <AdminPanel />}
        </Suspense>
      </div>

      {!isFullStudySession && (
        <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left">
            <div>
              Leksika — Platform Belajar Multibahasa &amp; Sertifikasi Global (JLPT · TOEFL · IELTS ·
              TOEIC · TOAFL)
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {activeLanguage === 'ja' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveView('levels')}
                    className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Materi JLPT N5–N1
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('kanji')}
                    className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Kanji
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('kana-vocab')}
                    className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Kana JLPT
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('grammar')}
                    className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Grammar
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('reading')}
                    className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Dokkai
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('listening')}
                    className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Chōkai
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('mock-exam')}
                    className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Mogi Shiken
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveLanguage('all', 'dashboard')}
                    className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Beranda Gabungan
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveLanguage('ja', 'dashboard')}
                    className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Jepang · JLPT
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveLanguage('en', 'lang-home')}
                    className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Inggris · TOEFL/IELTS/TOEIC
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveLanguage('ar', 'lang-home')}
                    className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Arab · TOAFL
                  </button>
                </>
              )}
            </div>
          </div>
        </footer>
      )}

      <ItemDetailModal />
      <SettingsModal />
      <AuthModal />
      <AiTutorDrawer />
      <OfflineIndicator />
    </div>
  );
};

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Terjadi kesalahan saat memuat tampilan.',
    };
  }

  handleReset = () => {
    try {
      localStorage.removeItem('kanimichi_srs_state_v2');
    } catch {
      // Ignore storage restrictions
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] text-slate-900 p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h1 className="font-display text-xl font-bold">
              Gagal Memuat Leksika
            </h1>
            <p className="text-sm text-slate-600">{this.state.message}</p>
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 rounded-lg bg-[#0284C7] text-white text-sm font-semibold hover:bg-[#0369A1] cursor-pointer"
            >
              Muat Ulang Aplikasi
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </AppErrorBoundary>
  );
}
