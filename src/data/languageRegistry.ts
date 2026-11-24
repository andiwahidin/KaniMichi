import type {
  ExamTrackDefinition,
  LanguageDefinition,
  SupportedLanguageId,
} from '../types/language';

export const LANGUAGE_REGISTRY: LanguageDefinition[] = [
  {
    id: 'ja',
    name: 'Bahasa Jepang',
    nativeLabel: '日本語',
    shortCode: 'JA',
    direction: 'ltr',
    defaultTtsLocale: 'ja-JP',
    alternateTtsLocales: [{ code: 'ja-JP', label: 'Jepang Standar (Tokyo)' }],
    accentHex: '#E11D48',
    accentHoverHex: '#BE123C',
    accentSoftClass: 'bg-rose-50 dark:bg-rose-950/30',
    accentTextClass: 'text-[#E11D48] dark:text-rose-400',
    summary:
      'Kurikulum terstruktur JLPT N5 hingga N1: Radikal, Kanji & Kosakata SRS, Kana JLPT, Tata Bahasa, Dokkai (Membaca), Chōkai (Mendengar), Menulis, Pelafalan, Tutor AI, dan Mogi Shiken N5–N1.',
    examTracks: [
      {
        id: 'jlpt',
        languageId: 'ja',
        name: 'JLPT (N5–N1)',
        shortName: 'JLPT',
        scoreRangeLabel: '0–180',
        sections: ['Kosakata & Kanji', 'Grammar', 'Dokkai (Reading)', 'Chōkai (Listening)'],
        summary: 'Ujian Kemampuan Bahasa Jepang resmi dari level dasar N5 hingga mahir N1.',
        passingBenchmarks: [
          { label: 'N5', value: '80 / 180' },
          { label: 'N4', value: '90 / 180' },
          { label: 'N3', value: '95 / 180' },
          { label: 'N2', value: '90 / 180' },
          { label: 'N1', value: '100 / 180' },
        ],
      },
    ],
  },
  {
    id: 'en',
    name: 'Bahasa Inggris',
    nativeLabel: 'English',
    shortCode: 'EN',
    direction: 'ltr',
    defaultTtsLocale: 'en-US',
    alternateTtsLocales: [
      { code: 'en-US', label: 'Amerika (US)' },
      { code: 'en-GB', label: 'Britania (UK)' },
    ],
    accentHex: '#2563EB',
    accentHoverHex: '#1D4ED8',
    accentSoftClass: 'bg-blue-50 dark:bg-blue-950/30',
    accentTextClass: 'text-[#2563EB] dark:text-blue-400',
    summary:
      'Persiapan akademik dan karier internasional: Academic Word List & Business Vocab SRS, Structure/Grammar, Reading, Listening US/UK, Writing & Speaking Studio, serta 4 simulasi tes.',
    hasWritingSpeakingStudio: true,
    examTracks: [
      {
        id: 'toefl-itp',
        languageId: 'en',
        name: 'TOEFL ITP',
        shortName: 'TOEFL ITP',
        scoreRangeLabel: '310–677',
        sections: ['Listening Comprehension', 'Structure & Written Expression', 'Reading Comprehension'],
        summary: 'Tes akademik berbasis institusi (skala 310–677), standar syarat wisuda dan beasiswa.',
        passingBenchmarks: [
          { label: 'B1 (Menengah)', value: '460+' },
          { label: 'Target S1/LPDP Dalam Negeri', value: '500+' },
          { label: 'B2 (Menengah Atas)', value: '543+' },
          { label: 'C1 (Mahir)', value: '627+' },
        ],
      },
      {
        id: 'toefl-ibt',
        languageId: 'en',
        name: 'TOEFL iBT',
        shortName: 'TOEFL iBT',
        scoreRangeLabel: '0–120',
        sections: ['Reading (0–30)', 'Listening (0–30)', 'Speaking (0–30)', 'Writing (0–30)'],
        summary: 'Tes akademik internasional berbasis internet untuk universitas luar negeri.',
        passingBenchmarks: [
          { label: 'Target S1 Internasional', value: '80+' },
          { label: 'Target S2/Beasiswa Global', value: '90+' },
          { label: 'Kompetitif Top Campus', value: '100+' },
        ],
      },
      {
        id: 'ielts',
        languageId: 'en',
        name: 'IELTS Academic',
        shortName: 'IELTS',
        scoreRangeLabel: 'Band 0.0–9.0',
        sections: ['Listening', 'Academic Reading', 'Academic Writing', 'Speaking'],
        summary: 'Ujian kemahiran bahasa Inggris standar global dengan penilaian Band 0.0–9.0.',
        passingBenchmarks: [
          { label: 'Competent User', value: 'Band 6.0' },
          { label: 'Target Beasiswa S2', value: 'Band 6.5' },
          { label: 'Good User (S3/Top Uni)', value: 'Band 7.0+' },
        ],
      },
      {
        id: 'toeic',
        languageId: 'en',
        name: 'TOEIC Listening & Reading',
        shortName: 'TOEIC',
        scoreRangeLabel: '10–990',
        sections: ['Listening (5–495)', 'Reading (5–495)'],
        summary: 'Sertifikasi komunikasi bahasa Inggris untuk dunia kerja, korporasi, dan bisnis global.',
        passingBenchmarks: [
          { label: 'Dasar Profesional', value: '550+' },
          { label: 'Standar Korporasi/BUMN', value: '700+' },
          { label: 'Mahir Bisnis Internasional', value: '850+' },
        ],
      },
    ],
  },
  {
    id: 'ar',
    name: 'Bahasa Arab',
    nativeLabel: 'العربية الفصحى',
    shortCode: 'AR',
    direction: 'rtl',
    defaultTtsLocale: 'ar-SA',
    alternateTtsLocales: [
      { code: 'ar-SA', label: 'Arab Fusha (ar-SA)' },
      { code: 'ar-EG', label: 'Arab Standar (ar-EG)' },
    ],
    accentHex: '#059669',
    accentHoverHex: '#047857',
    accentSoftClass: 'bg-emerald-50 dark:bg-emerald-950/30',
    accentTextClass: 'text-[#059669] dark:text-emerald-400',
    summary:
      'Pembelajaran Arab Fusha lengkap dengan Mufradat & Akar Kata SRS, Qawaid (Nahwu & Shorof), Qira\'ah RTL dengan toggle Harakat instan, Istima\', dan Simulasi TOAFL resmi.',
    hasHarakatToggle: true,
    examTracks: [
      {
        id: 'toafl',
        languageId: 'ar',
        name: 'TOAFL',
        shortName: 'TOAFL',
        scoreRangeLabel: '310–677',
        sections: ['Fahm al-Masmu\' (Istima\')', 'At-Tarakib wa al-Qawaid', 'Fahm al-Maqru\' (Qira\'ah)'],
        summary: 'Test of Arabic as a Foreign Language mengikuti struktur 3 sesi resmi UIN/PTKIN dengan skala 310–677.',
        passingBenchmarks: [
          { label: 'S1 Non-Agama', value: '375+' },
          { label: 'S1 Studi Islam', value: '400+' },
          { label: 'Magister (S2)', value: '450+' },
          { label: 'Bahasa Arab / S3', value: '500+' },
        ],
      },
    ],
  },
];

