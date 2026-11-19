import { useSyncExternalStore } from 'react';
import { isAudioPlaying, subscribeAudioPlaying } from '../utils/audio';

/**
 * React hook returning true whenever Japanese TTS speech or pitch guide audio is currently playing.
 */
export function useIsAudioPlaying(): boolean {
  return useSyncExternalStore(
    subscribeAudioPlaying,
    isAudioPlaying,
    () => false
  );
}
