import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Download,
  HardDrive,
  Loader2,
  Square,
  Trash2,
  Volume2,
  WifiOff,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  cancelOfflineAudioDownload,
  clearAllOfflineAudio,
  clearOfflineAudioTexts,
  countOfflineCachedTexts,
  downloadOfflineAudioBatch,
  getNativeAndroidTtsStatus,
  getOfflineAudioStorageStats,
  isNativeAndroidTts,
  isOfflineAudioPackSupported,
  type NativeAndroidTtsStatus,
  type OfflineAudioBatchProgress,
  type OfflineAudioStorageStats,
  openNativeAndroidTtsInstall,
  setNativeAndroidTtsEngine,
  speakJapanese,
  subscribeOfflineAudioProgress,
  testNativeAndroidTts,
  testOfflineAudio,
} from '../utils/audio';
import {
  buildCurrentLevelAudioPack,
  downloadAndVerifyAllOfflineResources,
  formatBytes,
  OFFLINE_AUDIO_PACKS,
  type OfflineAudioPackDef,
  type OfflineResourcesVerifyProgress,
} from '../utils/offlinePacks';

interface PackCacheState {
  total: number;
  cached: number;
  cachedBytes: number;
  loading?: boolean;
}

type PackTab = 'recommended' | 'jlpt' | 'srs';

