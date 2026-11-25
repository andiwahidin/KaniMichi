import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  Mic,
  Pause,
  PenTool,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  TrendingUp,
  Volume2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { enStudioLoader } from '../data/langPackLoader';
import {
  askAiTutor,
  blobToBase64,
  buildLearnerContext,
  evaluateSpeakingWithAi,
  evaluateWritingWithAi,
  type AiSpeakingEvaluation,
  type AiTutorMessage,
  type AiWritingEvaluation,
} from '../lib/aiTutor';
import type {
  StudioExamTrack,
  StudioPromptItem,
  StudioRubricCriterion,
  SupportedLanguageId,
} from '../types/language';
import { speakText, stopSpeech } from '../utils/audio';
import { openAiTutorWithPrompt } from './AiTutorDrawer';

interface SampleFreeTopic {
  title: string;
  promptBody: string;
  skill: 'writing' | 'speaking';
  examTrack: StudioExamTrack;
  minWords?: number;
}

const SAMPLE_FREE_TOPICS: Record<SupportedLanguageId, SampleFreeTopic[]> = {
  en: [
    {
      title: 'Dampak AI terhadap Lapangan Kerja Masa Depan',
      promptBody:
        'Some people believe that artificial intelligence will eliminate more jobs than it creates, while others argue it will boost productivity and open new careers. Discuss both views and give your own opinion.',
      skill: 'writing',
      examTrack: 'ielts',
      minWords: 250,
    },
    {
      title: 'Ceritakan Tantangan Belajar atau Karier Terbesar Anda',
      promptBody:
        'Describe a challenging goal you worked hard to achieve. Explain what the goal was, the obstacles you faced, how you overcame them, and what you learned from the experience.',
      skill: 'speaking',
      examTrack: 'ielts',
    },
    {
      title: 'Ringkasan Email Profesional & Opini Kerja Jarak Jauh',
      promptBody:
        'Write a clear, structured response explaining whether hybrid work arrangements benefit both employees and companies more than full-time office work. Support your argument with concrete examples.',
      skill: 'writing',
      examTrack: 'free-practice',
      minWords: 150,
    },
  ],
  ja: [
    {
      title: 'Sakubun JLPT: Pengalaman Belajar Bahasa Jepang (日本語の勉強)',
      promptBody:
        'あなたが日本語を勉強している理由と、これまでで一番難しかったこと、そして将来の目標について日本語で書いてください。（JLPT N4–N2 目安：150〜300文字）',
      skill: 'writing',
      examTrack: 'jlpt',
      minWords: 60,
    },
    {
      title: 'Kaiwa: Memperkenalkan Kota Asal & Makanan Favorit (出身地と好きな食べ物)',
      promptBody:
        '自分の出身地（町や都市）の特徴と、おすすめの食べ物・場所について、丁寧語（です・ます形）を使って1〜2分で話してください。',
      skill: 'speaking',
      examTrack: 'jlpt',
    },
    {
      title: 'Sakubun Opini: Teknologi & Kehidupan Sehari-hari (スマホと生活)',
      promptBody:
        'スマートフォンは私たちの生活を便利にしましたが、問題点もあります。あなたの意見を理由や具体例と一緒に日本語で書いてください。',
      skill: 'writing',
      examTrack: 'free-practice',
      minWords: 80,
    },
  ],
  ar: [
    {
      title: "Insya' Fusha: Pentingnya Belajar Bahasa Asing (أهمية تعلم اللغات)",
      promptBody:
        'اكتب فقرة واضحة باللغة العربية الفصحى حول أهمية تعلم اللغات الأجنبية في العصر الحديث، مع ذكر فائدتين رئيسيتين ومثال واقعي.',
      skill: 'writing',
      examTrack: 'toafl',
      minWords: 70,
    },
    {
      title: 'Muhadatsah: Rutinitas Harian & Tujuan Studi (يومي الدراسي وأهدافي)',
      promptBody:
        'تحدث باللغة العربية الفصحى لمدة دقيقة إلى دقيقتين عن روتينك اليومي في الدراسة أو العمل، وما هي أهدافك المستقبلية في تعلم اللغة العربية.',
      skill: 'speaking',
      examTrack: 'toafl',
    },
    {
      title: "Insya' Bebas: Peran Teknologi dalam Pendidikan (دور التكنولوجيا في التعليم)",
      promptBody:
        'اكتب رأيك باللغة العربية الفصحى حول إيجابيات وسلبيات استخدام التكنولوجيا في التعليم، وكيف يمكن للطلاب الاستفادة منها بشكل متوازن.',
      skill: 'writing',
      examTrack: 'free-practice',
      minWords: 80,
    },
  ],
};

function getLangDisplayName(lang: SupportedLanguageId): string {
  if (lang === 'ja') return 'Bahasa Jepang';
  if (lang === 'ar') return 'Bahasa Arab';
  return 'Bahasa Inggris';
}

function getExamTrackLabel(track: StudioExamTrack): string {
  switch (track) {
    case 'ielts':
      return 'IELTS Academic';
    case 'toefl-ibt':
      return 'TOEFL iBT';
    case 'jlpt':
      return 'JLPT';
    case 'toafl':
      return 'TOAFL / Fusha';
    default:
      return 'Latihan Bebas';
  }
}

