import { CurriculumDataset } from './curriculum';
import { GrammarDataset, JlptLevel } from '../types/grammar';
import { KanaVocabDataset } from '../types/kanaVocab';
import { ListeningDataset } from '../types/listening';
import {
  MockExamChoiceQuestion,
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
    combinedLangReading: true,
    langReadingMin: 38,
    listeningMin: 19,
  },
  4: {
    level: 4,
    code: 'N4',
    passTotal: 90,
    timeLimitMin: 30,
    combinedLangReading: true,
    langReadingMin: 38,
    listeningMin: 19,
  },
  3: {
    level: 3,
    code: 'N3',
    passTotal: 95,
    timeLimitMin: 35,
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
    combinedLangReading: false,
    langMin: 19,
    readingMin: 19,
    listeningMin: 19,
  },
};

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
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
  }
): MockExamPaper {
  const rule = JLPT_OFFICIAL_RULES[jlpt];

  // -------------------------------------------------------------------------
  // PART 1: MOJI · GOI (10 Questions: 4 Kanji Reading, 3 Vocab Meaning, 3 Kana Context)
  // -------------------------------------------------------------------------
  const levelVocab = datasets.curriculum.items.filter(
    (it) =>
      it.type === 'vocabulary' &&
      it.jlpt === jlpt &&
      it.readings &&
      it.readings.length > 0 &&
      /[\u4e00-\u9faf]/.test(it.characters)
  );
  const fallbackVocab =
    levelVocab.length >= 16
      ? levelVocab
      : datasets.curriculum.items.filter(
          (it) =>
            it.type === 'vocabulary' &&
            it.readings &&
            it.readings.length > 0 &&
            /[\u4e00-\u9faf]/.test(it.characters)
        );

  const pickedForReading = shuffle(fallbackVocab).slice(0, 4);
  const allReadingsPool = fallbackVocab
    .map((v) => v.readings?.[0] ?? '')
    .filter(Boolean);
  const allMeaningsPool = fallbackVocab
    .map((v) => v.primaryMeaning)
    .filter(Boolean);

  const readingQs: MockExamChoiceQuestion[] = pickedForReading.map((item, i) => {
    const correctReading = item.readings![0];
    // Prefer distractors with similar length so choices look realistic
    const similarLen = allReadingsPool.filter(
      (r) =>
        r !== correctReading &&
        Math.abs(r.length - correctReading.length) <= 1
    );
    const pool = similarLen.length >= 6 ? similarLen : allReadingsPool;
    const { choices, answerIndex } = buildChoiceSet(correctReading, pool, 4);
    return {
      id: `mg-read-${i + 1}`,
      part: 'moji-goi',
      sublabel: 'Kanji Reading (漢字読み)',
      promptJp: `「${item.characters}」の正[ただ]しい読[よ]み方[かた]を選[えら]んでください。`,
      promptSub: 'Choose the correct Hiragana reading for the kanji word.',
      choices,
      answerIndex,
      explanationEn: `${item.characters} is read "${correctReading}" and means "${item.primaryMeaning}".`,
    };
  });

  const usedIds = new Set(pickedForReading.map((v) => v.id));
  const pickedForMeaning = shuffle(
    fallbackVocab.filter((v) => !usedIds.has(v.id))
  ).slice(0, 3);

  const meaningQs: MockExamChoiceQuestion[] = pickedForMeaning.map((item, i) => {
    const { choices, answerIndex } = buildChoiceSet(
      item.primaryMeaning,
      allMeaningsPool,
      4
    );
    return {
      id: `mg-mean-${i + 1}`,
      part: 'moji-goi',
      sublabel: 'Vocabulary Meaning (語彙意味)',
      promptJp: `「${item.characters}（${item.readings![0]}）」の意味[いみ]として最[もっと]も適切[てきせつ]なものを選[えら]んでください。`,
      promptSub: 'Choose the most accurate English meaning.',
      choices,
      answerIndex,
      explanationEn: `${item.characters} (${item.readings![0]}) means "${item.primaryMeaning}"${
        item.acceptedMeanings.length > 1
          ? ` (also: ${item.acceptedMeanings.slice(0, 3).join(', ')})`
          : ''
      }.`,
    };
  });

  const levelKana = shuffle(datasets.kanaVocab.byJlpt[jlpt] ?? []).slice(0, 3);
  const kanaQs: MockExamChoiceQuestion[] = levelKana.map((item, i) => {
    const shuffledChoices = shuffle(item.quiz.choices);
    return {
      id: `mg-kana-${i + 1}`,
      part: 'moji-goi',
      sublabel: 'Context Usage (文脈規定)',
      promptJp: `${item.quiz.sentenceBefore}（　　　）${item.quiz.sentenceAfter}`,
      promptSub: 'Choose the non-kanji expression that best fits the blank.',
      choices: shuffledChoices,
      answerIndex: shuffledChoices.indexOf(item.word),
      explanationEn: `"${item.word}" (${item.primaryMeaning}) fits the sentence: "${item.quiz.en}" Note: ${item.usageNote}`,
    };
  });

  const mojiGoiQuestions = [...readingQs, ...meaningQs, ...kanaQs];

  // -------------------------------------------------------------------------
  // PART 2: BUNPŌ / GRAMMAR (8 Questions from grammar-jlpt.json)
  // -------------------------------------------------------------------------
  const levelGrammar = shuffle(datasets.grammar.byJlpt[jlpt] ?? []).slice(0, 8);
  const bunpouQuestions: MockExamChoiceQuestion[] = levelGrammar.map((pt, i) => {
    const shuffledChoices = shuffle(pt.quiz.choices);
    return {
      id: `bp-${i + 1}`,
      part: 'bunpou',
      sublabel: `Grammar (文法 · ${pt.pattern})`,
      promptJp: `${pt.quiz.sentenceBefore}（　　　）${pt.quiz.sentenceAfter}`,
      promptSub: 'Choose the grammar expression that completes the sentence.',
      choices: shuffledChoices,
      answerIndex: shuffledChoices.indexOf(pt.quiz.answer),
      explanationEn: `Answer: ${pt.quiz.answer} (${pt.pattern} = "${pt.meaning}"). Sentence: "${pt.quiz.en}" ${pt.explanation}`,
    };
  });

  // -------------------------------------------------------------------------
  // PART 3: DOKKAI / READING (2 Passages -> 4–5 Questions from reading-jlpt.json)
  // -------------------------------------------------------------------------
  const dokkaiPassages = shuffle(datasets.reading.byJlpt[jlpt] ?? []).slice(0, 2);
  const dokkaiQuestions: MockExamChoiceQuestion[] = [];
  dokkaiPassages.forEach((passage, pIdx) => {
    passage.questions.forEach((q, qIdx) => {
      dokkaiQuestions.push({
        id: `dk-${pIdx + 1}-${qIdx + 1}`,
        part: 'dokkai',
        sublabel: `Dokkai Passage ${pIdx + 1} · Q${qIdx + 1}`,
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
  // PART 4: CHŌKAI / LISTENING (3 Tracks -> 3 Questions from listening-jlpt.json)
  // -------------------------------------------------------------------------
  const choukaiTracks = shuffle(datasets.listening.byJlpt[jlpt] ?? []).slice(0, 3);
  const choukaiQuestions: MockExamChoiceQuestion[] = choukaiTracks.map(
    (track, tIdx) => ({
      id: `ck-${tIdx + 1}`,
      part: 'choukai',
      sublabel: `Chōkai Audio ${tIdx + 1} (${track.taskType.toUpperCase()})`,
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

  return {
    jlpt,
    createdAt: Date.now(),
    timeLimitSec: rule.timeLimitMin * 60,
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
        label: 'Language Knowledge & Reading',
        jpLabel: '言語知識・読解',
        score: s1Score,
        maxScore: 120,
        minPass: rule.langReadingMin ?? 38,
        passed: s1Score >= (rule.langReadingMin ?? 38),
      },
      {
        id: 'listening',
        label: 'Listening',
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
        label: 'Language Knowledge (Vocab & Grammar)',
        jpLabel: '言語知識（文字・語彙・文法）',
        score: s1Score,
        maxScore: 60,
        minPass: rule.langMin ?? 19,
        passed: s1Score >= (rule.langMin ?? 19),
      },
      {
        id: 'reading',
        label: 'Reading Comprehension',
        jpLabel: '読解',
        score: s2Score,
        maxScore: 60,
        minPass: rule.readingMin ?? 19,
        passed: s2Score >= (rule.readingMin ?? 19),
      },
      {
        id: 'listening',
        label: 'Listening Comprehension',
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
