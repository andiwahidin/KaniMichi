import { CurriculumDataset } from './curriculum';
import { GrammarDataset, JlptLevel } from '../types/grammar';
import { KanaVocabDataset } from '../types/kanaVocab';
import { ListeningDataset } from '../types/listening';
import {
  MockExamChoiceQuestion,
  MockExamLength,
  MockExamPaper,
  MockExamPartBreakdown,
  MockExamResult,
  MockExamRule,
  MockExamSectionScore,
} from '../types/mockExam';
import { ReadingDataset } from '../types/reading';

/**
 * Official JLPT Scoring & Sectional Minimum Pass Criteria (0–180 scale).
 * Source: JEES / Japan Foundation JLPT official scoring guide.
 */
export const JLPT_OFFICIAL_RULES: Record<JlptLevel, MockExamRule> = {
  5: {
    level: 5,
    code: 'N5',
    passTotal: 80,
    timeLimitMin: 25,
    fullTimeLimitMin: 40,
    combinedLangReading: true,
    langReadingMin: 38,
    listeningMin: 19,
  },
  4: {
    level: 4,
    code: 'N4',
    passTotal: 90,
    timeLimitMin: 30,
    fullTimeLimitMin: 45,
    combinedLangReading: true,
    langReadingMin: 38,
    listeningMin: 19,
  },
  3: {
    level: 3,
    code: 'N3',
    passTotal: 95,
    timeLimitMin: 35,
    fullTimeLimitMin: 55,
    combinedLangReading: false,
    langMin: 19,
    readingMin: 19,
    listeningMin: 19,
  },
  2: {
    level: 2,
    code: 'N2',
    passTotal: 90,
    timeLimitMin: 40,
    fullTimeLimitMin: 60,
    combinedLangReading: false,
    langMin: 19,
    readingMin: 19,
    listeningMin: 19,
  },
  1: {
    level: 1,
    code: 'N1',
    passTotal: 100,
    timeLimitMin: 45,
    fullTimeLimitMin: 70,
    combinedLangReading: false,
    langMin: 19,
    readingMin: 19,
    listeningMin: 19,
  },
};

export interface MockExamModeConfig {
  id: MockExamLength;
  label: string;
  readingVocab: number;
  meaningVocab: number;
  kana: number;
  grammar: number;
  dokkaiPassages: number;
  choukaiTracks: number;
  approxQuestionsLabel: string;
}

export const MOCK_EXAM_MODE_CONFIG: Record<MockExamLength, MockExamModeConfig> = {
  standard: {
    id: 'standard',
    label: 'Simulasi Ringkas',
    readingVocab: 4,
    meaningVocab: 3,
    kana: 3,
    grammar: 8,
    dokkaiPassages: 2,
    choukaiTracks: 3,
    approxQuestionsLabel: '~26 soal',
  },
  full: {
    id: 'full',
    label: 'Simulasi Penuh',
    readingVocab: 6,
    meaningVocab: 5,
    kana: 5,
    grammar: 12,
    dokkaiPassages: 4,
    choukaiTracks: 6,
    approxQuestionsLabel: '~43 soal',
  },
};

