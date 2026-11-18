import React, { useState } from 'react';
import {
  X,
  Download,
  Upload,
  FastForward,
  RotateCcw,
  Sun,
  Moon,
  Plane,
  Cloud,
  RefreshCw,
  LogOut,
} from 'lucide-react';
import { MAX_LEVEL } from '../data/curriculum';
import { useApp } from '../context/AppContext';

export const SettingsModal: React.FC = () => {
  const {
    state,
    settingsOpen,
    setSettingsOpen,
    updateSettings,
    toggleVacationMode,
    fastForwardTime,
    forceAllReviewsDue,
    jumpToLevel,
    resetProgress,
    importStateJson,
    isSupabaseEnabled,
    cloudUser,
    cloudSyncing,
    lastCloudSyncAt,
    cloudError,
    signInWithEmail,
    signUpWithEmail,
    signOutCloud,
    syncNow,
  } = useApp();

  const [importText, setImportText] = useState('');
  const [targetLevel, setTargetLevel] = useState<number>(state.currentLevel);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<'fresh' | 'starter' | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  if (!settingsOpen) return null;

  const notify = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 2600);
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kanimichi-backup-lv${state.currentLevel}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('File cadangan progres berhasil diunduh.');
  };

  const handleImport = () => {
    if (!importText.trim()) return;
    const res = importStateJson(importText);
    if (res.ok) {
      setImportText('');
      notify('Progres berhasil dipulihkan dari JSON.');
    } else {
      notify(res.error ?? 'Gagal mengimpor data.');
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail.trim() || !authPassword) return;
    setAuthBusy(true);
    const res =
      authMode === 'signin'
        ? await signInWithEmail(authEmail, authPassword)
        : await signUpWithEmail(authEmail, authPassword);
    setAuthBusy(false);
    if (res.ok) {
      setAuthPassword('');
    }
    if (res.message) {
      notify(res.message);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pengaturan & Simulasi SRS"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4 sm:p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) setSettingsOpen(false);
      }}
    >
      <div className="w-full max-w-xl bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Pengaturan &amp; Kontrol SRS
          </h2>
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            aria-label="Tutup pengaturan"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          {feedback && (
            <div className="px-4 py-2.5 rounded-lg bg-[#0284C7]/10 text-[#0284C7] dark:text-sky-300 font-medium">
              {feedback}
            </div>
          )}

          {/* Supabase Account & Cloud Sync */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-[#0284C7]" />
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Akun &amp; Sinkronisasi Cloud (Supabase)
              </h3>
            </div>

            {!isSupabaseEnabled ? (
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
                <p className="text-slate-800 dark:text-slate-200 font-medium">
                  Mode Penyimpanan Lokal Aktif
                </p>
                <p>
                  Progres belajarmu aman tersimpan otomatis di browser ini. Untuk sinkronisasi lintas perangkat lewat Supabase, jalankan{' '}
                  <code className="font-mono-num text-[11px] px-1 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800">
                    supabase/schema.sql
                  </code>{' '}
                  lalu atur environment{' '}
                  <code className="font-mono-num text-[11px] px-1 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800">
                    VITE_SUPABASE_URL
                  </code>{' '}
                  dan{' '}
                  <code className="font-mono-num text-[11px] px-1 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800">
                    VITE_SUPABASE_ANON_KEY
                  </code>
                  .
                </p>
              </div>
            ) : cloudUser ? (
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Masuk sebagai
                    </div>
                    <div className="font-medium text-slate-900 dark:text-white truncate">
                      {cloudUser.email}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {cloudSyncing
                        ? 'Menyinkronkan progres ke Supabase...'
                        : lastCloudSyncAt
                        ? `Terakhir sinkron: ${new Date(lastCloudSyncAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}`
                        : 'Sinkronisasi otomatis aktif'}
                    </div>
                  </div>
                </div>
                {cloudError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400">
                    {cloudError}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={cloudSyncing}
                    onClick={async () => {
                      const res = await syncNow();
                      if (res.message) notify(res.message);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0284C7] text-white hover:bg-[#0369A1] disabled:opacity-60 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${cloudSyncing ? 'animate-spin' : ''}`} />
                    Sinkronkan Sekarang
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await signOutCloud();
                      notify('Berhasil keluar dari akun cloud.');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Keluar
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleAuthSubmit}
                className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3"
              >
                <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg w-fit">
                  <button
                    type="button"
                    onClick={() => setAuthMode('signin')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      authMode === 'signin'
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Masuk
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode('signup')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      authMode === 'signup'
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Daftar Akun
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Kata sandi (min. 6 karakter)"
                    className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Progres SRS tersimpan otomatis ke database Supabase milikmu.
                  </span>
                  <button
                    type="submit"
                    disabled={authBusy}
                    className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#0284C7] text-white hover:bg-[#0369A1] disabled:opacity-60 cursor-pointer whitespace-nowrap"
                  >
                    {authBusy
                      ? 'Memproses...'
                      : authMode === 'signin'
                      ? 'Masuk'
                      : 'Buat Akun'}
                  </button>
                </div>
              </form>
            )}
          </section>

          {/* Study Preferences */}
          <section className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-4">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Preferensi Belajar
            </h3>

            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-slate-800 dark:text-slate-200">
                  Ukuran Batch Pelajaran
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Jumlah item per sesi sebelum kuis pelajaran dimulai
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0">
                {([3, 5, 7] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => updateSettings({ lessonBatchSize: size })}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md font-mono-num transition-colors cursor-pointer ${
                      state.settings.lessonBatchSize === size
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-slate-800 dark:text-slate-200">
                  Putar Audio Otomatis
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Otomatis melafalkan bacaan Jepang setelah jawaban bacaan benar
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateSettings({ autoplayAudio: !state.settings.autoplayAudio })
                }
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  state.settings.autoplayAudio
                    ? 'bg-[#0284C7] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {state.settings.autoplayAudio ? 'Aktif' : 'Nonaktif'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-slate-800 dark:text-slate-200">
                  Tema Tampilan
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Pilih mode terang (kertas washi) atau mode gelap malam hari
                </div>
              </div>
              <button
                type="button"
                onClick={() => updateSettings({ darkMode: !state.settings.darkMode })}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                {state.settings.darkMode ? (
                  <>
                    <Sun className="w-3.5 h-3.5" /> Mode Terang
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5" /> Mode Gelap
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-slate-800 dark:text-slate-200">
                  Mode Libur (Vacation Mode)
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Bekukan seluruh jadwal review SRS agar tumpukan tidak bertambah
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  toggleVacationMode();
                  notify(
                    state.settings.vacationMode
                      ? 'Mode Libur dinonaktifkan. Jadwal SRS dilanjutkan.'
                      : 'Mode Libur diaktifkan. Semua timer SRS dibekukan.'
                  );
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  state.settings.vacationMode
                    ? 'bg-amber-600 text-white'
                    : 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Plane className="w-3.5 h-3.5" />
                {state.settings.vacationMode ? 'Sedang Libur' : 'Aktifkan'}
              </button>
            </div>
          </section>

          {/* Time Simulation & Level Jump */}
          <section className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-4">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Simulasi Waktu &amp; Lompat Level (1–{MAX_LEVEL})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Percepat jadwal review atau buka langsung level lanjutan (1–60) sesuai kemampuan kanjimu saat ini.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  fastForwardTime(4);
                  notify('Jadwal SRS dimajukan +4 jam.');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <FastForward className="w-3.5 h-3.5" />
                Majukan +4 Jam
              </button>
              <button
                type="button"
                onClick={() => {
                  fastForwardTime(24);
                  notify('Jadwal SRS dimajukan +1 hari.');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <FastForward className="w-3.5 h-3.5" />
                Majukan +1 Hari
              </button>
              <button
                type="button"
                onClick={() => {
                  forceAllReviewsDue();
                  notify('Seluruh item aktif sekarang siap di-review!');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-[#0284C7]/10 text-[#0284C7] dark:text-sky-300 hover:bg-[#0284C7]/20 cursor-pointer"
              >
                Siapkan Semua Review
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <label className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                Buka hingga Level:
              </label>
              <select
                value={targetLevel}
                onChange={(e) => setTargetLevel(Number(e.target.value))}
                className="px-2.5 py-1.5 text-xs font-mono-num rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white"
              >
                {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((lvl) => (
                  <option key={lvl} value={lvl}>
                    Level {lvl}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  jumpToLevel(targetLevel);
                  notify(`Berhasil membuka hingga Level ${targetLevel}.`);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 cursor-pointer whitespace-nowrap"
              >
                Terapkan Level
              </button>
            </div>
          </section>

          {/* Backup & Reset */}
          <section className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-3">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Cadangkan &amp; Reset Progres
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Ekspor Progres (JSON)
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset('fresh')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-rose-300 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Mulai dari Nol (Level 1)
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset('starter')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Muat Ulang Data Awal
              </button>
            </div>

            {confirmReset && (
              <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-rose-800 dark:text-rose-200 font-medium">
                  {confirmReset === 'fresh'
                    ? 'Yakin ingin menghapus seluruh progres dan mulai dari Level 1 kosong?'
                    : 'Muat ulang ke data latihan awal Level 1?'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmReset(null)}
                    className="px-3 py-1 text-xs font-medium rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetProgress(confirmReset);
                      setConfirmReset(null);
                      setSettingsOpen(false);
                    }}
                    className="px-3 py-1 text-xs font-semibold rounded bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                  >
                    Ya, Reset
                  </button>
                </div>
              </div>
            )}

            <div className="pt-1 space-y-2">
              <label className="block text-xs text-slate-500 dark:text-slate-400">
                Pulihkan dari JSON (tempel isi file cadangan):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder='{"currentLevel": 1, ...}'
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white font-mono-num"
                />
                <button
                  type="button"
                  onClick={handleImport}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Impor
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
