import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { TopBar } from './components/TopBar';
import { Dashboard } from './components/Dashboard';
import { CurriculumBrowser } from './components/CurriculumBrowser';
import { LessonSession } from './components/LessonSession';
import { ReviewSession } from './components/ReviewSession';
import { ItemDetailModal } from './components/ItemDetailModal';
import { SettingsModal } from './components/SettingsModal';

const AppShell: React.FC = () => {
  const { activeView, extraStudyMode, setActiveView } = useApp();
  const isFullStudySession =
    activeView === 'lesson' || activeView === 'review' || activeView === 'extra-study';

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FA] dark:bg-[#0F1115] text-slate-900 dark:text-slate-100">
      <TopBar />

      <div className="flex-1">
        {activeView === 'dashboard' && <Dashboard />}
        {activeView === 'levels' && <CurriculumBrowser mode="levels" />}
        {activeView === 'radicals' && <CurriculumBrowser mode="radicals" />}
        {activeView === 'kanji' && <CurriculumBrowser mode="kanji" />}
        {activeView === 'vocabulary' && <CurriculumBrowser mode="vocabulary" />}
        {activeView === 'lesson' && <LessonSession />}
        {activeView === 'review' && <ReviewSession mode="srs" />}
        {activeView === 'extra-study' && (
          <ReviewSession mode="extra" extraMode={extraStudyMode} />
        )}
      </div>

      {!isFullStudySession && (
        <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
            <div>
              KaniMichi — Pembelajaran Radikal, Kanji &amp; Kosakata Jepang berbasis SRS
            </div>
            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={() => setActiveView('levels')}
                className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                Hierarki Level
              </button>
              <button
                type="button"
                onClick={() => setActiveView('radicals')}
                className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                Radikal
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
                onClick={() => setActiveView('vocabulary')}
                className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                Kosakata
              </button>
            </div>
          </div>
        </footer>
      )}

      <ItemDetailModal />
      <SettingsModal />
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
      localStorage.removeItem('kanimichi_srs_state_v1');
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
              Gagal Memuat KaniMichi
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