export interface MockExamExcludeIds {
  vocab?: Set<string>;
  kana?: Set<string>;
  grammar?: Set<string>;
  passages?: Set<string>;
  tracks?: Set<string>;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Prioritize items not recently used in prior mock runs, topping up from
 * previously seen items only if fewer than `count` fresh items remain.
 */
function pickPreferUnseen<T>(
  items: T[],
  count: number,
  getId: (item: T) => string,
  exclude?: Set<string>
): T[] {
  if (!exclude || exclude.size === 0) {
    return shuffle(items).slice(0, count);
  }
  const unseen = items.filter((item) => !exclude.has(getId(item)));
  if (unseen.length >= count) {
    return shuffle(unseen).slice(0, count);
  }
  const seen = items.filter((item) => exclude.has(getId(item)));
  return [...shuffle(unseen), ...shuffle(seen).slice(0, count - unseen.length)];
}

function buildChoiceSet(
  correct: string,
  distractorPool: string[],
  targetCount = 4
): { choices: string[]; answerIndex: number } {
  const uniqueDistractors = Array.from(
    new Set(distractorPool.filter((d) => d && d !== correct))
  );
  const picked = shuffle(uniqueDistractors).slice(0, targetCount - 1);
  const combined = shuffle([correct, ...picked]);
  return {
    choices: combined,
    answerIndex: combined.indexOf(correct),
  };
}

/**
 * Dynamically generate a balanced, randomized JLPT Mock Exam paper for any level N5–N1
 * pulling from all 4 curriculum banks (Kanji/Vocab, Kana Vocab, Grammar, Dokkai, Chōkai).
 */
export function generateMockExamPaper(
  jlpt: JlptLevel,
  datasets: {
    curriculum: CurriculumDataset;
    grammar: GrammarDataset;
    kanaVocab: KanaVocabDataset;
    reading: ReadingDataset;
    listening: ListeningDataset;
  },
  options?: {
    lengthMode?: MockExamLength;
    excludeIds?: MockExamExcludeIds;
  }
): MockExamPaper {
  const rule = JLPT_OFFICIAL_RULES[jlpt];
  const lengthMode: MockExamLength = options?.lengthMode ?? 'standard';
  const cfg = MOCK_EXAM_MODE_CONFIG[lengthMode];
  const excludeIds = options?.excludeIds;

  // -------------------------------------------------------------------------
  // PART 1: MOJI · GOI (Standard: 10 Qs | Full: 16 Qs)
  // -------------------------------------------------------------------------
  const levelVocab = datasets.curriculum.items.filter(
    (it) =>
      it.type === 'vocabulary' &&
      it.jlpt === jlpt &&
      it.readings &&
      it.readings.length > 0 &&
      /[\u4e00-\u9faf]/.test(it.characters)
  );
  const minVocabPool = cfg.readingVocab + cfg.meaningVocab + 8;
  const fallbackVocab =
    levelVocab.length >= minVocabPool
      ? levelVocab
      : datasets.curriculum.items.filter(
          (it) =>
            it.type === 'vocabulary' &&
            it.readings &&
            it.readings.length > 0 &&
            /[\u4e00-\u9faf]/.test(it.characters)
        );

  const pickedForReading = pickPreferUnseen(
    fallbackVocab,
    cfg.readingVocab,
    (v) => v.id,
    excludeIds?.vocab
  );
  const allReadingsPool = fallbackVocab
    .map((v) => v.readings?.[0] ?? '')
    .filter(Boolean);
  const allMeaningsPool = fallbackVocab
    .map((v) => v.primaryMeaning)
    .filter(Boolean);

  const readingQs: MockExamChoiceQuestion[] = pickedForReading.map((item, i) => {
    const correctReading = item.readings![0];
    // Never offer an alternate valid reading of the same word or single kanji as a distractor
    const forbiddenReadings = new Set<string>(item.readings ?? []);
    if (item.characters.length === 1) {
      const matchingKanji = datasets.curriculum.kanjiByChar[item.characters];
      if (matchingKanji) {
        (matchingKanji.onyomi ?? []).forEach((r) => forbiddenReadings.add(r));
        (matchingKanji.kunyomi ?? []).forEach((r) => forbiddenReadings.add(r));
      }
    }
    const safeReadingsPool = allReadingsPool.filter(
      (r) => !forbiddenReadings.has(r)
    );
    // Prefer distractors with similar length so choices look realistic
    const similarLen = safeReadingsPool.filter(
      (r) => Math.abs(r.length - correctReading.length) <= 1
    );
    const pool = similarLen.length >= 6 ? similarLen : safeReadingsPool;
    const { choices, answerIndex } = buildChoiceSet(correctReading, pool, 4);
    const isSingleKanji = item.characters.length === 1;
    return {
      id: `mg-read-${i + 1}`,
      part: 'moji-goi',
      sublabel: 'Bacaan Kanji (漢字読み)',
      promptJp: `「${item.characters}」の正[ただ]しい読[よ]み方[かた]を選[えら]んでください。`,
      promptSub: isSingleKanji
        ? `Pilih bacaan Hiragana yang tepat untuk kosakata "${item.primaryMeaning}" (${item.partOfSpeech ?? 'Kosakata'}).`
        : 'Pilih cara baca Hiragana yang benar untuk kosakata kanji di atas.',
      choices,
      answerIndex,
      explanationEn: `${item.characters} dibaca "${item.readings!.join(' / ')}" dan artinya "${item.primaryMeaning}".`,
      sourceId: item.id,
    };
  });

  const usedIds = new Set(pickedForReading.map((v) => v.id));
  const pickedForMeaning = pickPreferUnseen(
    fallbackVocab.filter((v) => !usedIds.has(v.id)),
    cfg.meaningVocab,
    (v) => v.id,
    excludeIds?.vocab
  );

  const meaningQs: MockExamChoiceQuestion[] = pickedForMeaning.map((item, i) => {
    // Exclude any synonym belonging to this item so two correct meanings never compete
    const forbiddenMeanings = new Set<string>(
      [item.primaryMeaning, ...item.acceptedMeanings].map((m) =>
        m.trim().toLowerCase()
      )
    );
    const safeMeaningsPool = allMeaningsPool.filter(
      (m) => !forbiddenMeanings.has(m.trim().toLowerCase())
    );
    const { choices, answerIndex } = buildChoiceSet(
      item.primaryMeaning,
      safeMeaningsPool,
      4
    );
    return {
      id: `mg-mean-${i + 1}`,
      part: 'moji-goi',
      sublabel: 'Arti Kosakata (語彙意味)',
      promptJp: `「${item.characters}（${item.readings![0]}）」の意味[いみ]として最[もっと]も適切[てきせつ]なものを選[えら]んでください。`,
      promptSub: 'Pilih makna yang paling tepat untuk kosakata di atas.',
      choices,
      answerIndex,
      explanationEn: `${item.characters} (${item.readings![0]}) bermakna "${item.primaryMeaning}"${
        item.acceptedMeanings.length > 1
          ? ` (sinonim: ${item.acceptedMeanings.slice(0, 3).join(', ')})`
          : ''
      }.`,
      sourceId: item.id,
    };
  });

  const levelKana = pickPreferUnseen(
    datasets.kanaVocab.byJlpt[jlpt] ?? [],
    cfg.kana,
    (it) => it.id,
    excludeIds?.kana
  );
  const kanaQs: MockExamChoiceQuestion[] = levelKana.map((item, i) => {
    const shuffledChoices = shuffle(item.quiz.choices);
    return {
      id: `mg-kana-${i + 1}`,
      part: 'moji-goi',
      sublabel: 'Pemakaian Konteks (文脈規定)',
      promptJp: `${item.quiz.sentenceBefore}（　　　）${item.quiz.sentenceAfter}`,
      promptSub: 'Pilih ungkapan non-kanji yang paling cocok melengkapi bagian kosong.',
      choices: shuffledChoices,
      answerIndex: shuffledChoices.indexOf(item.word),
      explanationEn: `Jawaban tepat: "${item.word}" (${item.primaryMeaning}). Makna kalimat: "${item.quiz.en}". Catatan pemakaian: ${item.usageNote}`,
      sourceId: item.id,
    };
  });

  const mojiGoiQuestions = [...readingQs, ...meaningQs, ...kanaQs];

  // -------------------------------------------------------------------------
  // PART 2: BUNPŌ / GRAMMAR (Standard: 8 Qs | Full: 12 Qs)
  // -------------------------------------------------------------------------
  const levelGrammar = pickPreferUnseen(
    datasets.grammar.byJlpt[jlpt] ?? [],
    cfg.grammar,
    (pt) => pt.id,
    excludeIds?.grammar
  );
  const bunpouQuestions: MockExamChoiceQuestion[] = levelGrammar.map((pt, i) => {
    const shuffledChoices = shuffle(pt.quiz.choices);
    return {
      id: `bp-${i + 1}`,
      part: 'bunpou',
      sublabel: `Tata Bahasa (文法 · ${pt.pattern})`,
      promptJp: `${pt.quiz.sentenceBefore}（　　　）${pt.quiz.sentenceAfter}`,
      promptSub: 'Pilih pola tata bahasa yang paling tepat untuk melengkapi kalimat.',
      choices: shuffledChoices,
      answerIndex: shuffledChoices.indexOf(pt.quiz.answer),
      explanationEn: `Jawaban: ${pt.quiz.answer} (pola ${pt.pattern} = "${pt.meaning}"). Kalimat: "${pt.quiz.en}". ${pt.explanation}`,
      sourceId: pt.id,
    };
  });

  // -------------------------------------------------------------------------
  // PART 3: DOKKAI / READING (Standard: 2 Passages | Full: 4 Passages)
  // -------------------------------------------------------------------------
  const dokkaiPassages = pickPreferUnseen(
    datasets.reading.byJlpt[jlpt] ?? [],
    cfg.dokkaiPassages,
    (p) => p.id,
    excludeIds?.passages
  );
  const dokkaiQuestions: MockExamChoiceQuestion[] = [];
  dokkaiPassages.forEach((passage, pIdx) => {
    passage.questions.forEach((q, qIdx) => {
      dokkaiQuestions.push({
        id: `dk-${pIdx + 1}-${qIdx + 1}`,
        part: 'dokkai',
        sublabel: `Wacana Dokkai ${pIdx + 1} · Soal ${qIdx + 1}`,
        promptJp: q.promptJp,
        promptSub: passage.titleEn,
        choices: q.choices,
        answerIndex: q.answerIndex,
        explanationEn: q.explanationEn,
        passageId: passage.id,
      });
    });
  });

  // -------------------------------------------------------------------------
  // PART 4: CHŌKAI / LISTENING (Standard: 3 Tracks | Full: 6 Tracks)
  // -------------------------------------------------------------------------
  const choukaiTracks = pickPreferUnseen(
    datasets.listening.byJlpt[jlpt] ?? [],
    cfg.choukaiTracks,
    (t) => t.id,
    excludeIds?.tracks
  );
  const choukaiQuestions: MockExamChoiceQuestion[] = choukaiTracks.map(
    (track, tIdx) => ({
      id: `ck-${tIdx + 1}`,
      part: 'choukai',
      sublabel: `Audio Chōkai ${tIdx + 1} (${track.taskType.toUpperCase()})`,
      promptJp: track.questionJp,
      promptSub: track.situationEn,
      choices: track.choices,
      answerIndex: track.answerIndex,
      explanationEn: track.explanationEn,
      trackId: track.id,
    })
  );

  const allQuestions = [
    ...mojiGoiQuestions,
    ...bunpouQuestions,
    ...dokkaiQuestions,
    ...choukaiQuestions,
  ];

  const timeLimitMin =
    lengthMode === 'full' ? rule.fullTimeLimitMin : rule.timeLimitMin;

  return {
    jlpt,
    lengthMode,
    createdAt: Date.now(),
    timeLimitSec: timeLimitMin * 60,
    mojiGoiQuestions,
    bunpouQuestions,
    dokkaiPassages,
    dokkaiQuestions,
    choukaiTracks,
    choukaiQuestions,
    allQuestions,
  };
}

/**
 * Grade a completed Mock Exam paper using official JLPT scaled scoring (0–180)
 * and strict sectional minimum pass thresholds (足切り / ashikiri).
 */
export function gradeMockExamPaper(
  paper: MockExamPaper,
  answers: Record<string, number>,
  elapsedSec: number
): MockExamResult {
  const rule = JLPT_OFFICIAL_RULES[paper.jlpt];

  const countPart = (qs: MockExamChoiceQuestion[]) => {
    let correct = 0;
    for (const q of qs) {
      if (answers[q.id] === q.answerIndex) correct += 1;
    }
    return { correct, total: qs.length };
  };

  const mg = countPart(paper.mojiGoiQuestions);
  const bp = countPart(paper.bunpouQuestions);
  const dk = countPart(paper.dokkaiQuestions);
  const ck = countPart(paper.choukaiQuestions);

  const scale = (correct: number, total: number, maxScore: number) =>
    total > 0 ? Math.round((correct / total) * maxScore) : 0;

  let sections: MockExamSectionScore[];

  if (rule.combinedLangReading) {
    // N5 & N4: Section 1 = Language Knowledge + Reading (0–120, min 38), Section 2 = Listening (0–60, min 19)
    const s1Correct = mg.correct + bp.correct + dk.correct;
    const s1Total = mg.total + bp.total + dk.total;
    const s1Score = scale(s1Correct, s1Total, 120);
    const s2Score = scale(ck.correct, ck.total, 60);

    sections = [
      {
        id: 'lang-reading',
        label: 'Pengetahuan Bahasa & Membaca',
        jpLabel: '言語知識・読解',
        score: s1Score,
        maxScore: 120,
        minPass: rule.langReadingMin ?? 38,
        passed: s1Score >= (rule.langReadingMin ?? 38),
      },
      {
        id: 'listening',
        label: 'Mendengarkan (Chōkai)',
        jpLabel: '聴解',
        score: s2Score,
        maxScore: 60,
        minPass: rule.listeningMin,
        passed: s2Score >= rule.listeningMin,
      },
    ];
  } else {
    // N3, N2, N1: 3 sections of 60 pts each (min 19 each)
    const langCorrect = mg.correct + bp.correct;
    const langTotal = mg.total + bp.total;
    const s1Score = scale(langCorrect, langTotal, 60);
    const s2Score = scale(dk.correct, dk.total, 60);
    const s3Score = scale(ck.correct, ck.total, 60);

    sections = [
      {
        id: 'lang',
        label: 'Pengetahuan Bahasa (Kosakata & Tata Bahasa)',
        jpLabel: '言語知識（文字・語彙・文法）',
        score: s1Score,
        maxScore: 60,
        minPass: rule.langMin ?? 19,
        passed: s1Score >= (rule.langMin ?? 19),
      },
      {
        id: 'reading',
        label: 'Pemahaman Membaca (Dokkai)',
        jpLabel: '読解',
        score: s2Score,
        maxScore: 60,
        minPass: rule.readingMin ?? 19,
        passed: s2Score >= (rule.readingMin ?? 19),
      },
      {
        id: 'listening',
        label: 'Pemahaman Mendengarkan (Chōkai)',
        jpLabel: '聴解',
        score: s3Score,
        maxScore: 60,
        minPass: rule.listeningMin,
        passed: s3Score >= rule.listeningMin,
      },
    ];
  }

  const totalScore = sections.reduce((sum, s) => sum + s.score, 0);
  const allSectionsPassed = sections.every((s) => s.passed);
  const passed = totalScore >= rule.passTotal && allSectionsPassed;
  const failedByCutoff = totalScore >= rule.passTotal && !allSectionsPassed;

  const parts: MockExamPartBreakdown[] = [
    { part: 'moji-goi', label: 'Kanji & Kosakata (Moji·Goi)', ...mg },
    { part: 'bunpou', label: 'Tata Bahasa (Bunpō)', ...bp },
    { part: 'dokkai', label: 'Membaca (Dokkai)', ...dk },
    { part: 'choukai', label: 'Mendengarkan (Chōkai)', ...ck },
  ];

  const totalCorrect = mg.correct + bp.correct + dk.correct + ck.correct;
  const totalQuestions = mg.total + bp.total + dk.total + ck.total;

  return {
    id: `mogi-n${paper.jlpt}-${Date.now()}`,
    jlpt: paper.jlpt,
    lengthMode: paper.lengthMode,
    completedAt: Date.now(),
    elapsedSec,
    totalScore,
    passThreshold: rule.passTotal,
    passed,
    failedByCutoff,
    sections,
    parts,
    totalCorrect,
    totalQuestions,
  };
}