function buildDefaultRubricCriteria(
  lang: SupportedLanguageId,
  skill: 'writing' | 'speaking',
  examTrack: StudioExamTrack
): StudioRubricCriterion[] {
  const makeLevels = (max: number): { score: number; label: string; descriptor: string }[] => {
    if (max === 9) {
      return [
        { score: 5, label: 'Band 5.0', descriptor: 'Menjawab sebagian topik; beberapa kesalahan menghambat kejelasan.' },
        { score: 6, label: 'Band 6.0', descriptor: 'Cukup jelas dan relevan; variasi struktur masih terbatas.' },
        { score: 7, label: 'Band 7.0', descriptor: 'Terstruktur baik, kosakata akurat, kesalahan sangat minim.' },
        { score: 8, label: 'Band 8.0+', descriptor: 'Sangat alami, presisi tinggi, argumen tajam dan kohesif.' },
      ];
    }
    if (max === 5) {
      return [
        { score: 2, label: '2 / 5', descriptor: 'Ide dasar ada, namun sering terputus atau kurang akurat.' },
        { score: 3, label: '3 / 5', descriptor: 'Cukup runtut dengan beberapa kesalahan grammar/pilihan kata.' },
        { score: 4, label: '4 / 5', descriptor: 'Jelas, terorganisasi baik, dan efektif menjawab soal.' },
        { score: 5, label: '5 / 5', descriptor: 'Sangat fasih, terstruktur matang, dan sangat akurat.' },
      ];
    }
    return [
      { score: 55, label: '55 / 100', descriptor: 'Pesan dasar tersampaikan, tetapi perlu banyak perbaikan tata bahasa.' },
      { score: 70, label: '70 / 100', descriptor: 'Cukup jelas dan sesuai topik dengan beberapa kekeliruan kecil.' },
      { score: 85, label: '85 / 100', descriptor: 'Runtut, alami, pemilihan kosakata dan struktur sudah tepat.' },
      { score: 95, label: '95 / 100', descriptor: 'Sangat natural, presisi tinggi, dan setara tingkat mahir.' },
    ];
  };

  const maxScale = examTrack === 'ielts' ? 9 : examTrack === 'toefl-ibt' ? 5 : 100;
  const levels = makeLevels(maxScale);

  if (lang === 'ja') {
    if (skill === 'writing') {
      return [
        { id: 'content', name: 'Kesesuaian Isi & Alur (内容・構成)', description: 'Kejelasan ide utama, contoh pendukung, dan keruntutan paragraf.', levels },
        { id: 'grammar', name: 'Tata Bahasa & Partikel (文法・助詞)', description: 'Ketepatan partikel (は/が/を/に/で), konjugasi, dan konsistensi です・ます / 普通形.', levels },
        { id: 'vocab', name: 'Kosakata & Kanji (語彙・漢字)', description: 'Ketepatan diksi, kolokasi alami Jepang, dan penulisan kanji/kana.', levels },
        { id: 'naturalness', name: 'Kealamian Ungkapan (自然さ)', description: 'Alur kalimat terasa alami bagi penutur asli Jepang.', levels },
      ];
    }
    return [
      { id: 'fluency', name: 'Kelancaran & Tempo (流暢さ)', description: 'Kelancaran berbicara tanpa jeda panjang yang memutus makna.', levels },
      { id: 'pronunciation', name: 'Pelafalan & Intonasi (発音・イントネーション)', description: 'Kejelasan bunyi panjang/pendek, sokuon (っ), dan pola aksen.', levels },
      { id: 'grammar', name: 'Tata Bahasa & Keigo (文法・丁寧さ)', description: 'Ketepatan pola kalimat, partikel, dan tingkat kesopanan.', levels },
      { id: 'vocab', name: 'Kosakata & Relevansi (語彙・内容)', description: 'Kesesuaian jawaban dengan topik serta variasi kosakata.', levels },
    ];
  }

  if (lang === 'ar') {
    if (skill === 'writing') {
      return [
        { id: 'content', name: 'Kesesuaian Gagasan & Struktur (المضمون والتنظيم)', description: 'Kejelasan ide pokok, alur paragraf, dan kata hubung (أدوات الربط).', levels },
        { id: 'nahwu', name: 'Nahwu & I\'rab (النحو والإعراب)', description: 'Ketepatan struktur jumlah ismiyyah/fi\'liyyah, mudzakkar-muannats, dan kesesuaian i\'rab.', levels },
        { id: 'shorof', name: 'Shorof & Mufradat Fusha (الصرف والمفردات)', description: 'Ketepatan tasrif kata kerja, wazan, dan pilihan kosakata Arab Fusha.', levels },
        { id: 'style', name: 'Gaya Bahasa & Imla (الأسلوب والإملاء)', description: 'Ketepatan ejaan hamzah/ta marbuthah dan keindahan gaya bahasa.', levels },
      ];
    }
    return [
      { id: 'fluency', name: 'Kelancaran Muhadatsah (الطلاقة)', description: 'Alur bicara lancar dan runtut dalam bahasa Arab Fusha.', levels },
      { id: 'makhraj', name: 'Makhraj & Harakat Akhir (النطق والحركات)', description: 'Kejelasan pengucapan huruf dan ketepatan panjang-pendek (mad).', levels },
      { id: 'nahwu', name: 'Ketepatan Nahwu-Shorof (القواعد)', description: 'Ketepatan struktur kalimat dan bentuk fi\'il/ism saat berbicara.', levels },
      { id: 'vocab', name: 'Kekayaan Mufradat & Isi (المفردات والمحتوى)', description: 'Variasi kosakata Fusha dan kedalaman jawaban.', levels },
    ];
  }

  if (skill === 'writing') {
    return [
      { id: 'task', name: 'Task Response / Achievement', description: 'Menjawab seluruh instruksi soal dengan argumen dan contoh relevan.', levels },
      { id: 'coherence', name: 'Coherence & Cohesion', description: 'Alur paragraf logis, kalimat topik jelas, dan transisi efektif.', levels },
      { id: 'lexical', name: 'Lexical Resource', description: 'Variasi kosakata, ketepatan kolokasi, dan akurasi ejaan.', levels },
      { id: 'grammar', name: 'Grammatical Range & Accuracy', description: 'Variasi struktur kalimat kompleks serta ketepatan tenses dan tata bahasa.', levels },
    ];
  }

  return [
    { id: 'fluency', name: 'Fluency & Coherence', description: 'Kelancaran berbicara, kohesi ide, dan minim keraguan berlebihan.', levels },
    { id: 'lexical', name: 'Lexical Resource', description: 'Ketepatan kosakata, parafrase, dan ungkapan idiomatis alami.', levels },
    { id: 'grammar', name: 'Grammatical Range & Accuracy', description: 'Ketepatan tenses dan variasi struktur kalimat saat berbicara.', levels },
    { id: 'pronunciation', name: 'Pronunciation & Delivery', description: 'Kejelasan artikulasi, intonasi, dan penekanan kata.', levels },
  ];
}

function buildFreeTopicPrompt(params: {
  lang: SupportedLanguageId;
  skill: 'writing' | 'speaking';
  examTrack: StudioExamTrack;
  title: string;
  promptBody: string;
  minWords?: number;
}): StudioPromptItem {
  const { lang, skill, examTrack, title, promptBody, minWords } = params;
  const isWriting = skill === 'writing';
  const taskLabel =
    lang === 'ja'
      ? isWriting
        ? 'Sakubun Bebas (AI Agent)'
        : 'Kaiwa Bebas (AI Agent)'
      : lang === 'ar'
      ? isWriting
        ? "Insya' Bebas (AI Agent)"
        : 'Muhadatsah Bebas (AI Agent)'
      : isWriting
      ? 'Writing Topik Bebas (AI Agent)'
      : 'Speaking Topik Bebas (AI Agent)';

  const bulletHints =
    lang === 'ja'
      ? isWriting
        ? [
            'Awali dengan pernyataan topik atau pendapat utama secara jelas.',
            'Gunakan kata penghubung alami seperti まず、さらに、しかし、したがって.',
            'Jaga konsistensi gaya sopan (です・ます) atau kasual (だ・である).',
          ]
        : [
            'Jawab langsung inti topik dalam 1–2 kalimat pembuka.',
            'Tambahkan 1 contoh konkret atau pengalaman pribadi agar terdengar alami.',
            'Perhatikan panjang-pendek vokal dan intonasi akhir kalimat.',
          ]
      : lang === 'ar'
      ? isWriting
        ? [
            'Mulailah dengan kalimat pembuka (جملة استهلالية) yang merangkum topik.',
            'Gunakan kata hubung Fusha seperti بالإضافة إلى ذلك، ومع ذلك، وفي الختام.',
            'Perhatikan kesesuaian mudzakkar-muannats dan struktur fi\'il–fa\'il.',
          ]
        : [
            'Sampaikan poin utama dengan tenang dan jelas dalam bahasa Arab Fusha.',
            'Berikan alasan atau contoh singkat agar jawaban lebih kaya.',
            'Jaga kejelasan makhraj huruf dan panjang-pendek mad.',
          ]
      : isWriting
      ? [
          'Buka dengan thesis statement yang langsung menjawab topik.',
          'Kembangkan setiap paragraf isi dengan 1 ide pokok + contoh konkret.',
          'Tutup dengan kesimpulan ringkas yang merangkum posisi Anda.',
        ]
      : [
          'Jawab langsung pertanyaan di 10 detik pertama, lalu kembangkan alasannya.',
          'Tambahkan contoh pengalaman nyata agar bicara lebih mengalir.',
          'Gunakan penanda transisi lisan seperti First of all, For instance, Overall.',
        ];

  return {
    id: `free_${lang}_${skill}_${Date.now()}`,
    lang,
    order: 0,
    examTrack,
    skill,
    taskLabel,
    title: title.trim() || `Latihan ${isWriting ? 'Menulis' : 'Berbicara'} ${getLangDisplayName(lang)}`,
    isFreeTopic: true,
    prepSec: isWriting ? 0 : 30,
    durationSec: isWriting ? 1200 : 120,
    minWords: isWriting ? minWords ?? (lang === 'en' ? 150 : 60) : undefined,
    promptBody:
      promptBody.trim() ||
      (isWriting
        ? `Tulis paragraf atau esai singkat dalam ${getLangDisplayName(lang)} sesuai topik pilihan Anda, lalu minta AI Agent memeriksanya.`
        : `Rekam jawaban lisan Anda dalam ${getLangDisplayName(lang)} sesuai topik pilihan Anda, lalu minta AI Agent menilai dan memberi koreksi.`),
    bulletHints,
    modelAnswer:
      'Pada mode Topik Bebas, contoh jawaban terbaik (versi peningkatan khusus dari tulisan/ucapan Anda sendiri) akan dibuat otomatis oleh AI Agent di tab Pemeriksa AI.',
    modelScoreLabel: 'Khusus AI',
    keyExpressions: [],
    rubricCriteria: buildDefaultRubricCriteria(lang, skill, examTrack),
  };
}

