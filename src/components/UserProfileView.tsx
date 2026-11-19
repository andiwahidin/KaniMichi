import React, { useMemo, useState } from 'react';
import {
  Bell,
  Flame,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  User as UserIcon,
} from 'lucide-react';
import { MAX_LEVEL, getLevelMeta } from '../data/curriculum';
import { useApp } from '../context/AppContext';
import { getSrsDistribution } from '../utils/srs';

export const UserProfileView: React.FC = () => {
  const {
    dataset,
    state,
    cloudUser,
    userProfile,
    isAdmin,
    schemaNeedsUpdate,
    cloudSyncing,
    lastCloudSyncAt,
    cloudError,
    announcements,
    setActiveView,
    setSettingsOpen,
    updateSettings,
    syncNow,
    signOutCloud,
    updateProfileName,
    changePassword,
  } = useApp();

  const [nameInput, setNameInput] = useState(userProfile?.displayName ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const srsDist = useMemo(() => getSrsDistribution(state, dataset), [state, dataset]);
  const levelMeta = getLevelMeta(state.currentLevel);

  const accuracyStats = useMemo(() => {
    let mCorrect = 0;
    let mWrong = 0;
    let rCorrect = 0;
    let rWrong = 0;
    let learnedCount = 0;

    for (const p of Object.values(state.progress)) {
      if (p.srsStage !== null && p.srsStage >= 1) learnedCount += 1;
      mCorrect += p.meaningCorrect;
      mWrong += p.meaningIncorrect;
      rCorrect += p.readingCorrect;
      rWrong += p.readingIncorrect;
    }

    const mTotal = mCorrect + mWrong;
    const rTotal = rCorrect + rWrong;
    const totalAll = mTotal + rTotal;
    return {
      learnedCount,
      meaningAcc: mTotal > 0 ? Math.round((mCorrect / mTotal) * 100) : null,
      readingAcc: rTotal > 0 ? Math.round((rCorrect / rTotal) * 100) : null,
      overallAcc:
        totalAll > 0 ? Math.round(((mCorrect + rCorrect) / totalAll) * 100) : null,
    };
  }, [state.progress]);

  if (!cloudUser) return null;

  const showNotice = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    window.setTimeout(() => setNotice(null), 3500);
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameSaving(true);
    const res = await updateProfileName(nameInput);
    setNameSaving(false);
    showNotice(res.ok, res.message ?? (res.ok ? 'Tersimpan.' : 'Gagal menyimpan.'));
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showNotice(false, 'Konfirmasi kata sandi tidak sama.');
      return;
    }
    setPwSaving(true);
    const res = await changePassword(newPassword);
    setPwSaving(false);
    if (res.ok) {
      setNewPassword('');
      setConfirmPassword('');
    }
    showNotice(res.ok, res.message ?? (res.ok ? 'Kata sandi diubah.' : 'Gagal mengubah kata sandi.'));
  };

  const recentHistory = [...state.history].reverse().slice(0, 10);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <span>{isAdmin ? 'Akun Administrator' : 'Akun Pelajar'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num">
              Level {state.currentLevel} / {MAX_LEVEL} ({levelMeta.tier})
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight mt-0.5">
            Profil &amp; Statistik Saya
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveView('admin')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              Buka Panel Admin
            </button>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Pengaturan SRS
          </button>
        </div>
      </div>

      {schemaNeedsUpdate && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
          <strong>Skema Database Belum Lengkap:</strong> Jalankan ulang isi terbaru{' '}
          <code className="font-mono-num px-1 py-0.5 rounded bg-amber-200/60 dark:bg-amber-900">
            supabase/schema.sql
          </code>{' '}
          di Supabase SQL Editor untuk mengaktifkan peran Admin, pengumuman global, dan edit profil.
        </div>
      )}

      {notice && (
        <div
          className={`px-4 py-3 rounded-xl text-sm font-medium border ${
            notice.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-900'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* KPI Metrics Row */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Item Dipelajari</div>
          <div className="font-mono-num text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {accuracyStats.learnedCount.toLocaleString('id-ID')}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono-num">
            {srsDist.burned.total} item Burned
          </div>
        </div>

        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Akurasi Keseluruhan</div>
          <div className="font-mono-num text-2xl font-bold text-[#0284C7] mt-1">
            {accuracyStats.overallAcc !== null ? `${accuracyStats.overallAcc}%` : '—'}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono-num">
            Arti {accuracyStats.meaningAcc !== null ? `${accuracyStats.meaningAcc}%` : '—'} · Bacaan{' '}
            {accuracyStats.readingAcc !== null ? `${accuracyStats.readingAcc}%` : '—'}
          </div>
        </div>

        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Review Selesai</div>
          <div className="font-mono-num text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {state.totalReviewsDone.toLocaleString('id-ID')}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono-num">
            Target harian: {state.settings.dailyReviewGoal} review
          </div>
        </div>

        <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Streak Belajar</div>
          <div className="font-mono-num text-2xl font-bold text-slate-900 dark:text-white mt-1 flex items-center gap-1.5">
            <Flame className="w-5 h-5 text-amber-500" />
            {state.streakDays} hari
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Aktif terakhir: {state.lastActiveDate ?? 'Hari ini'}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Account Info, Profile Edit, Security */}
        <div className="lg:col-span-7 space-y-6">
          {/* Identity & Display Name */}
          <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-[#0284C7]/10 text-[#0284C7] flex items-center justify-center shrink-0">
                  {isAdmin ? <ShieldCheck className="w-6 h-6 text-[#7C3AED]" /> : <UserIcon className="w-6 h-6" />}
                </div>
                <div className="min-w-0">
                  <div className="font-display text-lg font-bold text-slate-900 dark:text-white truncate">
                    {userProfile?.displayName || cloudUser.email}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {cloudUser.email} · Peran:{' '}
                    <strong className={isAdmin ? 'text-[#7C3AED]' : 'text-slate-700 dark:text-slate-200'}>
                      {isAdmin ? 'Administrator' : 'Pelajar (User)'}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveName} className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="sm:col-span-8 space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Nama Tampilan
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={40}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white"
                />
              </div>
              <div className="sm:col-span-4 flex items-end">
                <button
                  type="submit"
                  disabled={nameSaving}
                  className="w-full py-2 px-4 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-60 cursor-pointer"
                >
                  {nameSaving ? 'Menyimpan...' : 'Simpan Nama'}
                </button>
              </div>
            </form>

            {/* Daily Review Goal */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Target Review Harian
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Tentukan target jumlah review harian untuk menjaga konsistensi belajar
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                {[15, 25, 50, 100].map((goal) => (
                  <button
                    key={goal}
                    type="button"
                    onClick={() => updateSettings({ dailyReviewGoal: goal })}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md font-mono-num transition-colors cursor-pointer ${
                      state.settings.dailyReviewGoal === goal
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {goal}
                  </button>
                ))}
              </div>
            </div>

            {/* Cloud Sync & Sign Out */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {cloudSyncing
                  ? 'Menyinkronkan progres ke Supabase...'
                  : lastCloudSyncAt
                  ? `Terakhir sinkron: ${new Date(lastCloudSyncAt).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}`
                  : 'Sinkronisasi otomatis ke Supabase aktif'}
                {cloudError && (
                  <div className="text-rose-600 dark:text-rose-400 mt-0.5">{cloudError}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={cloudSyncing}
                  onClick={async () => {
                    const res = await syncNow();
                    if (res.message) showNotice(res.ok, res.message);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${cloudSyncing ? 'animate-spin' : ''}`} />
                  Sinkronkan Sekarang
                </button>
                <button
                  type="button"
                  onClick={signOutCloud}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Keluar
                </button>
              </div>
            </div>
          </section>

          {/* Change Password */}
          <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-slate-500" />
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Keamanan &amp; Ubah Kata Sandi
              </h2>
            </div>

            <form onSubmit={handlePasswordChange} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Kata sandi baru (min. 6 karakter)"
                className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white"
              />
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi kata sandi baru"
                className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white"
              />
              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={pwSaving}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                >
                  {pwSaving ? 'Memperbarui...' : 'Perbarui Kata Sandi'}
                </button>
              </div>
            </form>
          </section>
        </div>

        {/* Right Column: Announcements + Recent Activity */}
        <aside className="lg:col-span-5 space-y-6">
          <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#0284C7]" />
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Pengumuman Platform
              </h2>
            </div>

            {announcements.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Belum ada pengumuman aktif dari Admin saat ini.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {announcements.map((ann) => (
                  <article key={ann.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {ann.title}
                      </h3>
                      <span className="text-[11px] font-mono-num text-slate-400 shrink-0">
                        {new Date(ann.createdAt).toLocaleDateString('id-ID')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {ann.body}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Riwayat Belajar Terakhir
            </h2>

            {recentHistory.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Belum ada catatan review harian. Mulailah pelajaran atau review pertamamu!
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {recentHistory.map((h) => {
                  const acc =
                    h.reviewsCompleted > 0
                      ? Math.round((h.correctCount / h.reviewsCompleted) * 100)
                      : null;
                  return (
                    <div key={h.date} className="py-2.5 flex items-center justify-between gap-2">
                      <span className="font-mono-num font-medium text-slate-800 dark:text-slate-200">
                        {h.date}
                      </span>
                      <div className="flex items-center gap-3 font-mono-num text-slate-500 dark:text-slate-400">
                        <span>{h.lessonsCompleted} pel.</span>
                        <span>{h.reviewsCompleted} rev.</span>
                        <span className="text-[#0284C7] font-semibold w-10 text-right">
                          {acc !== null ? `${acc}%` : '—'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
};
