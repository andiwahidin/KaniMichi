import React, { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const wasOfflineRef = useRef(false);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      setShowReconnected(false);
      return;
    }

    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      setShowReconnected(true);
      const timer = window.setTimeout(() => {
        setShowReconnected(false);
      }, 3500);
      return () => window.clearTimeout(timer);
    }
  }, [isOnline]);

  if (isOnline && !showReconnected) return null;

  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 sm:right-auto sm:max-w-md z-50 flex items-center gap-2.5 bg-amber-50 dark:bg-amber-950/95 border border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-100 text-xs sm:text-sm font-medium px-3.5 py-2.5 rounded-xl shadow-lg"
      >
        <WifiOff className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>
          Mode Offline — Materi tersimpan tetap bisa dipelajari. Progres disinkronkan saat online
          kembali.
        </span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 sm:right-auto sm:max-w-sm z-50 flex items-center gap-2.5 bg-emerald-50 dark:bg-emerald-950/95 border border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-100 text-xs sm:text-sm font-medium px-3.5 py-2.5 rounded-xl shadow-lg"
    >
      <Wifi className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <span>Kembali online — progres belajar siap tersinkronisasi.</span>
    </div>
  );
};