function buildEvaluationContextSummary(
  prompt: StudioPromptItem,
  userInput: string,
  writingEval: AiWritingEvaluation | null,
  speakingEval: AiSpeakingEvaluation | null
): string {
  if (writingEval) {
    const corrections = writingEval.corrections
      .slice(0, 5)
      .map((c) => `- "${c.original}" -> "${c.corrected}" (${c.reasonId})`)
      .join('\n');
    const criteria = writingEval.criteriaFeedback
      .map((cf) => `- ${cf.criterionName}: ${cf.score} (${cf.commentId})`)
      .join('\n');
    return [
      `Tugas Writing (${getLangDisplayName(prompt.lang)} · ${getExamTrackLabel(prompt.examTrack)}): ${prompt.title}`,
      `Instruksi Soal: ${prompt.promptBody}`,
      `Esai Pengguna:\n${userInput.slice(0, 2500)}`,
      `Hasil Evaluasi AI: ${writingEval.scoreLabel} — ${writingEval.summaryId}`,
      `Rincian Rubrik:\n${criteria}`,
      `Fokus Perbaikan: ${writingEval.improvementsId.join('; ')}`,
      corrections ? `Koreksi Spesifik:\n${corrections}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  if (speakingEval) {
    const fixes = speakingEval.grammarAndVocabFixes
      .slice(0, 5)
      .map((f) => `- "${f.original}" -> "${f.corrected}" (${f.reasonId})`)
      .join('\n');
    const criteria = speakingEval.criteriaFeedback
      .map((cf) => `- ${cf.criterionName}: ${cf.score} (${cf.commentId})`)
      .join('\n');
    return [
      `Tugas Speaking (${getLangDisplayName(prompt.lang)} · ${getExamTrackLabel(prompt.examTrack)}): ${prompt.title}`,
      `Instruksi Soal: ${prompt.promptBody}`,
      `Transkrip Ucapan Pengguna: ${speakingEval.transcript.slice(0, 2000)}`,
      `Hasil Evaluasi AI: ${speakingEval.scoreLabel} — ${speakingEval.summaryId}`,
      `Rincian Rubrik:\n${criteria}`,
      `Catatan Kelancaran & Pelafalan: ${speakingEval.pronunciationAndFluencyId.join('; ')}`,
      fixes ? `Perbaikan Ungkapan:\n${fixes}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  return '';
}

export const WritingSpeakingStudio: React.FC = () => {
  const {
    dataset,
    state,
    userProfile,
    activeLanguage,
    setActiveView,
    recordStudioAttempt,
  } = useApp();

  const [prompts, setPrompts] = useState<StudioPromptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [examFilter, setExamFilter] = useState<'all' | 'ielts' | 'toefl-ibt'>('all');
  const [skillFilter, setSkillFilter] = useState<'all' | 'writing' | 'speaking'>('all');
  const [activePrompt, setActivePrompt] = useState<StudioPromptItem | null>(null);

  // Free-topic multilingual builder state
  const defaultBuilderLang: SupportedLanguageId =
    activeLanguage === 'ja' || activeLanguage === 'ar' || activeLanguage === 'en'
      ? activeLanguage
      : 'en';
  const [freeLang, setFreeLang] = useState<SupportedLanguageId>(defaultBuilderLang);
  const [freeSkill, setFreeSkill] = useState<'writing' | 'speaking'>('writing');
  const [freeExamTrack, setFreeExamTrack] = useState<StudioExamTrack>(
    defaultBuilderLang === 'ja'
      ? 'jlpt'
      : defaultBuilderLang === 'ar'
      ? 'toafl'
      : 'ielts'
  );
  const [freeTitle, setFreeTitle] = useState('');
  const [freePromptBody, setFreePromptBody] = useState('');

  // Studio workspace states
  const [timerPhase, setTimerPhase] = useState<'prep' | 'response'>('response');
  const [remainingSec, setRemainingSec] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const [draftText, setDraftText] = useState('');
  const [rightTab, setRightTab] = useState<'ai' | 'rubric' | 'model'>('ai');
  const [criteriaScores, setCriteriaScores] = useState<Record<string, number>>({});
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Browser audio self-recording for Speaking tasks
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // AI Evaluator states
  const [aiEvaluating, setAiEvaluating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [writingEval, setWritingEval] = useState<AiWritingEvaluation | null>(null);
  const [speakingEval, setSpeakingEval] = useState<AiSpeakingEvaluation | null>(null);

  // Direct follow-up Q&A inside evaluation results
  const [followUpMessages, setFollowUpMessages] = useState<AiTutorMessage[]>([]);
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);

  const enAccent = state.settings.englishAccent ?? 'en-US';

  // Keep builder language synced if user switches global language in TopBar
  useEffect(() => {
    if (activeLanguage === 'ja' || activeLanguage === 'ar' || activeLanguage === 'en') {
      setFreeLang(activeLanguage);
      setFreeExamTrack(
        activeLanguage === 'ja' ? 'jlpt' : activeLanguage === 'ar' ? 'toafl' : 'ielts'
      );
    }
  }, [activeLanguage]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    enStudioLoader
      .loadAll()
      .then((loaded) => {
        if (!active) return;
        setPrompts(loaded);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Gagal memuat Studio Writing & Speaking.');
        setLoading(false);
      });
    return () => {
      active = false;
      stopSpeech();
    };
  }, []);

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setElapsedSec((e) => e + 1);
      setRemainingSec((r) => {
        if (r <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  useEffect(() => {
    return () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [recordingUrl]);

  const filteredPrompts = useMemo(() => {
    return prompts.filter((p) => {
      if (examFilter !== 'all' && p.examTrack !== examFilter) return false;
      if (skillFilter !== 'all' && p.skill !== skillFilter) return false;
      return true;
    });
  }, [prompts, examFilter, skillFilter]);

  const getTtsLocaleForLang = (lang: SupportedLanguageId): string => {
    if (lang === 'ja') return 'ja-JP';
    if (lang === 'ar') return 'ar-SA';
    return enAccent;
  };

  const openPrompt = (prompt: StudioPromptItem) => {
    stopSpeech();
    setActivePrompt(prompt);
    setDraftText('');
    setCriteriaScores({});
    setSavedNotice(null);
    setRightTab('ai');
    setTimerRunning(false);
    setElapsedSec(0);
    setWritingEval(null);
    setSpeakingEval(null);
    setAiError(null);
    setFollowUpMessages([]);
    setFollowUpInput('');
    setFollowUpError(null);
    if (prompt.prepSec > 0) {
      setTimerPhase('prep');
      setRemainingSec(prompt.prepSec);
    } else {
      setTimerPhase('response');
      setRemainingSec(prompt.durationSec);
    }
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
      setRecordingUrl(null);
    }
    setRecordingBlob(null);
    setRecordingError(null);
    setIsRecording(false);
  };

  const handleLaunchFreeTopic = (override?: SampleFreeTopic) => {
    const topicTitle = override ? override.title : freeTitle;
    const topicBody = override ? override.promptBody : freePromptBody;
    const skill = override ? override.skill : freeSkill;
    const examTrack = override ? override.examTrack : freeExamTrack;
    const minWords = override?.minWords;

    const customPrompt = buildFreeTopicPrompt({
      lang: freeLang,
      skill,
      examTrack,
      title: topicTitle,
      promptBody: topicBody,
      minWords,
    });
    openPrompt(customPrompt);
  };

  const switchTimerPhase = (phase: 'prep' | 'response') => {
    if (!activePrompt) return;
    setTimerRunning(false);
    setTimerPhase(phase);
    setRemainingSec(phase === 'prep' ? activePrompt.prepSec : activePrompt.durationSec);
  };

  const wordCount = useMemo(() => {
    const trimmed = draftText.trim();
    if (!trimmed) return 0;
    if (activePrompt?.lang === 'ja') {
      return trimmed.replace(/\s+/g, '').length;
    }
    return trimmed.split(/\s+/).length;
  }, [draftText, activePrompt?.lang]);

  const startSelfRecording = async () => {
    setRecordingError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setRecordingError(
        'Perekaman mikrofon tidak tersedia di browser ini. Anda tetap dapat mengetik teks jawaban lisan untuk diperiksa AI Agent.'
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        const mime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        if (recordingUrl) URL.revokeObjectURL(recordingUrl);
        setRecordingBlob(blob);
        setRecordingUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setRecordingError(
        'Izin mikrofon ditolak atau perangkat tidak ditemukan. Anda tetap bisa mengetik jawaban lisan di bawah untuk dinilai AI Agent.'
      );
    }
  };

  const stopSelfRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleEvaluateWithAi = async () => {
    if (!activePrompt || aiEvaluating) return;
    setAiEvaluating(true);
    setAiError(null);
    setSavedNotice(null);
    setFollowUpMessages([]);
    setFollowUpError(null);
    setRightTab('ai');

    const rubricCriteria = activePrompt.rubricCriteria.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
    }));

    const learnerContext = buildLearnerContext(state, dataset, userProfile);

    try {
      if (activePrompt.skill === 'writing') {
        const res = await evaluateWritingWithAi({
          language: activePrompt.lang,
          examTrack: activePrompt.examTrack,
          taskTitle: activePrompt.title,
          promptBody: activePrompt.promptBody,
          readingExcerpt: activePrompt.readingExcerpt,
          minWords: activePrompt.minWords,
          userEssay: draftText,
          rubricCriteria,
          learnerContext,
        });
        setWritingEval(res);
        const mapped: Record<string, number> = {};
        for (const cf of res.criteriaFeedback) {
          mapped[cf.criterionId] = cf.score;
        }
        setCriteriaScores(mapped);

        // Auto-save to user's personal AI Agent memory
        recordStudioAttempt({
          id: `studio_ai_${Date.now()}`,
          promptId: activePrompt.id,
          language: activePrompt.lang,
          examTrack: activePrompt.examTrack,
          skill: 'writing',
          title: activePrompt.title,
          isFreeTopic: activePrompt.isFreeTopic,
          aiEvaluated: true,
          criteriaScores: mapped,
          overallScore: res.overallScore,
          maxScore: res.maxScore,
          scoreLabel: `${res.scoreLabel} (AI)`,
          wordCount,
          elapsedSec,
          completedAt: Date.now(),
          summaryId: res.summaryId,
          keyImprovements: res.improvementsId.slice(0, 3),
          sampleCorrections: res.corrections.slice(0, 2).map((c) => ({
            original: c.original,
            corrected: c.corrected,
          })),
        });
        setSavedNotice(
          `Tersimpan otomatis ke Memori AI Agent Akun Anda (${res.scoreLabel}).`
        );
      } else {
        let audioBase64 = '';
        let audioMimeType = 'audio/webm';
        if (recordingBlob) {
          audioBase64 = await blobToBase64(recordingBlob);
          audioMimeType = recordingBlob.type || 'audio/webm';
        }
        const res = await evaluateSpeakingWithAi({
          language: activePrompt.lang,
          examTrack: activePrompt.examTrack,
          taskTitle: activePrompt.title,
          promptBody: activePrompt.promptBody,
          audioBase64: audioBase64 || undefined,
          audioMimeType,
          transcriptText: draftText.trim() || undefined,
          rubricCriteria,
          learnerContext,
        });
        setSpeakingEval(res);
        const mapped: Record<string, number> = {};
        for (const cf of res.criteriaFeedback) {
          mapped[cf.criterionId] = cf.score;
        }
        setCriteriaScores(mapped);

        // Auto-save to user's personal AI Agent memory
        recordStudioAttempt({
          id: `studio_ai_${Date.now()}`,
          promptId: activePrompt.id,
          language: activePrompt.lang,
          examTrack: activePrompt.examTrack,
          skill: 'speaking',
          title: activePrompt.title,
          isFreeTopic: activePrompt.isFreeTopic,
          aiEvaluated: true,
          criteriaScores: mapped,
          overallScore: res.overallScore,
          maxScore: res.maxScore,
          scoreLabel: `${res.scoreLabel} (AI)`,
          elapsedSec,
          completedAt: Date.now(),
          summaryId: res.summaryId,
          keyImprovements: res.pronunciationAndFluencyId.slice(0, 3),
          sampleCorrections: res.grammarAndVocabFixes.slice(0, 2).map((f) => ({
            original: f.original,
            corrected: f.corrected,
          })),
        });
        setSavedNotice(
          `Tersimpan otomatis ke Memori AI Agent Akun Anda (${res.scoreLabel}).`
        );
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Gagal memeriksa jawaban dengan AI Agent.');
    } finally {
      setAiEvaluating(false);
    }
  };

  const handleAskFollowUp = async (questionOverride?: string) => {
    if (!activePrompt || followUpLoading) return;
    const text = (questionOverride ?? followUpInput).trim();
    if (!text) return;

    const evalContext = buildEvaluationContextSummary(
      activePrompt,
      draftText,
      writingEval,
      speakingEval
    );
    if (!evalContext) return;

    const nextMessages: AiTutorMessage[] = [
      ...followUpMessages,
      { role: 'user', content: text, createdAt: Date.now() },
    ];
    setFollowUpMessages(nextMessages);
    if (!questionOverride) setFollowUpInput('');
    setFollowUpLoading(true);
    setFollowUpError(null);

    try {
      const learnerContext = buildLearnerContext(state, dataset, userProfile);
      const { reply } = await askAiTutor({
        language: activePrompt.lang,
        examTarget: getExamTrackLabel(activePrompt.examTrack),
        messages: nextMessages,
        learnerContext,
        evaluationContext: evalContext,
      });
      setFollowUpMessages((prev) => [
        ...prev,
        { role: 'assistant', content: reply, createdAt: Date.now() },
      ]);
    } catch (err) {
      setFollowUpError(
        err instanceof Error ? err.message : 'Gagal menghubungi AI Agent untuk diskusi lanjutan.'
      );
    } finally {
      setFollowUpLoading(false);
    }
  };

  const computedScore = useMemo(() => {
    if (!activePrompt) return null;
    const criteria = activePrompt.rubricCriteria;
    const scoredCount = criteria.filter((c) => criteriaScores[c.id] !== undefined).length;
    if (scoredCount === 0) return null;

    const avg = criteria.reduce((sum, c) => sum + (criteriaScores[c.id] ?? 0), 0) / scoredCount;

    if (activePrompt.examTrack === 'ielts') {
      const band = Math.min(9.0, Math.round(avg * 2) / 2);
      return {
        complete: scoredCount === criteria.length,
        overallScore: band,
        maxScore: 9.0,
        scoreLabel: `Band ${band.toFixed(1)}`,
      };
    }
    if (activePrompt.examTrack === 'toefl-ibt') {
      const scaled = Math.min(30, Math.round((avg / 5) * 30));
      return {
        complete: scoredCount === criteria.length,
        overallScore: scaled,
        maxScore: 30,
        scoreLabel: `${scaled} / 30`,
      };
    }
    const pct = Math.min(100, Math.round(avg));
    return {
      complete: scoredCount === criteria.length,
      overallScore: pct,
      maxScore: 100,
      scoreLabel: `${pct} / 100`,
    };
  }, [activePrompt, criteriaScores]);

  const handleSaveEvaluation = () => {
    if (!activePrompt || !computedScore || !computedScore.complete) return;
    recordStudioAttempt({
      id: `studio_${Date.now()}`,
      promptId: activePrompt.id,
      language: activePrompt.lang,
      examTrack: activePrompt.examTrack,
      skill: activePrompt.skill,
      title: activePrompt.title,
      isFreeTopic: activePrompt.isFreeTopic,
      aiEvaluated: false,
      criteriaScores,
      overallScore: computedScore.overallScore,
      maxScore: computedScore.maxScore,
      scoreLabel: computedScore.scoreLabel,
      wordCount: activePrompt.skill === 'writing' ? wordCount : undefined,
      elapsedSec,
      completedAt: Date.now(),
    });
    setSavedNotice(`Evaluasi mandiri (${computedScore.scoreLabel}) berhasil disimpan ke riwayat.`);
  };

  const formatClock = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleBackToHome = () => {
    stopSpeech();
    if (activeLanguage === 'ja' || activeLanguage === 'all') {
      setActiveView('dashboard');
    } else {
      setActiveView('lang-home');
    }
  };

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
          Memuat Studio AI Menulis &amp; Berbicara...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-rose-600">{error}</p>
          <button
            type="button"
            onClick={handleBackToHome}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
          >
            Kembali
          </button>
        </div>
      </main>
    );
  }

  // TWO-ZONE SANDBOX WORKSPACE WITH PERSONAL AI AGENT EVALUATOR & FOLLOW-UP Q&A
  if (activePrompt) {
    const isWriting = activePrompt.skill === 'writing';
    const isAr = activePrompt.lang === 'ar';
    const isJa = activePrompt.lang === 'ja';
    const ttsLocale = getTtsLocaleForLang(activePrompt.lang);
    const minWords = activePrompt.minWords ?? 0;
    const unitLabel = isJa ? 'karakter' : 'kata';
    const canEvaluate = isWriting
      ? draftText.trim().length >= (isJa ? 10 : 15)
      : Boolean(recordingBlob) || draftText.trim().length >= 8;
    const hasAiResult = Boolean(isWriting ? writingEval : speakingEval);

    const quickFollowUpPrompts = isWriting
      ? [
          'Jelaskan kesalahan grammar paling krusial di tulisan saya.',
          'Berikan 5 frasa atau ungkapan nilai tinggi untuk topik ini.',
          'Buatkan 3 latihan perbaikan singkat dari kelemahan saya tadi.',
        ]
      : [
          'Bagaimana cara melatih kelancaran & pelafalan untuk kelemahan saya tadi?',
          'Berikan 5 frasa lisan yang lebih alami untuk topik ini.',
          'Buat latihan pengucapan singkat dari jawaban saya tadi.',
        ];

    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              stopSpeech();
              setTimerRunning(false);
              setActivePrompt(null);
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Daftar Tugas Studio AI
          </button>
          <div className="text-xs font-semibold text-slate-500">
            {getLangDisplayName(activePrompt.lang)} · {getExamTrackLabel(activePrompt.examTrack)} ·{' '}
            {activePrompt.taskLabel}
          </div>
        </div>

        {/* Left Workspace (7 cols) / Right Personal AI Agent + Rubric + Model (5 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT ZONE */}
          <section className="lg:col-span-7 space-y-4">
            <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#0284C7] dark:text-sky-400">
                  {activePrompt.taskLabel} · {getLangDisplayName(activePrompt.lang)}
                </div>
                <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  {activePrompt.title}
                </h1>
              </div>

              <p
                dir={isAr ? 'rtl' : 'ltr'}
                className={`text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line ${
                  isAr ? 'font-ar text-base leading-loose' : isJa ? 'font-jp' : ''
                }`}
              >
                {activePrompt.promptBody}
              </p>

              {activePrompt.readingExcerpt && (
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Kutipan Bacaan Tugas
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {activePrompt.readingExcerpt}
                  </p>
                </div>
              )}

              {activePrompt.audioBriefText && (
                <div className="p-3.5 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/60 flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-700 dark:text-slate-300">
                    <span className="font-bold text-[#2563EB] dark:text-blue-400">
                      Audio Kuliah / Dialog Tugas:
                    </span>{' '}
                    Putar audio singkat sebelum mulai menulis atau berbicara.
                  </div>
                  <button
                    type="button"
                    onClick={() => speakText(activePrompt.audioBriefText!, ttsLocale, 0.94)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shrink-0 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    Putar Audio
                  </button>
                </div>
              )}

              {activePrompt.bulletHints.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Panduan Struktur Jawaban
                  </div>
                  <ul className="list-disc pl-5 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    {activePrompt.bulletHints.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Timer + Editor / Speaking Recorder + Primary AI Agent CTA */}
            <div className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  {activePrompt.prepSec > 0 && (
                    <button
                      type="button"
                      onClick={() => switchTimerPhase('prep')}
                      className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                        timerPhase === 'prep'
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Persiapan ({activePrompt.prepSec}d)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => switchTimerPhase('response')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                      timerPhase === 'response'
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {isWriting ? 'Waktu Menulis' : 'Waktu Berbicara'} (
                    {formatClock(activePrompt.durationSec)})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 font-mono-num text-lg font-bold text-slate-900 dark:text-white">
                    <Clock className="w-4 h-4 text-[#0284C7]" />
                    {formatClock(remainingSec)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTimerRunning((r) => !r)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold cursor-pointer"
                  >
                    {timerRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    {timerRunning ? 'Jeda' : 'Mulai'}
                  </button>
                  <button
                    type="button"
                    onClick={() => switchTimerPhase(timerPhase)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                    aria-label="Reset timer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {isWriting ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                      Lembar Jawaban {getLangDisplayName(activePrompt.lang)}
                    </span>
                    <span
                      className={`font-mono-num font-bold ${
                        minWords > 0 && wordCount >= minWords
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {wordCount} {unitLabel}{' '}
                      {minWords > 0 ? `/ target minimal ${minWords} ${unitLabel}` : ''}
                    </span>
                  </div>
                  <textarea
                    dir={isAr ? 'rtl' : 'ltr'}
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    rows={12}
                    placeholder={
                      isJa
                        ? 'Tulis jawaban Bahasa Jepang Anda di sini (Hiragana/Katakana/Kanji), lalu klik Periksa dengan AI Agent...'
                        : isAr
                        ? 'اكتب إجابتك باللغة العربية الفصحى هنا ثم اضغط على زر التقييم بالذكاء الاصطناعي...'
                        : 'Tulis jawaban Bahasa Inggris Anda di sini, lalu klik tombol Periksa dengan AI Agent di bawah...'
                    }
                    className={`w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 text-sm text-slate-900 dark:text-white leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#0284C7] ${
                      isAr ? 'font-ar text-base leading-loose' : isJa ? 'font-jp text-base' : ''
                    }`}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                          Rekam Suara ({getLangDisplayName(activePrompt.lang)}) untuk Diperiksa AI Agent
                        </div>
                        <div className="text-[11px] text-slate-500">
                          AI Agent akan mentranskripsikan suara Anda, menilai kelancaran &amp;
                          tata bahasa, serta membandingkan dengan riwayat akun Anda.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={isRecording ? stopSelfRecording : startSelfRecording}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                          isRecording
                            ? 'bg-rose-600 hover:bg-rose-700 text-white'
                            : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                        }`}
                      >
                        {isRecording ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                        {isRecording ? 'Hentikan Rekaman' : 'Rekam Jawaban Suara'}
                      </button>
                    </div>
                    {recordingError && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">{recordingError}</p>
                    )}
                    {recordingUrl && (
                      <div className="pt-1 space-y-1">
                        <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          Rekaman siap diperiksa AI Agent:
                        </div>
                        <audio controls src={recordingUrl} className="w-full h-9" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Catatan Poin atau Transkrip Jawaban Lisan (Opsional jika sudah merekam audio)
                    </label>
                    <textarea
                      dir={isAr ? 'rtl' : 'ltr'}
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      rows={5}
                      placeholder={
                        isAr
                          ? 'يمكنك أيضاً كتابة نص إجابتك الشفهية هنا ليقوم الذكاء الاصطناعي بتقييمها...'
                          : isJa
                          ? 'Jika tidak memakai mikrofon, tulis jawaban lisan Bahasa Jepang Anda di sini...'
                          : 'Jika tidak memakai mikrofon, Anda bisa menuliskan jawaban lisan Anda di sini untuk tetap diperiksa AI Agent...'
                      }
                      className={`w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3.5 text-sm text-slate-900 dark:text-white leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#0284C7] ${
                        isAr ? 'font-ar text-base leading-loose' : isJa ? 'font-jp' : ''
                      }`}
                    />
                  </div>
                </div>
              )}

              {/* Primary AI Agent Check Button */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs text-slate-500">
                  Hasil evaluasi otomatis tersimpan ke Memori AI Agent akun Anda.
                </p>
                <button
                  type="button"
                  disabled={!canEvaluate || aiEvaluating || isRecording}
                  onClick={() => void handleEvaluateWithAi()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs sm:text-sm font-semibold disabled:opacity-45 cursor-pointer"
                >
                  {aiEvaluating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {aiEvaluating
                    ? isWriting
                      ? 'AI Agent sedang memeriksa tulisan...'
                      : 'AI Agent sedang mendengarkan & menilai...'
                    : isWriting
                    ? 'Periksa Tulisan dengan AI Agent'
                    : recordingBlob
                    ? 'Periksa Rekaman Suara dengan AI Agent'
                    : 'Periksa Jawaban Lisan dengan AI Agent'}
                </button>
              </div>
            </div>
          </section>

          {/* RIGHT ZONE — PERSONAL AI AGENT FEEDBACK / RUBRIC / MODEL */}
          <aside className="lg:col-span-5 bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="grid grid-cols-3 border-b border-slate-200 dark:border-slate-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => setRightTab('ai')}
                className={`py-3 text-center border-b-2 transition-colors cursor-pointer ${
                  rightTab === 'ai'
                    ? 'border-[#0284C7] text-[#0284C7] dark:text-sky-400'
                    : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                AI Agent Pribadi
              </button>
              <button
                type="button"
                onClick={() => setRightTab('rubric')}
                className={`py-3 text-center border-b-2 transition-colors cursor-pointer ${
                  rightTab === 'rubric'
                    ? 'border-[#2563EB] text-[#2563EB] dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Rubrik Mandiri
              </button>
              <button
                type="button"
                onClick={() => setRightTab('model')}
                className={`py-3 text-center border-b-2 transition-colors cursor-pointer ${
                  rightTab === 'model'
                    ? 'border-[#2563EB] text-[#2563EB] dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Model ({activePrompt.modelScoreLabel})
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[82vh] overflow-y-auto">
              {rightTab === 'ai' && (
                <div className="space-y-4">
                  {aiError && (
                    <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
                      {aiError}
                    </div>
                  )}

                  {aiEvaluating && (
                    <div className="p-6 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-2">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#0284C7]" />
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {isWriting
                          ? 'Menganalisis struktur, tata bahasa, ketepatan kosakata, dan membandingkan dengan riwayat akun Anda...'
                          : 'Mentranskripsikan rekaman suara dan mengevaluasi kelancaran Speaking Anda...'}
                      </div>
                    </div>
                  )}

                  {!aiEvaluating && !hasAiResult && (
                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-[#0284C7]" />
                        AI Agent Pemeriksa {isWriting ? 'Writing' : 'Speaking'} Pribadi
                      </div>
                      <p>
                        {isWriting
                          ? 'Tulis jawaban Anda di kolom kiri lalu klik "Periksa Tulisan dengan AI Agent". AI akan menilai sesuai rubrik, mengingat kesalahan berulang di akun Anda, memberi koreksi kalimat dalam Bahasa Indonesia, dan siap berdiskusi langsung setelahnya.'
                          : 'Rekam suara Anda (atau ketik transkripnya) di kolom kiri, lalu klik "Periksa Rekaman Suara dengan AI Agent". AI akan menampilkan transkrip, skor resmi, saran pelafalan, dan membuka sesi tanya jawab langsung.'}
                      </p>
                    </div>
                  )}

                  {/* WRITING AI RESULT */}
                  {!aiEvaluating && isWriting && writingEval && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-sky-50/70 dark:bg-sky-950/25 border border-sky-200 dark:border-sky-900 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Estimasi Skor Resmi (AI Agent)
                          </span>
                          <span className="font-mono-num text-2xl font-bold text-[#0284C7] dark:text-sky-300">
                            {writingEval.scoreLabel}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                          {writingEval.summaryId}
                        </p>
                        {savedNotice && (
                          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 pt-1">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            {savedNotice}
                          </div>
                        )}
                      </div>

                      {/* Per-Account Progress Comparison Memory */}
                      {writingEval.progressComparisonId && (
                        <div className="p-3.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/25 border border-indigo-200 dark:border-indigo-900/70 flex items-start gap-2.5 text-xs">
                          <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <div className="font-bold text-indigo-900 dark:text-indigo-200">
                              Catatan Perkembangan dari Memori AI Agent
                            </div>
                            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                              {writingEval.progressComparisonId}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Criteria Breakdown */}
                      <div className="space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Rincian Penilaian Rubrik
                        </div>
                        {writingEval.criteriaFeedback.map((cf) => (
                          <div
                            key={cf.criterionId}
                            className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-900 dark:text-white">
                                {cf.criterionName}
                              </span>
                              <span className="font-mono-num font-bold text-[#0284C7] dark:text-sky-400">
                                {cf.score}
                              </span>
                            </div>
                            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                              {cf.commentId}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Strengths & Improvements */}
                      <div className="grid grid-cols-1 gap-3 text-xs">
                        <div className="p-3.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 space-y-1">
                          <div className="font-bold text-emerald-800 dark:text-emerald-300">
                            Kelebihan Tulisan Anda
                          </div>
                          <ul className="list-disc pl-4 space-y-1 text-slate-700 dark:text-slate-300">
                            {writingEval.strengthsId.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="p-3.5 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 space-y-1">
                          <div className="font-bold text-amber-800 dark:text-amber-300">
                            Fokus Perbaikan Agar Skor Naik
                          </div>
                          <ul className="list-disc pl-4 space-y-1 text-slate-700 dark:text-slate-300">
                            {writingEval.improvementsId.map((imp, i) => (
                              <li key={i}>{imp}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* Sentence Corrections */}
                      {writingEval.corrections.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Koreksi Kalimat Spesifik
                          </div>
                          {writingEval.corrections.map((c, idx) => (
                            <div
                              key={idx}
                              className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1 text-xs"
                            >
                              <div
                                dir={isAr ? 'rtl' : 'ltr'}
                                className={`text-rose-600 dark:text-rose-400 line-through ${
                                  isAr ? 'font-ar text-sm' : isJa ? 'font-jp' : ''
                                }`}
                              >
                                {c.original}
                              </div>
                              <div
                                dir={isAr ? 'rtl' : 'ltr'}
                                className={`font-semibold text-emerald-700 dark:text-emerald-400 ${
                                  isAr ? 'font-ar text-sm' : isJa ? 'font-jp' : ''
                                }`}
                              >
                                {c.corrected}
                              </div>
                              <p className="text-slate-600 dark:text-slate-400">{c.reasonId}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Upgraded Version of User Essay */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Versi Peningkatan Tulisan Anda
                          </span>
                          <button
                            type="button"
                            onClick={() => speakText(writingEval.improvedSample, ttsLocale, 0.92)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0284C7] cursor-pointer"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                            Dengar
                          </button>
                        </div>
                        <div
                          dir={isAr ? 'rtl' : 'ltr'}
                          className={`p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line ${
                            isAr ? 'font-ar text-sm leading-loose' : isJa ? 'font-jp' : ''
                          }`}
                        >
                          {writingEval.improvedSample}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            Tips Lulus:{' '}
                          </span>
                          {writingEval.examTipsId}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* SPEAKING AI RESULT */}
                  {!aiEvaluating && !isWriting && speakingEval && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-sky-50/70 dark:bg-sky-950/25 border border-sky-200 dark:border-sky-900 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Estimasi Skor Speaking (AI Agent)
                          </span>
                          <span className="font-mono-num text-2xl font-bold text-[#0284C7] dark:text-sky-300">
                            {speakingEval.scoreLabel}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                          {speakingEval.summaryId}
                        </p>
                        {savedNotice && (
                          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 pt-1">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            {savedNotice}
                          </div>
                        )}
                      </div>

                      {speakingEval.progressComparisonId && (
                        <div className="p-3.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/25 border border-indigo-200 dark:border-indigo-900/70 flex items-start gap-2.5 text-xs">
                          <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <div className="font-bold text-indigo-900 dark:text-indigo-200">
                              Catatan Perkembangan dari Memori AI Agent
                            </div>
                            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                              {speakingEval.progressComparisonId}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1 text-xs">
                        <div className="font-bold text-slate-700 dark:text-slate-200">
                          Transkrip yang Terdengar oleh AI:
                        </div>
                        <p
                          dir={isAr ? 'rtl' : 'ltr'}
                          className={`italic text-slate-700 dark:text-slate-300 leading-relaxed ${
                            isAr ? 'font-ar text-sm not-italic leading-loose' : isJa ? 'font-jp not-italic' : ''
                          }`}
                        >
                          “{speakingEval.transcript}”
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Rincian Penilaian Rubrik
                        </div>
                        {speakingEval.criteriaFeedback.map((cf) => (
                          <div
                            key={cf.criterionId}
                            className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-900 dark:text-white">
                                {cf.criterionName}
                              </span>
                              <span className="font-mono-num font-bold text-[#0284C7] dark:text-sky-400">
                                {cf.score}
                              </span>
                            </div>
                            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                              {cf.commentId}
                            </p>
                          </div>
                        ))}
                      </div>

                      {speakingEval.pronunciationAndFluencyId.length > 0 && (
                        <div className="p-3.5 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 space-y-1 text-xs">
                          <div className="font-bold text-amber-800 dark:text-amber-300">
                            Catatan Kelancaran &amp; Pengucapan
                          </div>
                          <ul className="list-disc pl-4 space-y-1 text-slate-700 dark:text-slate-300">
                            {speakingEval.pronunciationAndFluencyId.map((note, i) => (
                              <li key={i}>{note}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {speakingEval.grammarAndVocabFixes.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Perbaikan Ungkapan &amp; Tata Bahasa
                          </div>
                          {speakingEval.grammarAndVocabFixes.map((fix, idx) => (
                            <div
                              key={idx}
                              className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1 text-xs"
                            >
                              <div
                                dir={isAr ? 'rtl' : 'ltr'}
                                className={`text-rose-600 dark:text-rose-400 line-through ${
                                  isAr ? 'font-ar text-sm' : isJa ? 'font-jp' : ''
                                }`}
                              >
                                {fix.original}
                              </div>
                              <div
                                dir={isAr ? 'rtl' : 'ltr'}
                                className={`font-semibold text-emerald-700 dark:text-emerald-400 ${
                                  isAr ? 'font-ar text-sm' : isJa ? 'font-jp' : ''
                                }`}
                              >
                                {fix.corrected}
                              </div>
                              <p className="text-slate-600 dark:text-slate-400">{fix.reasonId}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Contoh Jawaban Lisan Alami (Skor Tinggi)
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              speakText(speakingEval.naturalPhrasingSample, ttsLocale, 0.92)
                            }
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0284C7] cursor-pointer"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                            Dengarkan Contoh
                          </button>
                        </div>
                        <div
                          dir={isAr ? 'rtl' : 'ltr'}
                          className={`p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line ${
                            isAr ? 'font-ar text-sm leading-loose' : isJa ? 'font-jp' : ''
                          }`}
                        >
                          {speakingEval.naturalPhrasingSample}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            Saran Percaya Diri:{' '}
                          </span>
                          {speakingEval.confidenceTipId}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* DIRECT FOLLOW-UP Q&A WITH PERSONAL AI AGENT */}
                  {!aiEvaluating && hasAiResult && (
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                          <MessageSquare className="w-4 h-4 text-[#0284C7]" />
                          Diskusi Lanjutan dengan AI Agent
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            openAiTutorWithPrompt(
                              `Tolong bantu saya membahas hasil ${
                                isWriting ? 'Writing' : 'Speaking'
                              } untuk topik "${activePrompt.title}" (skor ${
                                (isWriting ? writingEval?.scoreLabel : speakingEval?.scoreLabel) ??
                                ''
                              }).`,
                              activePrompt.lang
                            )
                          }
                          className="text-[11px] font-semibold text-[#0284C7] hover:underline cursor-pointer"
                        >
                          Buka di Drawer Tutor AI
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {quickFollowUpPrompts.map((q) => (
                          <button
                            key={q}
                            type="button"
                            disabled={followUpLoading}
                            onClick={() => void handleAskFollowUp(q)}
                            className="text-left px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 hover:border-[#0284C7] text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer disabled:opacity-50"
                          >
                            {q}
                          </button>
                        ))}
                      </div>

                      {followUpMessages.length > 0 && (
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {followUpMessages.map((msg, idx) => (
                            <div
                              key={idx}
                              className={`p-3 rounded-lg text-xs leading-relaxed whitespace-pre-line ${
                                msg.role === 'user'
                                  ? 'bg-[#0284C7] text-white ml-6'
                                  : 'bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 mr-4 border border-slate-200 dark:border-slate-800'
                              }`}
                            >
                              {msg.content}
                            </div>
                          ))}
                          {followUpLoading && (
                            <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-900 text-xs text-slate-500 inline-flex items-center gap-2">
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0284C7]" />
                              AI Agent sedang menjawab...
                            </div>
                          )}
                        </div>
                      )}

                      {followUpError && (
                        <p className="text-xs text-rose-600 dark:text-rose-400">{followUpError}</p>
                      )}

                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void handleAskFollowUp();
                        }}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="text"
                          value={followUpInput}
                          onChange={(e) => setFollowUpInput(e.target.value)}
                          disabled={followUpLoading}
                          placeholder="Tanyakan alasan koreksi, grammar, atau minta contoh lain..."
                          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#0284C7]"
                        />
                        <button
                          type="submit"
                          disabled={followUpLoading || !followUpInput.trim()}
                          aria-label="Kirim pertanyaan lanjutan"
                          className="p-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white disabled:opacity-45 cursor-pointer shrink-0"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              )}

              {rightTab === 'rubric' && (
                <>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Nilai jawaban Anda sendiri berdasarkan kriteria{' '}
                    {getExamTrackLabel(activePrompt.examTrack)}. Anda juga bisa menggunakan tab{' '}
                    <strong>AI Agent Pribadi</strong> untuk penilaian otomatis.
                  </p>

                  <div className="space-y-4">
                    {activePrompt.rubricCriteria.map((criterion) => {
                      const chosen = criteriaScores[criterion.id];
                      return (
                        <div
                          key={criterion.id}
                          className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2.5"
                        >
                          <div>
                            <div className="text-xs font-bold text-slate-900 dark:text-white">
                              {criterion.name}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {criterion.description}
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            {criterion.levels.map((lvl) => {
                              const active = chosen === lvl.score;
                              return (
                                <button
                                  key={lvl.score}
                                  type="button"
                                  onClick={() =>
                                    setCriteriaScores((prev) => ({
                                      ...prev,
                                      [criterion.id]: lvl.score,
                                    }))
                                  }
                                  className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                                    active
                                      ? 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/30 text-slate-900 dark:text-white'
                                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                                  }`}
                                >
                                  <div className="font-bold font-mono-num">{lvl.label}</div>
                                  <div className="text-[11px] mt-0.5 leading-snug">
                                    {lvl.descriptor}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                        Estimasi Skor Mandiri
                      </span>
                      <span className="font-mono-num text-xl font-bold text-[#2563EB] dark:text-blue-400">
                        {computedScore ? computedScore.scoreLabel : '—'}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={!computedScore?.complete}
                      onClick={handleSaveEvaluation}
                      className="w-full py-2.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                    >
                      {computedScore?.complete
                        ? 'Simpan Evaluasi ke Riwayat'
                        : 'Pilih Skor untuk Semua Kriteria'}
                    </button>
                    {savedNotice && (
                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        {savedNotice}
                      </div>
                    )}
                  </div>
                </>
              )}

              {rightTab === 'model' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#2563EB] dark:text-blue-400">
                      Referensi {activePrompt.modelScoreLabel}
                    </span>
                    {!activePrompt.isFreeTopic && (
                      <button
                        type="button"
                        onClick={() => speakText(activePrompt.modelAnswer, ttsLocale, 0.92)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        Dengar Model
                      </button>
                    )}
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                    {activePrompt.modelAnswer}
                  </div>

                  {activePrompt.keyExpressions.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Frasa &amp; Ekspresi Nilai Tinggi
                      </div>
                      {activePrompt.keyExpressions.map((exp) => (
                        <div
                          key={exp.phrase}
                          className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3"
                        >
                          <div className="space-y-0.5">
                            <div className="text-xs font-bold text-slate-900 dark:text-white">
                              {exp.phrase}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {exp.noteId}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => speakText(exp.phrase, ttsLocale, 0.94)}
                            className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer shrink-0"
                            aria-label={`Putar ${exp.phrase}`}
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    );
  }

  // STUDIO TASK CATALOG + MULTILINGUAL FREE-TOPIC BUILDER + PERSONAL AI MEMORY
  const history = state.langStudioHistory ?? [];
  const aiEvaluatedHistory = history.filter((h) => h.aiEvaluated || h.scoreLabel.includes('(AI)'));
  const recentImprovements = Array.from(
    new Set(
      history
        .slice(0, 6)
        .flatMap((h) => h.keyImprovements ?? [])
        .filter(Boolean)
    )
  ).slice(0, 4);

  const sampleTopics = SAMPLE_FREE_TOPICS[freeLang];

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <button
            type="button"
            onClick={handleBackToHome}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Kembali ke Beranda
          </button>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Studio AI Menulis &amp; Berbicara Pribadi
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            AI Agent pribadi untuk memeriksa tulisan dan rekaman suara Bahasa Inggris, Jepang, dan
            Arab — lengkap dengan memori kesalahan akun Anda, skor rubrik, dan diskusi lanjutan.
          </p>
        </div>
      </div>

      {/* Personal AI Agent Memory Banner (when user has prior evaluations) */}
      {history.length > 0 && (
        <section className="bg-sky-50/70 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900/70 rounded-xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-[#0284C7] dark:text-sky-400" />
              <h2 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Memori AI Agent Akun Anda
              </h2>
            </div>
            <div className="text-xs font-mono-num font-semibold text-[#0284C7] dark:text-sky-300">
              {aiEvaluatedHistory.length} evaluasi AI tersimpan · Terbaru: {history[0].scoreLabel}
            </div>
          </div>
          {recentImprovements.length > 0 ? (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Pola Perbaikan yang Diingat AI Agent dari Latihan Sebelumnya:
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                {recentImprovements.map((imp, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-[#0284C7] font-bold">•</span>
                    <span>{imp}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-slate-600 dark:text-slate-400">
              AI Agent menggunakan riwayat evaluasi Anda untuk memantau peningkatan skor di latihan
              berikutnya.
            </p>
          )}
        </section>
      )}

      {/* MULTILINGUAL FREE-TOPIC AI AGENT BUILDER */}
      <section className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0284C7] dark:text-sky-400">
              <PenTool className="w-3.5 h-3.5" />
              Mode Topik Bebas · Multibahasa
            </div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Latihan Writing &amp; Speaking dengan Topik Sendiri
            </h2>
          </div>

          {/* Language Selector */}
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-1 gap-1">
            {(
              [
                { id: 'en', label: 'Inggris' },
                { id: 'ja', label: 'Jepang (JLPT)' },
                { id: 'ar', label: 'Arab (TOAFL)' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setFreeLang(opt.id);
                  setFreeExamTrack(
                    opt.id === 'ja' ? 'jlpt' : opt.id === 'ar' ? 'toafl' : 'ielts'
                  );
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  freeLang === opt.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quick 1-click presets for selected language */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {sampleTopics.map((topic) => (
            <button
              key={topic.title}
              type="button"
              onClick={() => handleLaunchFreeTopic(topic)}
              className="text-left p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-[#0284C7] bg-slate-50/70 dark:bg-slate-900/40 transition-colors space-y-1.5 cursor-pointer"
            >
              <div className="text-[11px] font-semibold text-[#0284C7] dark:text-sky-400">
                {getExamTrackLabel(topic.examTrack)} ·{' '}
                {topic.skill === 'writing' ? 'Menulis' : 'Berbicara'}
              </div>
              <div className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2">
                {topic.title}
              </div>
              <p
                dir={freeLang === 'ar' ? 'rtl' : 'ltr'}
                className={`text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 ${
                  freeLang === 'ar' ? 'font-ar' : freeLang === 'ja' ? 'font-jp' : ''
                }`}
              >
                {topic.promptBody}
              </p>
            </button>
          ))}
        </div>

        {/* Custom topic form */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-3 space-y-1">
            <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Keterampilan &amp; Standar Nilai
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={freeSkill}
                onChange={(e) => setFreeSkill(e.target.value as 'writing' | 'speaking')}
                className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold"
              >
                <option value="writing">Menulis</option>
                <option value="speaking">Berbicara</option>
              </select>
              <select
                value={freeExamTrack}
                onChange={(e) => setFreeExamTrack(e.target.value as StudioExamTrack)}
                className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold"
              >
                {freeLang === 'en' && (
                  <>
                    <option value="ielts">IELTS</option>
                    <option value="toefl-ibt">TOEFL iBT</option>
                  </>
                )}
                {freeLang === 'ja' && <option value="jlpt">JLPT</option>}
                {freeLang === 'ar' && <option value="toafl">TOAFL</option>}
                <option value="free-practice">Bebas (0–100)</option>
              </select>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-1">
            <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Judul Topik Anda
            </label>
            <input
              type="text"
              value={freeTitle}
              onChange={(e) => setFreeTitle(e.target.value)}
              placeholder="Mis. Esai Beasiswa / Latihan Wawancara"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#0284C7]"
            />
          </div>

          <div className="lg:col-span-4 space-y-1">
            <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Instruksi / Pertanyaan Soal (Opsional)
            </label>
            <input
              type="text"
              value={freePromptBody}
              onChange={(e) => setFreePromptBody(e.target.value)}
              placeholder="Tempel soal ujian atau tulis topik yang ingin diperiksa AI..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#0284C7]"
            />
          </div>

          <div className="lg:col-span-2">
            <button
              type="button"
              onClick={() => handleLaunchFreeTopic()}
              className="w-full py-2 px-3 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Mulai Topik Bebas
            </button>
          </div>
        </div>
      </section>

      {/* OFFICIAL IELTS & TOEFL iBT BANK */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Bank Tugas Resmi IELTS &amp; TOEFL iBT
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Dilengkapi kutipan bacaan, audio tugas, model jawaban Band 8.0 / 28+, dan pemeriksaan AI
            Agent.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value as 'all' | 'ielts' | 'toefl-ibt')}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-xs font-semibold"
          >
            <option value="all">Semua Ujian</option>
            <option value="ielts">IELTS Academic</option>
            <option value="toefl-ibt">TOEFL iBT</option>
          </select>

          <select
            value={skillFilter}
            onChange={(e) => setSkillFilter(e.target.value as 'all' | 'writing' | 'speaking')}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161A22] text-xs font-semibold"
          >
            <option value="all">Menulis &amp; Berbicara</option>
            <option value="writing">Menulis (Writing) Saja</option>
            <option value="speaking">Berbicara (Speaking) Saja</option>
          </select>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPrompts.map((prompt) => {
          const latest = history.find((h) => h.promptId === prompt.id);
          return (
            <div
              key={prompt.id}
              className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-[#2563EB] dark:text-blue-400">
                  {prompt.examTrack.toUpperCase()} ·{' '}
                  {prompt.skill === 'writing' ? 'Menulis (Writing)' : 'Berbicara (Speaking)'} ·{' '}
                  {prompt.taskLabel}
                </div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {prompt.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed">
                  {prompt.promptBody}
                </p>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-mono-num">
                    {prompt.prepSec > 0 ? `Persiapan ${prompt.prepSec}d · ` : ''}
                    {Math.round(prompt.durationSec / 60) >= 1
                      ? `${Math.round(prompt.durationSec / 60)} menit`
                      : `${prompt.durationSec} detik`}
                    {prompt.minWords ? ` · min ${prompt.minWords} kata` : ''}
                  </span>
                  {latest && (
                    <span className="font-mono-num font-bold text-emerald-600 dark:text-emerald-400">
                      {latest.scoreLabel}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openPrompt(prompt)}
                  className="w-full py-2.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer"
                >
                  Buka Studio &amp; AI Agent
                </button>
              </div>
            </div>
          );
        })}
      </section>

      {history.length > 0 && (
        <section className="bg-white dark:bg-[#161A22] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Riwayat Evaluasi Writing &amp; Speaking Terbaru
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {history.slice(0, 8).map((h) => (
              <div
                key={h.id}
                className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="space-y-0.5">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white">{h.title}</span>
                    <span className="text-slate-500 ml-2">
                      {(h.language ?? 'en').toUpperCase()} · {getExamTrackLabel(h.examTrack)} ·{' '}
                      {h.skill === 'writing' ? 'Menulis' : 'Berbicara'}
                      {h.wordCount ? ` · ${h.wordCount} kata` : ''}
                    </span>
                  </div>
                  {h.summaryId && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                      {h.summaryId}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 font-mono-num">
                  <span className="font-bold text-[#0284C7] dark:text-sky-400">
                    {h.scoreLabel}
                  </span>
                  <span className="text-slate-400">
                    {new Date(h.completedAt).toLocaleDateString('id-ID')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
};