/**
 * Extensible plugin slots showing future languages ready to plug into the registry
 * using the exact same manifest-driven pack format without rewriting core engines.
 */
export const FUTURE_LANGUAGE_SLOTS: {
  id: string;
  name: string;
  nativeLabel: string;
  targetExam: string;
  description: string;
}[] = [
  {
    id: 'ko',
    name: 'Bahasa Korea',
    nativeLabel: '한국어',
    targetExam: 'TOPIK I & II',
    description: 'Siap ditambah lewat registri bahasa & paket data Hangul, Kosakata SRS, dan Simulasi TOPIK.',
  },
  {
    id: 'zh',
    name: 'Bahasa Mandarin',
    nativeLabel: '中文',
    targetExam: 'HSK 1–6',
    description: 'Kompatibel penuh dengan mesin SRS karakter, Pinyin/Nada, dan paket soal HSK.',
  },
  {
    id: 'de',
    name: 'Bahasa Jerman',
    nativeLabel: 'Deutsch',
    targetExam: 'Goethe A1–C1',
    description: 'Mendukung modul Wortschatz SRS, Grammatik, Lesen, Hören, dan simulasi Goethe-Zertifikat.',
  },
];

export function getLanguageDefinition(id: SupportedLanguageId): LanguageDefinition {
  return LANGUAGE_REGISTRY.find((l) => l.id === id) ?? LANGUAGE_REGISTRY[0];
}

