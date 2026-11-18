/**
 * Speak Japanese text using Web Speech API (ja-JP).
 * Gracefully degrades if speechSynthesis is unavailable.
 */
export function speakJapanese(text: string, rate = 0.92): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = rate;

    const voices = window.speechSynthesis.getVoices();
    const jaVoice =
      voices.find((v) => v.lang === 'ja-JP' && v.localService) ||
      voices.find((v) => v.lang.startsWith('ja'));
    if (jaVoice) {
      utterance.voice = jaVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch {
    // Ignore audio playback errors in restricted environments
  }
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
