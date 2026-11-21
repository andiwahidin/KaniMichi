import React, { useState } from 'react';
import { CheckCircle2, Download, HardDriveDownload, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'topbar' | 'drawer';
  onAfterAction?: () => void;
}

const CORE_OFFLINE_FILES = [
  'data/curriculum-60.json',
  'data/writing-strokes-core.json',
];

const MODULE_MANIFESTS = [
  { dir: 'data/grammar', manifest: 'data/grammar/manifest.json' },
  { dir: 'data/kana-vocab', manifest: 'data/kana-vocab/manifest.json' },
  { dir: 'data/reading', manifest: 'data/reading/manifest.json' },
  { dir: 'data/listening', manifest: 'data/listening/manifest.json' },
];

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'topbar',
  onAfterAction,
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [cachingState, setCachingState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [cachedCount, setCachedCount] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);

  if (isInstalled) return null;

  const handleTrigger = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        onAfterAction?.();
      }
      return;
    }
    setShowGuideModal(true);
  };

  const handleWarmOfflineCache = async () => {
    setCachingState('loading');
    setCachedCount(0);
    const base = import.meta.env.BASE_URL || './';
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    const urlsToFetch: string[] = [...CORE_OFFLINE_FILES];
    let success = 0;

    try {
      for (const mod of MODULE_MANIFESTS) {
        urlsToFetch.push(mod.manifest);
        try {
          const manifestRes = await fetch(`${normalizedBase}${mod.manifest}`);
          if (manifestRes.ok) {
            const manifestJson = (await manifestRes.json()) as {
              levels?: Record<string, string[]>;
            };
            if (manifestJson?.levels) {
              for (const files of Object.values(manifestJson.levels)) {
                for (const file of files) {
                  urlsToFetch.push(`${mod.dir}/${file}`);
                }
              }
            }
          }
        } catch {
          // Ignore single manifest parse error; continue with remaining files
        }
      }

      const uniqueUrls = Array.from(new Set(urlsToFetch));
      setTotalFiles(uniqueUrls.length);

      for (const relPath of uniqueUrls) {
        const res = await fetch(`${normalizedBase}${relPath}`);
        if (res.ok) {
          success += 1;
          setCachedCount(success);
        }
      }
      setCachingState(success > 0 ? 'done' : 'error');
    } catch {
      setCachingState(success > 0 ? 'done' : 'error');
    }
  };

  return (
    <>
      {variant === 'topbar' ? (
        <button
          type="button"
          onClick={handleTrigger}
          title="Instal KaniMichi untuk akses offline di Android/HP"
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0284C7]"
        >
          {isInstallable ? (
            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#0284C7] dark:text-sky-400" />
          ) : (
            <Smartphone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#0284C7] dark:text-sky-400" />
          )}
          <span className="hidden sm:inline">
            {isInstallable ? 'Instal App' : 'Mode Offline'}
          </span>
          <span className="sm:hidden">App</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleTrigger}
          className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-[#0284C7] dark:text-sky-400 bg-sky-50/70 dark:bg-sky-950/30 hover:bg-sky-100/70 dark:hover:bg-sky-950/50 transition-colors cursor-pointer"
        >
          {isInstallable ? (
            <Download className="w-4 h-4 shrink-0" />
          ) : (
            <Smartphone className="w-4 h-4 shrink-0" />
          )}
          <span>
            {isInstallable ? 'Instal Aplikasi di Perangkat' : 'Instal di Android / Akses Offline'}
          </span>
        </button>
      )}

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-guide-title"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl space-y-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#0284C7]/10 dark:bg-sky-500/15 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5 text-[#0284C7] dark:text-sky-400" />
                </div>
                <div>
                  <h2
                    id="pwa-install-guide-title"
                    className="font-display text-base font-bold text-slate-900 dark:text-white"
                  >
                    Instal KaniMichi (Mode Offline)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Pasang di layar utama HP agar bisa belajar tanpa internet
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Tutup panduan instalasi"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="text-sm text-slate-600 dark:text-slate-300 space-y-2.5 list-decimal list-inside bg-slate-50 dark:bg-slate-900/60 rounded-xl p-3.5 border border-slate-100 dark:border-slate-800">
                <li>
                  Buka KaniMichi di browser <strong>Safari</strong>.
                </li>
                <li>
                  Ketuk tombol <Share className="inline w-4 h-4 -mt-0.5 text-[#0284C7]" />{' '}
                  <strong>Bagikan (Share)</strong> di bagian bawah layar.
                </li>
                <li>
                  Pilih <strong>Tambahkan ke Layar Utama (Add to Home Screen)</strong> lalu ketuk{' '}
                  <strong>Tambah</strong>.
                </li>
              </ol>
            ) : (
              <ol className="text-sm text-slate-600 dark:text-slate-300 space-y-2.5 list-decimal list-inside bg-slate-50 dark:bg-slate-900/60 rounded-xl p-3.5 border border-slate-100 dark:border-slate-800">
                <li>
                  Buka KaniMichi di <strong>Google Chrome</strong> (atau Edge / Samsung Internet)
                  pada {isAndroid ? 'HP Android Anda' : 'HP Android / komputer Anda'}.
                </li>
                <li>
                  Ketuk ikon menu <strong>titik tiga (⋮)</strong> di pojok kanan atas browser.
                </li>
                <li>
                  Pilih <strong>Instal aplikasi</strong> atau{' '}
                  <strong>Tambahkan ke layar utama</strong>, lalu konfirmasi{' '}
                  <strong>Instal</strong>.
                </li>
              </ol>
            )}

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-2.5">
              <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Seluruh bank materi (60 level SRS Radikal/Kanji/Kosakata, Grammar, Kana JLPT,
                Dokkai, Chōkai, Menulis, Pelafalan, dan Mogi Shiken N5–N1) disimpan otomatis untuk
                akses offline. Progres belajar tetap tersimpan di perangkat dan akan tersinkronisasi
                saat online kembali.
              </div>

              <button
                type="button"
                disabled={cachingState === 'loading'}
                onClick={handleWarmOfflineCache}
                className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500 text-white disabled:opacity-60 transition-colors cursor-pointer"
              >
                {cachingState === 'done' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-white" />
                    <span>
                      Semua Materi Siap Offline ({cachedCount}/{totalFiles} berkas)
                    </span>
                  </>
                ) : cachingState === 'loading' ? (
                  <>
                    <HardDriveDownload className="w-4 h-4 animate-pulse" />
                    <span>
                      Menyimpan materi offline ({cachedCount}/{totalFiles || '...'})...
                    </span>
                  </>
                ) : (
                  <>
                    <HardDriveDownload className="w-4 h-4" />
                    <span>Unduh Semua Materi ke Cache Offline</span>
                  </>
                )}
              </button>
              {cachingState === 'error' && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Sebagian berkas gagal diunduh. Pastikan perangkat sedang terhubung internet saat
                  mengunduh cache awal.
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#0284C7] hover:bg-[#0369A1] text-white transition-colors cursor-pointer"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