export function getExamTrackDefinition(trackId: string): ExamTrackDefinition | undefined {
  for (const lang of LANGUAGE_REGISTRY) {
    const found = lang.examTracks.find((t) => t.id === trackId);
    if (found) return found;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Official Scaled Score Converters
// ---------------------------------------------------------------------------

/** Convert accuracy ratio (0..1) into TOEFL ITP / TOAFL section scale (31..68) */
export function ratioToItpSectionScore(ratio: number, maxScale = 68): number {
  const clamped = Math.max(0, Math.min(1, ratio));
  return Math.round(31 + clamped * (maxScale - 31));
}

export function convertToeflItpScore(
  listeningRatio: number,
  structureRatio: number,
  readingRatio: number
): {
  listening: number;
  structure: number;
  reading: number;
  total: number;
  benchmarkLabel: string;
  passed: boolean;
} {
  const listening = ratioToItpSectionScore(listeningRatio, 68);
  const structure = ratioToItpSectionScore(structureRatio, 68);
  const reading = ratioToItpSectionScore(readingRatio, 67);
  const rawTotal = Math.round(((listening + structure + reading) * 10) / 3);
  const total = Math.max(310, Math.min(677, rawTotal));
  const benchmarkLabel =
    total >= 627
      ? 'CEFR C1 (Mahir)'
      : total >= 543
      ? 'CEFR B2 (Menengah Atas)'
      : total >= 500
      ? 'Lulus Target 500+ (Beasiswa/S1)'
      : total >= 460
      ? 'CEFR B1 (Menengah)'
      : 'Perlu Penguatan Dasar';
  return { listening, structure, reading, total, benchmarkLabel, passed: total >= 500 };
}

export function convertToaflScore(
  istimaRatio: number,
  tarakibRatio: number,
  qiraahRatio: number
): {
  istima: number;
  tarakib: number;
  qiraah: number;
  total: number;
  benchmarkLabel: string;
  passed: boolean;
} {
  const istima = ratioToItpSectionScore(istimaRatio, 68);
  const tarakib = ratioToItpSectionScore(tarakibRatio, 68);
  const qiraah = ratioToItpSectionScore(qiraahRatio, 67);
  const rawTotal = Math.round(((istima + tarakib + qiraah) * 10) / 3);
  const total = Math.max(310, Math.min(677, rawTotal));
  const benchmarkLabel =
    total >= 500
      ? 'Memenuhi Syarat Bahasa Arab / S3 (500+)'
      : total >= 450
      ? 'Memenuhi Syarat Magister S2 (450+)'
      : total >= 400
      ? 'Memenuhi Syarat Studi Islam S1 (400+)'
      : total >= 375
      ? 'Memenuhi Syarat Umum S1 (375+)'
      : 'Belum Mencapai Ambang 375';
  return { istima, tarakib, qiraah, total, benchmarkLabel, passed: total >= 400 };
}

export function ratioToIeltsBand(ratio: number): number {
  const clamped = Math.max(0, Math.min(1, ratio));
  // Smooth mapping from 0% -> 2.5 up to 100% -> 9.0 in 0.5 band steps
  if (clamped === 0) return 0;
  const raw = 2.5 + clamped * 6.5;
  return Math.min(9.0, Math.round(raw * 2) / 2);
}

export function convertIeltsScore(
  listeningRatio: number,
  readingRatio: number,
  languageRatio: number
): {
  listening: number;
  reading: number;
  language: number;
  overall: number;
  benchmarkLabel: string;
  passed: boolean;
} {
  const listening = ratioToIeltsBand(listeningRatio);
  const reading = ratioToIeltsBand(readingRatio);
  const language = ratioToIeltsBand(languageRatio);
  const avg = (listening + reading + language) / 3;
  // IELTS official rounding to nearest 0.5
  const overall = Math.min(9.0, Math.round(avg * 2) / 2);
  const benchmarkLabel =
    overall >= 7.5
      ? 'Very Good User (Band 7.5+)'
      : overall >= 7.0
      ? 'Good User — Target S3 / Top Campus'
      : overall >= 6.5
      ? 'Competent+ — Target Beasiswa S2 (6.5)'
      : overall >= 6.0
      ? 'Competent User (6.0)'
      : 'Modest User — Perlu Latihan Lanjutan';
  return { listening, reading, language, overall, benchmarkLabel, passed: overall >= 6.5 };
}

export function convertToeicScore(
  listeningRatio: number,
  readingRatio: number
): {
  listening: number;
  reading: number;
  total: number;
  benchmarkLabel: string;
  passed: boolean;
} {
  const toSection = (r: number) => {
    const clamped = Math.max(0, Math.min(1, r));
    const raw = 5 + clamped * 490;
    return Math.min(495, Math.max(5, Math.round(raw / 5) * 5));
  };
  const listening = toSection(listeningRatio);
  const reading = toSection(readingRatio);
  const total = listening + reading;
  const benchmarkLabel =
    total >= 850
      ? 'Mahir Bisnis Internasional (850+)'
      : total >= 700
      ? 'Standar Korporasi / Profesional (700+)'
      : total >= 550
      ? 'Komunikasi Kerja Menengah (550+)'
      : 'Level Dasar Dunia Kerja';
  return { listening, reading, total, benchmarkLabel, passed: total >= 700 };
}

export function convertToeflIbtScore(
  readingRatio: number,
  listeningRatio: number,
  languageRatio: number
): {
  reading: number;
  listening: number;
  integratedEstimate: number;
  total: number;
  benchmarkLabel: string;
  passed: boolean;
} {
  const reading = Math.round(Math.max(0, Math.min(1, readingRatio)) * 30);
  const listening = Math.round(Math.max(0, Math.min(1, listeningRatio)) * 30);
  const integratedEstimate = Math.round(Math.max(0, Math.min(1, languageRatio)) * 60);
  const total = Math.min(120, reading + listening + integratedEstimate);
  const benchmarkLabel =
    total >= 100
      ? 'Sangat Kompetitif (100+/120)'
      : total >= 90
      ? 'Target Beasiswa S2 Global (90+)'
      : total >= 80
      ? 'Memenuhi Target S1 Internasional (80+)'
      : 'Tahap Pengembangan (Target 80+)';
  return { reading, listening, integratedEstimate, total, benchmarkLabel, passed: total >= 80 };
}
