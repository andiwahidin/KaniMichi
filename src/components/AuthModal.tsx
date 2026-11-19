import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { AuthModalTab, useApp } from '../context/AppContext';

const GoogleMark: React.FC = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.56-5.15 3.56-8.65z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.28v3.09A12 12 0 0 0 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.29A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.57.38-2.29V6.62H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.38l4-3.09z"
    />
    <path
      fill="#EA4335"
      d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l4 3.09c.95-2.84 3.6-4.95 6.72-4.95z"
    />
  </svg>
);

export const AuthModal: React.FC = () => {
  const {
    authModalOpen,
    authModalTab,
    closeAuthModal,
    isSupabaseEnabled,
    signInWithEmail,
    signInWithGoogle,
    signUpWithEmail,
  } = useApp();

  const [tab, setTab] = useState<AuthModalTab>(authModalTab);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (authModalOpen) {
      setTab(authModalTab);
      setMessage(null);
      setPassword('');
    }
  }, [authModalOpen, authModalTab]);

  if (!authModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setMessage(null);

    const res =
      tab === 'register'
        ? await signUpWithEmail(email, password, displayName)
        : await signInWithEmail(email, password);

    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: res.message ?? 'Gagal memproses permintaan.' });
    } else if (res.message) {
      setMessage({ ok: true, text: res.message });
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleBusy(true);
    setMessage(null);
    const res = await signInWithGoogle();
    setGoogleBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: res.message ?? 'Gagal memulai login Google.' });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Masuk atau Daftar Akun KaniMichi"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4 sm:p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeAuthModal();
      }}
    >
      <div className="w-full max-w-md bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              {tab === 'register' ? 'Buat Akun KaniMichi' : 'Masuk ke KaniMichi'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Satu halaman login untuk User &amp; Admin — hak akses terdeteksi otomatis.
            </p>
          </div>
          <button
            type="button"
            onClick={closeAuthModal}
            aria-label="Tutup jendela login"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Unified Masuk / Daftar Switcher */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setMessage(null);
              }}
              className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                tab === 'login'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                setMessage(null);
              }}
              className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                tab === 'register'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Daftar Akun
            </button>
          </div>

          {!isSupabaseEnabled ? (
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
              <div className="font-semibold text-slate-900 dark:text-white">
                Supabase Belum Dikonfigurasi
              </div>
              <p>
                Tambahkan variabel lingkungan{' '}
                <code className="font-mono-num px-1 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800">
                  VITE_SUPABASE_URL
                </code>{' '}
                dan{' '}
                <code className="font-mono-num px-1 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800">
                  VITE_SUPABASE_PUBLISHABLE_KEY
                </code>{' '}
                untuk mengaktifkan login.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {message && (
                <div
                  className={`px-3.5 py-2.5 rounded-lg text-xs font-medium ${
                    message.ok
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-900'
                  }`}
                >
                  {message.text}
                </div>
              )}

              {/* Google OAuth Button */}
              <button
                type="button"
                disabled={googleBusy || busy}
                onClick={handleGoogleLogin}
                className="w-full py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-60"
              >
                <GoogleMark />
                {googleBusy ? 'Menghubungkan ke Google...' : 'Lanjutkan dengan Google'}
              </button>

              <div className="relative flex items-center">
                <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
                <span className="px-3 text-[11px] text-slate-400">atau dengan email</span>
                <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5">
                {tab === 'register' && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Nama Tampilan
                    </label>
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={40}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Contoh: Budi Pratama"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white focus:outline-none focus:border-[#0284C7]"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Alamat Email
                  </label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white focus:outline-none focus:border-[#0284C7]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Kata Sandi
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white focus:outline-none focus:border-[#0284C7]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy || googleBusy}
                  className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white bg-[#0284C7] hover:bg-[#0369A1] transition-colors cursor-pointer disabled:opacity-60"
                >
                  {busy
                    ? 'Memproses...'
                    : tab === 'register'
                    ? 'Daftar & Mulai Belajar'
                    : 'Masuk'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
