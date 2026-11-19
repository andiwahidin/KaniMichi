import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookMarked,
  Megaphone,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import {
  adminSetUserLevel,
  adminUpdateUserProfile,
  createAnnouncement,
  deleteAnnouncement,
  deleteCurriculumOverride,
  fetchAllUsersForAdmin,
  fetchAnnouncements,
  toggleAnnouncementActive,
  upsertCurriculumOverride,
} from '../lib/supabase';
import { LEVEL_TIERS, MAX_LEVEL } from '../data/curriculum';
import { useApp } from '../context/AppContext';
import {
  AdminUserRecord,
  Announcement,
  AnnouncementCategory,
  CurriculumItem,
} from '../types/curriculum';
import { getItemTypeLabel } from '../utils/srs';

type AdminTab = 'overview' | 'users' | 'curriculum' | 'announcements';

export const AdminPanel: React.FC = () => {
  const {
    dataset,
    cloudUser,
    isAdmin,
    curriculumOverrides,
    refreshAnnouncements,
    refreshCurriculumOverrides,
    setActiveView,
  } = useApp();

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [allAnnouncements, setAllAnnouncements] = useState<Announcement[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // User management filters
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [levelEdits, setLevelEdits] = useState<Record<string, number>>({});
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  // Curriculum editor state
  const [itemSearch, setItemSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<CurriculumItem | null>(null);
  const [editPrimaryMeaning, setEditPrimaryMeaning] = useState('');
  const [editMeaningMnemonic, setEditMeaningMnemonic] = useState('');
  const [editReadingMnemonic, setEditReadingMnemonic] = useState('');
  const [savingItem, setSavingItem] = useState(false);

  // Announcement form state
  const [annTitle, setAnnTitle] = useState('');
  const [annCategory, setAnnCategory] = useState<AnnouncementCategory>('info');
  const [annBody, setAnnBody] = useState('');
  const [savingAnn, setSavingAnn] = useState(false);

  const notify = (ok: boolean, text: string) => {
    setFeedback({ ok, text });
    window.setTimeout(() => setFeedback(null), 3500);
  };

  const loadAdminData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [userList, annList] = await Promise.all([
        fetchAllUsersForAdmin(),
        fetchAnnouncements(true),
      ]);
      setUsers(userList);
      setAllAnnouncements(annList);
      const lvlMap: Record<string, number> = {};
      for (const u of userList) lvlMap[u.id] = u.currentLevel;
      setLevelEdits(lvlMap);
    } catch (err) {
      notify(
        false,
        err instanceof Error ? err.message : 'Gagal memuat data panel admin.'
      );
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void loadAdminData();
    }
  }, [isAdmin, loadAdminData]);

  // Platform analytics
  const stats = useMemo(() => {
    const totalUsers = users.length;
    const adminCount = users.filter((u) => u.role === 'admin').length;
    const suspendedCount = users.filter((u) => u.isSuspended).length;
    const totalReviews = users.reduce((sum, u) => sum + u.totalReviewsDone, 0);
    const avgLevel =
      totalUsers > 0
        ? (users.reduce((sum, u) => sum + u.currentLevel, 0) / totalUsers).toFixed(1)
        : '1.0';
    const activeAnnouncements = allAnnouncements.filter((a) => a.isActive).length;
    const overrideCount = Object.keys(curriculumOverrides).length;
    const tierDist = LEVEL_TIERS.map((tier) => ({
      ...tier,
      count: users.filter(
        (u) => u.currentLevel >= tier.startLevel && u.currentLevel <= tier.endLevel
      ).length,
    }));

    return {
      totalUsers,
      adminCount,
      suspendedCount,
      totalReviews,
      avgLevel,
      activeAnnouncements,
      overrideCount,
      tierDist,
    };
  }, [users, allAnnouncements, curriculumOverrides]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    });
  }, [users, userSearch, roleFilter]);

  const curriculumMatches = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) {
      // Show already-overridden items first, then early level items
      const overriddenIds = Object.keys(curriculumOverrides);
      const list: CurriculumItem[] = [];
      for (const id of overriddenIds) {
        if (dataset.byId[id]) list.push(dataset.byId[id]);
      }
      for (const item of dataset.byLevel[1] ?? []) {
        if (!curriculumOverrides[item.id]) list.push(item);
        if (list.length >= 24) break;
      }
      return list;
    }

    const matches: CurriculumItem[] = [];
    for (const item of dataset.items) {
      if (
        item.characters.includes(q) ||
        item.primaryMeaning.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.readings?.some((r) => r.includes(q)) ||
        item.onyomi?.some((r) => r.includes(q)) ||
        item.kunyomi?.some((r) => r.includes(q))
      ) {
        matches.push(item);
        if (matches.length >= 24) break;
      }
    }
    return matches;
  }, [itemSearch, dataset, curriculumOverrides]);

  const handleSelectItemForEdit = (item: CurriculumItem) => {
    setSelectedItem(item);
    setEditPrimaryMeaning(item.primaryMeaning);
    setEditMeaningMnemonic(item.meaningMnemonic);
    setEditReadingMnemonic(item.readingMnemonic ?? '');
  };

  const handleToggleRole = async (u: AdminUserRecord) => {
    if (u.id === cloudUser?.id && stats.adminCount <= 1) {
      notify(false, 'Tidak bisa menurunkan satu-satunya Admin aktif.');
      return;
    }
    setBusyUserId(u.id);
    try {
      const nextRole = u.role === 'admin' ? 'user' : 'admin';
      await adminUpdateUserProfile(u.id, { role: nextRole });
      setUsers((prev) =>
        prev.map((row) => (row.id === u.id ? { ...row, role: nextRole } : row))
      );
      notify(
        true,
        `${u.displayName} sekarang berperan sebagai ${nextRole === 'admin' ? 'Admin' : 'Pelajar'}.`
      );
    } catch (err) {
      notify(false, err instanceof Error ? err.message : 'Gagal mengubah peran.');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleToggleSuspend = async (u: AdminUserRecord) => {
    if (u.id === cloudUser?.id) {
      notify(false, 'Kamu tidak dapat menangguhkan akunmu sendiri.');
      return;
    }
    setBusyUserId(u.id);
    try {
      const nextVal = !u.isSuspended;
      await adminUpdateUserProfile(u.id, { isSuspended: nextVal });
      setUsers((prev) =>
        prev.map((row) => (row.id === u.id ? { ...row, isSuspended: nextVal } : row))
      );
      notify(
        true,
        nextVal ? `Akun ${u.displayName} ditangguhkan.` : `Akun ${u.displayName} diaktifkan kembali.`
      );
    } catch (err) {
      notify(false, err instanceof Error ? err.message : 'Gagal mengubah status akun.');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleApplyUserLevel = async (u: AdminUserRecord) => {
    const targetLvl = levelEdits[u.id] ?? u.currentLevel;
    setBusyUserId(u.id);
    try {
      await adminSetUserLevel(u.id, targetLvl);
      setUsers((prev) =>
        prev.map((row) => (row.id === u.id ? { ...row, currentLevel: targetLvl } : row))
      );
      notify(true, `Level ${u.displayName} diatur ke Level ${targetLvl}.`);
    } catch (err) {
      notify(false, err instanceof Error ? err.message : 'Gagal mengubah level pengguna.');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleSaveCurriculumEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !cloudUser) return;
    setSavingItem(true);
    try {
      await upsertCurriculumOverride(cloudUser.id, {
        itemId: selectedItem.id,
        primaryMeaning: editPrimaryMeaning,
        meaningMnemonic: editMeaningMnemonic,
        readingMnemonic: selectedItem.type !== 'radical' ? editReadingMnemonic : undefined,
      });
      await refreshCurriculumOverrides();
      notify(true, `Perubahan untuk ${selectedItem.characters} berhasil disimpan ke Supabase.`);
    } catch (err) {
      notify(false, err instanceof Error ? err.message : 'Gagal menyimpan perubahan item.');
    } finally {
      setSavingItem(false);
    }
  };

  const handleResetCurriculumEdit = async (itemId: string) => {
    setSavingItem(true);
    try {
      await deleteCurriculumOverride(itemId);
      await refreshCurriculumOverrides();
      setSelectedItem(null);
      notify(true, 'Item dikembalikan ke data kurikulum standar.');
    } catch (err) {
      notify(false, err instanceof Error ? err.message : 'Gagal mereset item.');
    } finally {
      setSavingItem(false);
    }
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloudUser || !annTitle.trim() || !annBody.trim()) return;
    setSavingAnn(true);
    try {
      const created = await createAnnouncement(cloudUser.id, {
        title: annTitle,
        body: annBody,
        category: annCategory,
      });
      setAllAnnouncements((prev) => [created, ...prev]);
      setAnnTitle('');
      setAnnBody('');
      await refreshAnnouncements();
      notify(true, 'Pengumuman berhasil diterbitkan ke seluruh pengguna.');
    } catch (err) {
      notify(false, err instanceof Error ? err.message : 'Gagal membuat pengumuman.');
    } finally {
      setSavingAnn(false);
    }
  };

  const handleToggleAnnouncement = async (ann: Announcement) => {
    try {
      await toggleAnnouncementActive(ann.id, !ann.isActive);
      setAllAnnouncements((prev) =>
        prev.map((a) => (a.id === ann.id ? { ...a, isActive: !a.isActive } : a))
      );
      await refreshAnnouncements();
      notify(true, ann.isActive ? 'Pengumuman diarsipkan.' : 'Pengumuman diaktifkan kembali.');
    } catch (err) {
      notify(false, err instanceof Error ? err.message : 'Gagal memperbarui status pengumuman.');
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    try {
      await deleteAnnouncement(id);
      setAllAnnouncements((prev) => prev.filter((a) => a.id !== id));
      await refreshAnnouncements();
      notify(true, 'Pengumuman dihapus permanen.');
    } catch (err) {
      notify(false, err instanceof Error ? err.message : 'Gagal menghapus pengumuman.');
    }
  };

  if (!isAdmin) {
    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center space-y-4">
        <ShieldCheck className="w-10 h-10 text-slate-400 mx-auto" />
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Akses Khusus Administrator
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Halaman ini hanya dapat diakses oleh akun dengan peran Admin.
        </p>
        <button
          type="button"
          onClick={() => setActiveView('dashboard')}
          className="px-4 py-2 rounded-lg bg-[#0284C7] text-white text-sm font-semibold cursor-pointer"
        >
          Kembali ke Beranda
        </button>
      </main>
    );
  }

  const adminTabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Ringkasan', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'users', label: `Pengguna (${users.length})`, icon: <Users className="w-4 h-4" /> },
    { id: 'curriculum', label: 'Editor Kurikulum', icon: <BookMarked className="w-4 h-4" /> },
    { id: 'announcements', label: 'Pengumuman', icon: <Megaphone className="w-4 h-4" /> },
  ];

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-[#7C3AED] flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Panel Kontrol Administrator · Supabase RBAC</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight mt-0.5">
            Manajemen KaniMichi
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={loadingData}
            onClick={() => void loadAdminData()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
            Muat Ulang Data
          </button>
          <button
            type="button"
            onClick={() => setActiveView('profile')}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            Profil Saya
          </button>
        </div>
      </div>

      {/* Admin Sub-Navigation Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex items-center gap-1 overflow-x-auto">
        {adminTabs.map((t) => {
          const isCurrent = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                isCurrent
                  ? 'border-[#7C3AED] text-slate-950 dark:text-white'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl text-sm font-medium border ${
            feedback.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-900'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Total Pengguna</div>
              <div className="font-mono-num text-3xl font-bold text-slate-900 dark:text-white mt-1">
                {stats.totalUsers}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono-num">
                {stats.adminCount} Admin · {stats.suspendedCount} ditangguhkan
              </div>
            </div>

            <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Total Review Komunitas</div>
              <div className="font-mono-num text-3xl font-bold text-[#0284C7] mt-1">
                {stats.totalReviews.toLocaleString('id-ID')}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono-num">
                Rata-rata Level {stats.avgLevel}
              </div>
            </div>

            <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Kurikulum Kustom</div>
              <div className="font-mono-num text-3xl font-bold text-[#DB2777] mt-1">
                {stats.overrideCount}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono-num">
                Dari {dataset.counts.total.toLocaleString('id-ID')} item aktif
              </div>
            </div>

            <div className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Pengumuman Aktif</div>
              <div className="font-mono-num text-3xl font-bold text-[#7C3AED] mt-1">
                {stats.activeAnnouncements}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono-num">
                Total {allAnnouncements.length} pengumuman
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Distribusi Level Pengguna (Level 1–60)
            </h2>
            <div className="space-y-3">
              {stats.tierDist.map((tier) => {
                const pct =
                  stats.totalUsers > 0
                    ? Math.round((tier.count / stats.totalUsers) * 100)
                    : 0;
                return (
                  <div key={tier.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {tier.name} ({tier.labelId}) · Lv.{tier.startLevel}–{tier.endLevel}
                      </span>
                      <span className="font-mono-num text-slate-500 dark:text-slate-400">
                        {tier.count} pengguna ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-[#7C3AED] rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: USER MANAGEMENT */}
      {activeTab === 'users' && (
        <section className="bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Cari nama atau email pengguna..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 w-fit">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'admin', label: 'Admin' },
                  { id: 'user', label: 'Pelajar' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setRoleFilter(f.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                    roleFilter === f.id
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">Pengguna</th>
                  <th className="py-3 px-4 font-semibold">Peran</th>
                  <th className="py-3 px-4 font-semibold">Level (1–60)</th>
                  <th className="py-3 px-4 font-semibold">Review / Streak</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                      Tidak ada pengguna yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelf = u.id === cloudUser?.id;
                    const busy = busyUserId === u.id;
                    return (
                      <tr key={u.id} className={u.isSuspended ? 'opacity-60' : ''}>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {u.displayName} {isSelf && <span className="text-xs text-[#0284C7]">(Anda)</span>}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{u.email}</div>
                          {u.isSuspended && (
                            <div className="text-[11px] font-semibold text-rose-600 mt-0.5">
                              Ditangguhkan
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`text-xs font-semibold ${
                              u.role === 'admin'
                                ? 'text-[#7C3AED]'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {u.role === 'admin' ? 'Administrator' : 'Pelajar'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              max={MAX_LEVEL}
                              value={levelEdits[u.id] ?? u.currentLevel}
                              onChange={(e) =>
                                setLevelEdits((prev) => ({
                                  ...prev,
                                  [u.id]: Number(e.target.value),
                                }))
                              }
                              className="w-16 px-2 py-1 text-xs font-mono-num rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115]"
                            />
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleApplyUserLevel(u)}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 cursor-pointer disabled:opacity-50"
                            >
                              Set
                            </button>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono-num text-xs text-slate-600 dark:text-slate-300">
                          <div>{u.totalReviewsDone.toLocaleString('id-ID')} rev</div>
                          <div className="text-slate-400">{u.streakDays} hari streak</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleToggleRole(u)}
                              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                            >
                              {u.role === 'admin' ? 'Jadikan User' : 'Jadikan Admin'}
                            </button>
                            {!isSelf && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleToggleSuspend(u)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                                  u.isSuspended
                                    ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400'
                                    : 'border-rose-300 text-rose-700 dark:border-rose-900 dark:text-rose-400'
                                }`}
                              >
                                {u.isSuspended ? (
                                  <>
                                    <UserCheck className="w-3.5 h-3.5" /> Aktifkan
                                  </>
                                ) : (
                                  <>
                                    <UserX className="w-3.5 h-3.5" /> Tangguhkan
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 3: CURRICULUM CMS EDITOR */}
      {activeTab === 'curriculum' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-5 bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Cari Item Kurikulum (9.088 Item)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Perubahan arti &amp; mnemonik otomatis diterapkan ke semua pelajar.
              </p>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Cari kanji, arti, bacaan, atau ID..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white"
              />
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[460px] overflow-y-auto">
              {curriculumMatches.map((item) => {
                const isEdited = Boolean(curriculumOverrides[item.id]);
                const isSelected = selectedItem?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectItemForEdit(item)}
                    className={`w-full py-2.5 px-2.5 flex items-center justify-between gap-3 text-left rounded-lg transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#7C3AED]/10'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`font-jp font-bold text-white text-sm px-2 py-0.5 rounded shrink-0 ${
                          item.type === 'radical'
                            ? 'bg-[#0284C7]'
                            : item.type === 'kanji'
                            ? 'bg-[#DB2777]'
                            : 'bg-[#7C3AED]'
                        }`}
                      >
                        {item.characters}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {item.primaryMeaning}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono-num">
                          Lv.{item.level} · {getItemTypeLabel(item.type)}
                          {isEdited ? ' · Diedit Admin' : ''}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="lg:col-span-7 bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6">
            {!selectedItem ? (
              <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                Pilih salah satu Radikal, Kanji, atau Kosakata di panel kiri untuk menyunting arti dan mnemoniknya.
              </div>
            ) : (
              <form onSubmit={handleSaveCurriculumEdit} className="space-y-4">
                <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-jp text-2xl font-bold text-white px-3 py-1.5 rounded-lg ${
                        selectedItem.type === 'radical'
                          ? 'bg-[#0284C7]'
                          : selectedItem.type === 'kanji'
                          ? 'bg-[#DB2777]'
                          : 'bg-[#7C3AED]'
                      }`}
                    >
                      {selectedItem.characters}
                    </span>
                    <div>
                      <div className="font-display font-bold text-base text-slate-900 dark:text-white">
                        {getItemTypeLabel(selectedItem.type)} Level {selectedItem.level}
                      </div>
                      <div className="text-xs font-mono-num text-slate-500">
                        ID: {selectedItem.id}
                      </div>
                    </div>
                  </div>

                  {curriculumOverrides[selectedItem.id] && (
                    <button
                      type="button"
                      disabled={savingItem}
                      onClick={() => void handleResetCurriculumEdit(selectedItem.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-900 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reset ke Default
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Arti Utama (Bahasa Inggris)
                  </label>
                  <input
                    type="text"
                    required
                    value={editPrimaryMeaning}
                    onChange={(e) => setEditPrimaryMeaning(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Mnemonik Arti
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={editMeaningMnemonic}
                    onChange={(e) => setEditMeaningMnemonic(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white"
                  />
                </div>

                {selectedItem.type !== 'radical' && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Mnemonik Bacaan
                    </label>
                    <textarea
                      rows={3}
                      value={editReadingMnemonic}
                      onChange={(e) => setEditReadingMnemonic(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white"
                    />
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={savingItem}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-semibold disabled:opacity-60 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    {savingItem ? 'Menyimpan...' : 'Simpan ke Supabase'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}

      {/* TAB 4: GLOBAL ANNOUNCEMENTS */}
      {activeTab === 'announcements' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-5 bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white mb-4">
              Terbitkan Pengumuman Baru
            </h2>
            <form onSubmit={handleCreateAnnouncement} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Judul Pengumuman
                </label>
                <input
                  type="text"
                  required
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  placeholder="Contoh: Pembaruan Mnemonik Level 1–10"
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Kategori
                </label>
                <select
                  value={annCategory}
                  onChange={(e) => setAnnCategory(e.target.value as AnnouncementCategory)}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white"
                >
                  <option value="info">Informasi Umum</option>
                  <option value="update">Pembaruan Fitur / Kurikulum</option>
                  <option value="event">Tantangan / Acara Belajar</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Isi Pengumuman
                </label>
                <textarea
                  rows={4}
                  required
                  value={annBody}
                  onChange={(e) => setAnnBody(e.target.value)}
                  placeholder="Tulis pesan singkat dan jelas untuk seluruh pelajar..."
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1115] text-slate-900 dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={savingAnn}
                className="w-full py-2.5 px-4 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-semibold disabled:opacity-60 cursor-pointer"
              >
                {savingAnn ? 'Menerbitkan...' : 'Terbitkan Pengumuman'}
              </button>
            </form>
          </section>

          <section className="lg:col-span-7 bg-white dark:bg-[#161A22] rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Daftar Pengumuman ({allAnnouncements.length})
            </h2>

            {allAnnouncements.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Belum ada pengumuman yang diterbitkan.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {allAnnouncements.map((ann) => (
                  <div key={ann.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">
                          {ann.title}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono-num">
                          {new Date(ann.createdAt).toLocaleString('id-ID')} ·{' '}
                          {ann.isActive ? 'Aktif tampil di Dasbor' : 'Diarsipkan'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleToggleAnnouncement(ann)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          {ann.isActive ? 'Arsipkan' : 'Aktifkan'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteAnnouncement(ann.id)}
                          aria-label="Hapus pengumuman"
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {ann.body}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
};
