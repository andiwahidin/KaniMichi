/**
 * Arabic script utilities:
 * - Source JSON always stores fully vocalized Arabic Fusha (with harakat/syakal) as single source of truth.
 * - Client-side Unicode filter strips harakat instantly for TOAFL exam mode (teks gundul)
 *   or beginner-to-advanced reading drills.
 */

const ARABIC_DIACRITICS_RE =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;

const ARABIC_CHAR_RE = /[\u0600-\u06FF]/;

export function stripArabicDiacritics(text: string): string {
  if (!text) return '';
  return text.replace(ARABIC_DIACRITICS_RE, '');
}

export function formatArabicDisplay(text: string, showHarakat: boolean): string {
  if (!text) return '';
  return showHarakat ? text : stripArabicDiacritics(text);
}

export function hasArabicScript(text: string): boolean {
  return ARABIC_CHAR_RE.test(text);
}