export const OfflineDownloadManager: React.FC = () => {
  const { dataset, state } = useApp();
  const isAndroidNative = isNativeAndroidTts();
  const supportsAudioPacks = isOfflineAudioPackSupported();

  const [storageStats, setStorageStats] = useState<OfflineAudioStorageStats | null>(null);
  const [activeTab, setActiveTab] = useState<PackTab>('recommended');
  const [packStates, setPackStates] = useState<Record<string, PackCacheState>>({});
  const [activeDownload, setActiveDownload] = useState<OfflineAudioBatchProgress | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [testingAudio, setTestingAudio] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // Resource verification state
  const [resourceVerifying, setResourceVerifying] = useState(false);
  const [resourceProgress, setResourceProgress] =
    useState<OfflineResourcesVerifyProgress | null>(null);
  const [resourceVerifiedText, setResourceVerifiedText] = useState<string | null>(null);

  // Optional Android TTS fallback accordion
  const [showTtsFallback, setShowTtsFallback] = useState(false);
  const [androidTtsStatus, setAndroidTtsStatus] = useState<NativeAndroidTtsStatus | null>(null);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsTestMessage, setTtsTestMessage] = useState<string | null>(null);

  const resolvedTextsCacheRef = useRef<Record<string, string[]>>({});
  const activeDownloadRef = useRef<string | null>(null);

  const currentLevelPack = useMemo(
    () => buildCurrentLevelAudioPack(state.currentLevel),
    [state.currentLevel]
  );

  const visiblePacks = useMemo<OfflineAudioPackDef[]>(() => {
    if (activeTab === 'recommended') {
      return [
        currentLevelPack,
        ...OFFLINE_AUDIO_PACKS.filter(
          (p) => p.id === 'starter-lv1-5' || p.id === 'pronunciation' || p.id === 'jlpt-n5'
        ),
      ];
    }
    if (activeTab === 'jlpt') {
      return OFFLINE_AUDIO_PACKS.filter((p) => p.category === 'jlpt');
    }
    return OFFLINE_AUDIO_PACKS.filter((p) => p.category === 'srs');
  }, [activeTab, currentLevelPack]);

  const refreshStorageStats = useCallback(async () => {
    if (!supportsAudioPacks) return;
    const stats = await getOfflineAudioStorageStats();
    if (stats) setStorageStats(stats);
  }, [supportsAudioPacks]);

  const resolvePackTexts = useCallback(
    async (pack: OfflineAudioPackDef): Promise<string[]> => {
      const existing = resolvedTextsCacheRef.current[pack.id];
      if (existing) return existing;
      const texts = await pack.resolveTexts(dataset);
      resolvedTextsCacheRef.current[pack.id] = texts;
      return texts;
    },
    [dataset]
  );

  const inspectPackStatus = useCallback(
    async (pack: OfflineAudioPackDef) => {
      if (!supportsAudioPacks) return;
      setPackStates((prev) => ({
        ...prev,
        [pack.id]: prev[pack.id]
          ? { ...prev[pack.id], loading: true }
          : { total: 0, cached: 0, cachedBytes: 0, loading: true },
      }));
      try {
        const texts = await resolvePackTexts(pack);
        const counts = await countOfflineCachedTexts(texts);
        if (counts) {
          setPackStates((prev) => ({
            ...prev,
            [pack.id]: {
              total: counts.totalCount,
              cached: counts.cachedCount,
              cachedBytes: counts.cachedBytes,
              loading: false,
            },
          }));
        }
      } catch {
        setPackStates((prev) => ({
          ...prev,
          [pack.id]: {
            total: prev[pack.id]?.total ?? 0,
            cached: prev[pack.id]?.cached ?? 0,
            cachedBytes: prev[pack.id]?.cachedBytes ?? 0,
            loading: false,
          },
        }));
      }
    },
    [resolvePackTexts, supportsAudioPacks]
  );

  useEffect(() => {
    if (!supportsAudioPacks) return;
    let active = true;
    void refreshStorageStats();
    let unsubscribe: (() => void) | null = null;
    void subscribeOfflineAudioProgress((progress) => {
      if (!active) return;
      setActiveDownload(progress);
    }).then((unsub) => {
      if (!active) {
        unsub();
      } else {
        unsubscribe = unsub;
      }
    });

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [refreshStorageStats, supportsAudioPacks]);

  useEffect(() => {
    if (!supportsAudioPacks) return;
    let cancelled = false;
    (async () => {
      for (const pack of visiblePacks) {
        if (cancelled) break;
        await inspectPackStatus(pack);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visiblePacks, inspectPackStatus, supportsAudioPacks]);

  useEffect(() => {
    if (!showTtsFallback || !isAndroidNative) return;
    let active = true;
    getNativeAndroidTtsStatus().then((status) => {
      if (active) setAndroidTtsStatus(status);
    });
    return () => {
      active = false;
    };
  }, [showTtsFallback, isAndroidNative]);

  const handleDownloadPack = async (pack: OfflineAudioPackDef) => {
    if (!supportsAudioPacks || activeDownloadRef.current) return;
    setStatusMessage(null);
    activeDownloadRef.current = pack.id;

    try {
      const texts = await resolvePackTexts(pack);
      if (texts.length === 0) {
        setStatusMessage('Tidak ada klip audio di paket ini.');
        activeDownloadRef.current = null;
        return;
      }

      setActiveDownload({
        packId: pack.id,
        completed: 0,
        total: texts.length,
        downloadedNew: 0,
        skippedExisting: 0,
        failed: 0,
        bytesAdded: 0,
        currentText: '',
      });

      const result = await downloadOfflineAudioBatch(pack.id, texts);
      activeDownloadRef.current = null;
      setActiveDownload(null);

      await Promise.all([refreshStorageStats(), inspectPackStatus(pack)]);

      if (!result) {
        setStatusMessage('Gagal memulai unduhan audio. Pastikan internet aktif.');
      } else if (result.cancelled) {
        setStatusMessage(
          `Unduhan dijeda: ${result.downloadedNew + result.skippedExisting} dari ${result.total} audio sudah tersimpan offline.`
        );
      } else if (result.failed > 0 && result.downloadedNew === 0 && result.skippedExisting === 0) {
        setStatusMessage(
          'Tidak dapat mengunduh audio. Periksa koneksi internetmu lalu coba lagi.'
        );
      } else if (result.failed > 0) {
        setStatusMessage(
          `${pack.title}: ${result.downloadedNew + result.skippedExisting}/${result.total} audio tersimpan (${result.failed} gagal, ketuk Lanjutkan saat koneksi stabil).`
        );
      } else {
        setStatusMessage(
          `${pack.title} selesai diunduh (${result.total} audio, +${formatBytes(result.bytesAdded)}). Siap dipakai 100% offline!`
        );
      }
    } catch {
      activeDownloadRef.current = null;
      setActiveDownload(null);
      setStatusMessage('Terjadi kendala saat menyiapkan paket audio.');
    }
  };

  const handleCancelDownload = async () => {
    await cancelOfflineAudioDownload();
  };

  const handleClearPack = async (pack: OfflineAudioPackDef) => {
    if (!supportsAudioPacks || activeDownloadRef.current) return;
    const texts = await resolvePackTexts(pack);
    const res = await clearOfflineAudioTexts(texts);
    await Promise.all([refreshStorageStats(), inspectPackStatus(pack)]);
    if (res) {
      setStatusMessage(
        `Menghapus ${res.deletedFiles} file audio (${formatBytes(res.deletedBytes)}) dari ${pack.title}.`
      );
    }
  };

  const handleClearAllAudio = async () => {
    if (!supportsAudioPacks || activeDownloadRef.current) return;
    const res = await clearAllOfflineAudio();
    setConfirmClearAll(false);
    await refreshStorageStats();
    for (const pack of visiblePacks) {
      await inspectPackStatus(pack);
    }
    if (res) {
      setStatusMessage(
        `Semua cache audio dibersihkan (${res.deletedFiles} file, ${formatBytes(res.deletedBytes)} dibebaskan).`
      );
    }
  };

  const handleTestOfflineAudio = async () => {
    setTestingAudio(true);
    setStatusMessage('Memutar audio Jepang...');

    if (!supportsAudioPacks) {
      speakJapanese('こんにちは', 0.92, 'narrator', () => {
        setTestingAudio(false);
        setStatusMessage('Audio tes diputar lewat mesin suara browser.');
      });
      return;
    }

    const res = await testOfflineAudio('こんにちは');
    await refreshStorageStats();
    setTestingAudio(false);

    if (res?.played) {
      const sizeStr = res.bytes ? ` (${formatBytes(res.bytes)})` : '';
      setStatusMessage(
        res.source === 'cache'
          ? `Berhasil! Diputar langsung dari audio offline di perangkat${sizeStr}.`
          : `Berhasil! Audio diunduh & disimpan permanen ke perangkat${sizeStr} — berikutnya langsung offline!`
      );
    } else if (res?.reason === 'offline_missing') {
      setStatusMessage(
        'Kamu sedang offline dan audio tes belum diunduh. Hubungkan internet sebentar lalu unduh Paket Pemula di bawah.'
      );
    } else {
      setStatusMessage(
        'Gagal mengunduh audio tes. Pastikan perangkat terhubung internet saat pertama kali mengunduh paket audio.'
      );
    }
  };

  const handleVerifyOfflineResources = async () => {
    if (resourceVerifying) return;
    setResourceVerifying(true);
    setResourceVerifiedText(null);
    const result = await downloadAndVerifyAllOfflineResources((p) => {
      setResourceProgress(p);
    });
    setResourceVerifying(false);
    setResourceVerifiedText(
      `${result.verifiedModules}/${result.totalModules} paket materi (${formatBytes(result.cachedBytesApprox)}) siap dipakai offline.`
    );
  };

  const handleSwitchAndroidTtsEngine = async (enginePkg: string) => {
    setTtsBusy(true);
    setTtsTestMessage('Menghubungkan ke mesin suara...');
    const updated = await setNativeAndroidTtsEngine(enginePkg);
    setTtsBusy(false);
    if (updated) {
      setAndroidTtsStatus(updated);
      setTtsTestMessage(
        updated.hasOfflineJapaneseVoice
          ? `Aktif: ${updated.engineLabel || updated.engine} — suara offline siap.`
          : `Aktif: ${updated.engineLabel || updated.engine} — data offline belum terdeteksi.`
      );
    } else {
      setTtsTestMessage('Gagal mengganti mesin TTS sistem.');
    }
  };

  const handleTestAndroidTts = async () => {
    setTtsBusy(true);
    setTtsTestMessage('Memutar tes TTS sistem...');
    const res = await testNativeAndroidTts('こんにちは');
    const refreshed = await getNativeAndroidTtsStatus();
    if (refreshed) setAndroidTtsStatus(refreshed);
    setTtsBusy(false);
    if (res?.spoken) {
      setTtsTestMessage(`Berhasil lewat TTS sistem (${res.engine || 'Android TTS'}).`);
    } else {
      setTtsTestMessage(
        res?.reason || 'TTS sistem tidak tersedia. Gunakan Paket Audio Offline di atas agar selalu berbunyi.'
      );
    }
  };

  const isDownloadingAny = activeDownload !== null;

  return (
    <div className="space-y-4">
      {/* Main Offline Audio & Media Card */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-[#0284C7] shrink-0" />
              <span>Audio &amp; Resource Offline (Dalam Aplikasi)</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Unduh paket suara MP3 Bahasa Jepang langsung di dalam aplikasi agar APK tetap ringan
              dan audio tetap berbunyi 100% offline tanpa bergantung pada TTS Android.
            </p>
          </div>
        </div>

        {/* Storage & Quick Test Strip */}
        <div className="p-3 rounded-lg bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-medium">
              <HardDrive className="w-3.5 h-3.5 text-[#0284C7] shrink-0" />
              {supportsAudioPacks ? (
                <span>
                  Tersimpan:{' '}
                  <strong className="font-mono-num">
                    {storageStats?.totalFiles ?? 0} audio
                  </strong>{' '}
                  ({formatBytes(storageStats?.totalBytes ?? 0)})
                </span>
              ) : (
                <span>Mode Browser Web — Materi offline aktif via Cache PWA</span>
              )}
            </div>
            {supportsAudioPacks && storageStats && !storageStats.isOnline && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                <WifiOff className="w-3 h-3" />
                Mode Offline
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={testingAudio || isDownloadingAny}
              onClick={() => void handleTestOfflineAudio()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0284C7] hover:bg-[#0369A1] text-white transition-colors cursor-pointer disabled:opacity-60"
            >
              {testingAudio ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
              Tes Audio Jepang (こんにちは)
            </button>

            {supportsAudioPacks && (storageStats?.totalFiles ?? 0) > 0 && !confirmClearAll && (
              <button
                type="button"
                disabled={isDownloadingAny}
                onClick={() => setConfirmClearAll(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Bersihkan Cache Audio
              </button>
            )}
          </div>

          {confirmClearAll && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-rose-800 dark:text-rose-200 font-medium">
                Hapus semua {storageStats?.totalFiles ?? 0} file audio offline?
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => void handleClearAllAudio()}
                  className="px-2.5 py-1 rounded bg-rose-600 text-white font-semibold hover:bg-rose-700 cursor-pointer"
                >
                  Ya, Hapus
                </button>
              </div>
            </div>
          )}

          {statusMessage && (
            <p className="text-xs text-slate-700 dark:text-slate-200 bg-sky-50/80 dark:bg-sky-950/40 border border-sky-200/80 dark:border-sky-900/60 rounded-md px-2.5 py-2">
              {statusMessage}
            </p>
          )}
        </div>

        {/* Resource & Study Data Offline Verification */}
        <div className="p-3 rounded-lg bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Data Materi, Font &amp; Goresan Kanji (N5–N1)</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                9.088 item SRS, Grammar, Dokkai, Chōkai, &amp; font tampilan sudah ringan di dalam
                aplikasi. Ketuk untuk memuat &amp; memverifikasi seluruh paket ke cache lokal.
              </p>
            </div>
            <button
              type="button"
              disabled={resourceVerifying}
              onClick={() => void handleVerifyOfflineResources()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {resourceVerifying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              {resourceVerifying ? 'Menyimpan...' : 'Simpan Semua Materi'}
            </button>
          </div>

          {resourceVerifying && resourceProgress && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span className="truncate">{resourceProgress.label}</span>
                <span className="font-mono-num shrink-0 ml-2">
                  {resourceProgress.completed}/{resourceProgress.total}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-200"
                  style={{
                    width: `${Math.round(
                      (resourceProgress.completed / Math.max(1, resourceProgress.total)) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          {resourceVerifiedText && !resourceVerifying && (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{resourceVerifiedText}</span>
            </div>
          )}
        </div>

        {/* Modular Downloadable Japanese Audio Packs (Android APK) */}
        {supportsAudioPacks ? (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                Pilih Paket Audio untuk Diunduh
              </div>
              <div className="inline-flex items-center gap-1 p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
                {(
                  [
                    { id: 'recommended', label: 'Utama' },
                    { id: 'jlpt', label: 'JLPT N5–N1' },
                    { id: 'srs', label: 'Level 1–60' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {visiblePacks.map((pack) => {
                const info = packStates[pack.id];
                const isThisDownloading = activeDownload?.packId === pack.id;
                const totalCount = isThisDownloading
                  ? activeDownload.total
                  : info?.total ?? 0;
                const cachedCount = isThisDownloading
                  ? activeDownload.completed
                  : info?.cached ?? 0;
                const isComplete = totalCount > 0 && cachedCount >= totalCount;
                const isPartial = cachedCount > 0 && cachedCount < totalCount;
                const pct =
                  totalCount > 0 ? Math.min(100, Math.round((cachedCount / totalCount) * 100)) : 0;
                const estTotalBytes =
                  info && info.cachedBytes > 0 && isComplete
                    ? info.cachedBytes
                    : totalCount * pack.estimatedAvgBytesPerClip;

                return (
                  <div
                    key={pack.id}
                    className="p-3 rounded-lg bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-1.5 py-0.5 text-[10px] font-bold font-mono-num rounded bg-sky-100 dark:bg-sky-950/70 text-[#0284C7] dark:text-sky-300">
                            {pack.badge}
                          </span>
                          <span className="text-xs font-semibold text-slate-900 dark:text-white">
                            {pack.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {pack.subtitle}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
                          {info?.loading && !isThisDownloading ? (
                            <span>Memeriksa...</span>
                          ) : totalCount > 0 ? (
                            <>
                              <span
                                className={
                                  isComplete
                                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                    : ''
                                }
                              >
                                {cachedCount}/{totalCount} audio
                              </span>
                              <span>·</span>
                              <span>
                                {isComplete
                                  ? formatBytes(estTotalBytes)
                                  : `~${formatBytes(estTotalBytes)}`}
                              </span>
                            </>
                          ) : (
                            <span>Siap diunduh</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isThisDownloading ? (
                          <button
                            type="button"
                            onClick={() => void handleCancelDownload()}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                          >
                            <Square className="w-3 h-3 fill-current" />
                            Batal
                          </button>
                        ) : isComplete ? (
                          <>
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Siap
                            </span>
                            <button
                              type="button"
                              disabled={isDownloadingAny}
                              onClick={() => void handleClearPack(pack)}
                              aria-label={`Hapus audio ${pack.title}`}
                              title="Hapus audio paket ini"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer disabled:opacity-40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={isDownloadingAny}
                              onClick={() => void handleDownloadPack(pack)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#0284C7] hover:bg-[#0369A1] text-white transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <Download className="w-3.5 h-3.5" />
                              {isPartial ? 'Lanjutkan' : 'Unduh'}
                            </button>
                            {isPartial && (
                              <button
                                type="button"
                                disabled={isDownloadingAny}
                                onClick={() => void handleClearPack(pack)}
                                aria-label={`Hapus audio ${pack.title}`}
                                title="Hapus audio paket ini"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer disabled:opacity-40"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {(isThisDownloading || isPartial) && totalCount > 0 && (
                      <div className="space-y-1">
                        <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-200 ${
                              isThisDownloading ? 'bg-[#0284C7]' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {isThisDownloading && activeDownload && (
                          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="truncate font-jp">
                              {activeDownload.currentText
                                ? `Mengunduh: ${activeDownload.currentText}`
                                : 'Menyiapkan unduhan...'}
                            </span>
                            <span className="font-mono-num shrink-0">
                              {pct}% · +{formatBytes(activeDownload.bytesAdded)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Tips: Audio apa pun yang kamu putar saat terhubung internet juga otomatis disimpan ke
              perangkat, sehingga berikutnya langsung bisa diputar offline tanpa mengunduh ulang.
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Pengunduhan paket audio MP3 offline tersedia penuh pada aplikasi Android (APK). Di
            browser web, tombol <strong>Simpan Semua Materi</strong> di atas menjaga seluruh data
            pelajaran tetap aktif secara offline.
          </p>
        )}

        {/* Collapsible Android System TTS Fallback (secondary option only) */}
        {isAndroidNative && (
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowTtsFallback((v) => !v)}
              className="w-full flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer py-1"
            >
              <span>Opsi Cadangan: Mesin TTS Sistem Android (jika klip belum diunduh)</span>
              {showTtsFallback ? (
                <ChevronUp className="w-4 h-4 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 shrink-0" />
              )}
            </button>

            {showTtsFallback && (
              <div className="mt-2 p-3 rounded-lg bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 space-y-2.5">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Mesin TTS sistem hanya dipakai sebagai cadangan jika kamu offline dan audio belum
                  diunduh di atas. Mesin aktif:{' '}
                  <strong className="text-slate-700 dark:text-slate-200">
                    {androidTtsStatus?.engineLabel || androidTtsStatus?.engine || 'Memeriksa...'}
                  </strong>
                </p>

                {androidTtsStatus?.engines && androidTtsStatus.engines.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {androidTtsStatus.engines.map((eng) => {
                      const isSelected = eng.name === androidTtsStatus.engine;
                      return (
                        <button
                          key={eng.name}
                          type="button"
                          disabled={ttsBusy}
                          onClick={() => void handleSwitchAndroidTtsEngine(eng.name)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer disabled:opacity-60 ${
                            isSelected
                              ? 'bg-[#0284C7] text-white border-[#0284C7]'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {eng.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={ttsBusy}
                    onClick={() => void handleTestAndroidTts()}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-800 dark:bg-slate-700 text-white cursor-pointer disabled:opacity-60"
                  >
                    Tes TTS Sistem
                  </button>
                  <button
                    type="button"
                    onClick={() => void openNativeAndroidTtsInstall('settings')}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Pengaturan TTS Android
                  </button>
                  <button
                    type="button"
                    onClick={() => void openNativeAndroidTtsInstall('install')}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Unduh Data TTS
                  </button>
                </div>

                {ttsTestMessage && (
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">{ttsTestMessage}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
