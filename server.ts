import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY belum terpasang di server. Silakan cek pengaturan Secrets di AI Studio.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function handleApiError(res: Response, err: unknown, fallbackMsg: string) {
  const rawMessage = err instanceof Error ? err.message : fallbackMsg;
  const lower = rawMessage.toLowerCase();
  if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('403')) {
    res.status(403).json({
      error:
        'Kunci API AI tidak valid atau belum memiliki izin. Silakan periksa API Key pada panel Settings > Secrets.',
    });
    return;
  }
  if (lower.includes('resource_exhausted') || lower.includes('429')) {
    res.status(429).json({
      error:
        'Batas penggunaan AI sementara tercapai. Tunggu beberapa saat lalu coba lagi.',
    });
    return;
  }
  res.status(500).json({ error: rawMessage || fallbackMsg });
}

interface LearnerContextPayload {
  displayName?: string;
  coachingStyle?: 'friendly' | 'examiner' | 'step-by-step';
  targetGoal?: string;
  jlptStage?: string;
  weakItems?: string[];
  recentExams?: string[];
  recentStudioMemory?: string[];
  streakDays?: number;
}

function formatLearnerContextPrompt(ctx?: LearnerContextPayload): string {
  if (!ctx || typeof ctx !== 'object') return '';
  const lines: string[] = [];
  if (ctx.displayName) {
    lines.push(`- Nama pelajar: ${String(ctx.displayName).slice(0, 60)}`);
  }
  if (ctx.targetGoal) {
    lines.push(`- Target pribadi pelajar: ${String(ctx.targetGoal).slice(0, 120)}`);
  }
  if (ctx.jlptStage) {
    lines.push(`- Posisi belajar Bahasa Jepang saat ini: ${String(ctx.jlptStage).slice(0, 60)}`);
  }
  if (typeof ctx.streakDays === 'number' && ctx.streakDays > 0) {
    lines.push(`- Konsistensi streak belajar: ${ctx.streakDays} hari`);
  }
  if (Array.isArray(ctx.recentExams) && ctx.recentExams.length > 0) {
    lines.push(
      `- Riwayat skor simulasi terakhir: ${ctx.recentExams
        .slice(0, 5)
        .map((s) => String(s).slice(0, 80))
        .join('; ')}`
    );
  }
  if (Array.isArray(ctx.recentStudioMemory) && ctx.recentStudioMemory.length > 0) {
    lines.push(
      `- Memori riwayat Writing & Speaking akun ini (bandingkan perkembangan & perhatikan pola kesalahan berulang):\n  ${ctx.recentStudioMemory
        .slice(0, 5)
        .map((s) => `• ${String(s).slice(0, 220)}`)
        .join('\n  ')}`
    );
  }
  if (Array.isArray(ctx.weakItems) && ctx.weakItems.length > 0) {
    lines.push(
      `- Materi SRS yang masih sering salah / rawan lupa: ${ctx.weakItems
        .slice(0, 8)
        .map((s) => String(s).slice(0, 90))
        .join(', ')}`
    );
  }

  const styleGuide =
    ctx.coachingStyle === 'examiner'
      ? 'Gaya mengajar pilihan pelajar: TEGAS & OBJEKTIF ala Penguji Resmi (langsung tunjukkan celah kesalahan, beri standar skor ketat, tetap suportif).'
      : ctx.coachingStyle === 'step-by-step'
      ? 'Gaya mengajar pilihan pelajar: SUPER DETAIL LANGKAH-DEMI-LANGKAH (uraikan pelan-pelan dari konsep paling dasar dengan analogi sederhana).'
      : 'Gaya mengajar pilihan pelajar: RAMAH, SABAR & MEMOTIVASI (hangat, membesarkan hati, bahasa sehari-hari yang ringan).';

  if (lines.length === 0) {
    return `\n\nPREFERENSI AKUN PELAJAR:\n${styleGuide}`;
  }

  return `\n\nPROFIL & MEMORI AKUN PELAJAR (gunakan secara alami untuk mempersonalisasi penilaian, perbandingan progres, & latihan):\n${lines.join('\n')}\n${styleGuide}`;
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, hasAiKey: Boolean(process.env.GEMINI_API_KEY) });
  });

  // ---------------------------------------------------------------------------
  // 1. POST /api/ai/tutor — Tutor AI Multibahasa Interaktif (Bahasa Indonesia)
  // ---------------------------------------------------------------------------
  app.post('/api/ai/tutor', async (req: Request, res: Response) => {
    try {
      const {
        language = 'all',
        examTarget = '',
        messages = [],
        learnerContext,
        evaluationContext = '',
      } = req.body as {
        language?: string;
        examTarget?: string;
        messages?: { role: 'user' | 'assistant'; content: string }[];
        learnerContext?: LearnerContextPayload;
        evaluationContext?: string;
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Pesan pertanyaan tidak boleh kosong.' });
        return;
      }

      const ai = getAiClient();
      const langContext =
        language === 'ja'
          ? 'Bahasa Jepang (JLPT N5 hingga N1: Kanji, Kosakata, Tata Bahasa, Dokkai, Chōkai, Sakubun/Writing, Kaiwa/Speaking)'
          : language === 'en'
          ? 'Bahasa Inggris (TOEFL ITP, TOEFL iBT, IELTS Academic, TOEIC: Vocabulary, Grammar, Reading, Listening, Writing, Speaking)'
          : language === 'ar'
          ? 'Bahasa Arab Fusha (TOAFL UIN/PTKIN: Mufradat, Nahwu & Shorof, Tarakib, Qira’ah, Istima’, Insya’/Writing, Muhadatsah/Speaking)'
          : 'Multibahasa (Bahasa Jepang JLPT N5–N1, Bahasa Inggris TOEFL/IELTS/TOEIC, Bahasa Arab TOAFL)';

      const personalBlock = formatLearnerContextPrompt(learnerContext);
      const evalBlock = String(evaluationContext || '').trim()
        ? `\n\nKONTEKS HASIL EVALUASI WRITING/SPEAKING YANG SEDANG DIDISKUSIKAN:\n${String(evaluationContext).slice(0, 5000)}\nGunakan konteks evaluasi di atas secara langsung untuk menjawab pertanyaan lanjutan pelajar tentang skor, koreksi kalimat, pelafalan, atau revisi paragraf.`
        : '';

      const systemInstruction = `Kamu adalah AI Agent Tutor & Pemeriksa Bahasa Pribadi di platform Leksika yang sabar, terstruktur, dan ahli membantu pelajar Indonesia benar-benar paham materi dan yakin lulus ujian kemampuan bahasa.

Konteks aktif pelajar: ${langContext}${examTarget ? ` · Target ujian: ${examTarget}` : ''}.${personalBlock}${evalBlock}

ATURAN WAJIB:
1. SELALU jawab dalam Bahasa Indonesia yang alami, hangat, jelas, dan mudah dipahami (jangan gunakan istilah rumit tanpa penjelasan sederhana).
2. Jika menampilkan contoh bahasa Jepang, sertakan furigana/cara baca hiragana + terjemahan Bahasa Indonesia yang akurat.
3. Jika menampilkan contoh bahasa Arab, sertakan harakat lengkap + transliterasi Latin + terjemahan Bahasa Indonesia yang akurat.
4. Jika menampilkan contoh bahasa Inggris, sertakan terjemahan Bahasa Indonesia dan jelaskan nuansa pemakaiannya di ujian TOEFL/IELTS/TOEIC.
5. Gunakan struktur ringkas dan rapi: (a) Inti Jawaban / Rumus Mudah, (b) Contoh Kontekstual + Terjemahan Indonesia, (c) Jebakan Umum di Ujian & Tips Lulus, dan (d) 1 Pertanyaan Latihan Singkat jika relevan.
6. Panjang jawaban ideal 120–320 kata kecuali pelajar meminta penjelasan panjang atau revisi esai lengkap.`;

      const recentHistory = messages.slice(-12).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.content || '').slice(0, 4000) }],
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: recentHistory,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      res.json({
        reply: (response.text ?? '').trim() || 'Maaf, Tutor AI belum dapat menyusun jawaban. Silakan coba lagi.',
      });
    } catch (err) {
      handleApiError(res, err, 'Gagal menghubungi Tutor AI.');
    }
  });

  // ---------------------------------------------------------------------------
  // 2. POST /api/ai/evaluate-writing — Pemeriksa Esai & Tulisan AI Terstruktur
  // ---------------------------------------------------------------------------
  app.post('/api/ai/evaluate-writing', async (req: Request, res: Response) => {
    try {
      const {
        language = 'en',
        examTrack = 'ielts',
        taskTitle = '',
        promptBody = '',
        readingExcerpt = '',
        minWords = 0,
        userEssay = '',
        rubricCriteria = [],
        learnerContext,
      } = req.body as {
        language?: 'en' | 'ja' | 'ar';
        examTrack?: string;
        taskTitle?: string;
        promptBody?: string;
        readingExcerpt?: string;
        minWords?: number;
        userEssay?: string;
        rubricCriteria?: { id: string; name: string; description: string }[];
        learnerContext?: LearnerContextPayload;
      };

      const cleanedEssay = String(userEssay || '').trim();
      if (cleanedEssay.length < 15) {
        res.status(400).json({
          error: 'Tuliskan jawaban terlebih dahulu (minimal beberapa kalimat) agar Tutor AI dapat menilai secara akurat.',
        });
        return;
      }

      const ai = getAiClient();
      const isIelts = examTrack === 'ielts';
      const isToeflIbt = examTrack === 'toefl-ibt';
      const maxScore = isIelts ? 9 : isToeflIbt ? 30 : 100;

      const rubricDesc =
        rubricCriteria.length > 0
          ? rubricCriteria.map((c) => `- id: "${c.id}", nama: "${c.name}" (${c.description})`).join('\n')
          : '- id: "task", nama: "Kesesuaian Tugas"\n- id: "coherence", nama: "Alur & Koherensi"\n- id: "lexical", nama: "Kosakata"\n- id: "grammar", nama: "Tata Bahasa"';

      const scoringGuide = isIelts
        ? 'Gunakan skala resmi IELTS Band 0.0 sampai 9.0 dengan kelipatan 0.5 (mis. 6.0, 6.5, 7.0). Skor tiap kriteria juga dalam skala 0.0–9.0.'
        : isToeflIbt
        ? 'Gunakan skala resmi TOEFL iBT 0 sampai 30 untuk overallScore, dan skala 1 sampai 5 untuk skor tiap kriteria rubrik.'
        : 'Gunakan skala 0 sampai 100 untuk overallScore (mis. 78/100) dan skala 1 sampai 10 untuk tiap kriteria.';

      const languageSpecificGuide =
        language === 'ja'
          ? 'Bahasa target adalah BAHASA JEPANG (Sakubun / JLPT). Evaluasi ketepatan partikel (助詞), penggunaan kanji/kana, kesesuaian gaya bahasa (丁寧語 desu/masu atau 普通形), serta kealamian ungkapan. Pada improvedSample dan koreksi, sertakan bacaan hiragana dalam tanda kurung untuk kanji yang agak sulit.'
          : language === 'ar'
          ? 'Bahasa target adalah BAHASA ARAB FUSHA (Insya’ / TOAFL). Evaluasi ketepatan Nahwu (I’rab), Shorof, kesesuaian mudzakkar/muannats, dan pilihan uslub/kosakata Fusha. Pada improvedSample dan bagian corrected, WAJIB sertakan harakat lengkap agar pelajar Indonesia mudah membacanya.'
          : 'Bahasa target adalah BAHASA INGGRIS (IELTS / TOEFL iBT / Akademik). Evaluasi kejelasan argumen, kohesi antar paragraf, variasi kosakata akademik, dan akurasi tata bahasa.';

      const personalBlock = formatLearnerContextPrompt(learnerContext);
      const hasPriorStudio =
        Array.isArray(learnerContext?.recentStudioMemory) &&
        learnerContext.recentStudioMemory.length > 0;

      const systemInstruction = `Kamu adalah AI Agent Penguji Resmi Writing (${examTrack.toUpperCase()}) sekaligus Mentor Bahasa Pribadi yang menjelaskan SEMUA umpan balik, alasan koreksi, perbandingan progres, dan saran dalam Bahasa Indonesia yang sangat jelas, ramah, dan mudah dipahami.
${scoringGuide}
${languageSpecificGuide}
Berikan penilaian objektif sesuai kualitas tulisan nyata pelajar (jangan melebih-lebihkan skor jika masih banyak kesalahan, tetapi selalu beri arahan perbaikan yang membangun dan konkret agar pelajar tahu persis cara menaikkan skornya).${personalBlock}`;

      const userPrompt = `Evaluasi jawaban Writing berikut:
Bahasa target: ${language.toUpperCase()} · Jalur ujian: ${examTrack.toUpperCase()}
Judul tugas: ${taskTitle}
Instruksi soal:
${promptBody}
${readingExcerpt ? `\nKutipan bacaan referensi:\n${readingExcerpt}` : ''}
${minWords ? `\nTarget minimal kata: ${minWords} kata` : ''}

Kriteria rubrik yang wajib dinilai (gunakan persis id yang diberikan):
${rubricDesc}

=== JAWABAN PELAJAR ===
${cleanedEssay}
=== AKHIR JAWABAN ===

Instruksi khusus field "progressComparisonId":
${
  hasPriorStudio
    ? 'Bandingkan tulisan ini secara singkat (2–3 kalimat) dengan riwayat Writing/Speaking sebelumnya di profil akun pelajar: sebutkan aspek yang sudah membaik DAN pola kesalahan yang masih berulang.'
    : 'Karena ini salah satu latihan Writing pertama yang tercatat di memori AI Agent akun ini, tuliskan 2 kalimat catatan baseline awal yang menjadi titik acuan latihan berikutnya.'
}

Berikan hasil evaluasi JSON yang lengkap dalam Bahasa Indonesia untuk seluruh penjelasan, komentar, kelebihan, kekurangan, dan alasan koreksi. Untuk field "improvedSample", tuliskan versi peningkatan dari tulisan pelajar dalam bahasa target (${language.toUpperCase()}) yang setara skor tinggi sambil mempertahankan ide utama pelajar.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overallScore: { type: Type.NUMBER },
              maxScore: { type: Type.NUMBER },
              scoreLabel: { type: Type.STRING },
              summaryId: { type: Type.STRING },
              progressComparisonId: { type: Type.STRING },
              criteriaFeedback: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    criterionId: { type: Type.STRING },
                    criterionName: { type: Type.STRING },
                    score: { type: Type.NUMBER },
                    commentId: { type: Type.STRING },
                  },
                  required: ['criterionId', 'criterionName', 'score', 'commentId'],
                },
              },
              strengthsId: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              improvementsId: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              corrections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    original: { type: Type.STRING },
                    corrected: { type: Type.STRING },
                    reasonId: { type: Type.STRING },
                  },
                  required: ['original', 'corrected', 'reasonId'],
                },
              },
              improvedSample: { type: Type.STRING },
              examTipsId: { type: Type.STRING },
            },
            required: [
              'overallScore',
              'maxScore',
              'scoreLabel',
              'summaryId',
              'progressComparisonId',
              'criteriaFeedback',
              'strengthsId',
              'improvementsId',
              'corrections',
              'improvedSample',
              'examTipsId',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      parsed.maxScore = maxScore;
      res.json(parsed);
    } catch (err) {
      handleApiError(res, err, 'Gagal menilai esai dengan AI.');
    }
  });

  // ---------------------------------------------------------------------------
  // 3. POST /api/ai/evaluate-speaking — Transkripsi Audio + Pemeriksa Speaking AI
  // ---------------------------------------------------------------------------
  app.post('/api/ai/evaluate-speaking', async (req: Request, res: Response) => {
    try {
      const {
        language = 'en',
        examTrack = 'ielts',
        taskTitle = '',
        promptBody = '',
        audioBase64 = '',
        audioMimeType = 'audio/webm',
        transcriptText = '',
        rubricCriteria = [],
        learnerContext,
      } = req.body as {
        language?: 'en' | 'ja' | 'ar';
        examTrack?: string;
        taskTitle?: string;
        promptBody?: string;
        audioBase64?: string;
        audioMimeType?: string;
        transcriptText?: string;
        rubricCriteria?: { id: string; name: string; description: string }[];
        learnerContext?: LearnerContextPayload;
      };

      const hasAudio = Boolean(audioBase64 && audioBase64.length > 50);
      const manualTranscript = String(transcriptText || '').trim();

      if (!hasAudio && manualTranscript.length < 10) {
        res.status(400).json({
          error:
            'Rekam suara Anda terlebih dahulu atau ketik transkrip/jawaban lisan Anda agar Tutor AI dapat memeriksanya.',
        });
        return;
      }

      const ai = getAiClient();
      let finalTranscript = manualTranscript;

      // Step A: Transcribe uploaded browser audio via gemini-3.5-transcribe
      if (hasAudio) {
        const cleanBase64 = audioBase64.includes(',')
          ? audioBase64.split(',')[1]
          : audioBase64;
        const transcribeResp = await ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: audioMimeType || 'audio/webm',
                  data: cleanBase64,
                },
              },
              {
                text: `Transkripsikan rekaman suara ini secara akurat apa adanya (termasuk jeda atau pengulangan bila ada) dalam bahasa ${language.toUpperCase()}.`,
              },
            ],
          },
        });
        const transcribed = (transcribeResp.text ?? '').trim();
        if (transcribed) {
          finalTranscript = transcribed;
        }
      }

      if (!finalTranscript) {
        res.status(400).json({
          error:
            'Audio terlalu pelan atau tidak terdengar kata yang jelas. Coba rekam ulang di tempat yang lebih tenang atau tuliskan teks jawaban lisan Anda.',
        });
        return;
      }

      // Step B: Evaluate speaking performance with official rubric & Indonesian coaching
      const isIelts = examTrack === 'ielts';
      const isToeflIbt = examTrack === 'toefl-ibt';
      const maxScore = isIelts ? 9 : isToeflIbt ? 30 : 100;

      const rubricDesc =
        rubricCriteria.length > 0
          ? rubricCriteria.map((c) => `- id: "${c.id}", nama: "${c.name}" (${c.description})`).join('\n')
          : '- id: "fluency", nama: "Kelancaran & Koherensi"\n- id: "lexical", nama: "Kosakata"\n- id: "grammar", nama: "Tata Bahasa"\n- id: "pronunciation", nama: "Kejelasan & Intonasi"';

      const scoringGuide = isIelts
        ? 'Skala resmi IELTS Speaking Band 0.0–9.0 (kelipatan 0.5) untuk overallScore dan setiap kriteria.'
        : isToeflIbt
        ? 'Skala resmi TOEFL iBT Speaking 0–30 untuk overallScore dan 1–5 untuk setiap kriteria.'
        : 'Skala 0–100 untuk overallScore dan 1–10 untuk setiap kriteria.';

      const speakingLangGuide =
        language === 'ja'
          ? 'Bahasa target adalah BAHASA JEPANG (Kaiwa / Percakapan JLPT). Nilai kealamian intonasi/kelancaran, ketepatan partikel & kesopanan (desu/masu atau keigo sesuai konteks), serta berikan furigana/hiragana untuk kata sulit di naturalPhrasingSample.'
          : language === 'ar'
          ? 'Bahasa target adalah BAHASA ARAB FUSHA (Muhadatsah / TOAFL). Nilai kejelasan makharijul huruf dari transkrip, kelancaran, ketepatan I’rab/tata bahasa lisan, dan WAJIB beri harakat lengkap pada naturalPhrasingSample serta koreksi.'
          : 'Bahasa target adalah BAHASA INGGRIS (IELTS / TOEFL iBT / Percakapan). Nilai kelancaran, koherensi, variasi kosakata alami, tata bahasa lisan, dan saran pengucapan.';

      const hasPriorStudio =
        Array.isArray(learnerContext?.recentStudioMemory) &&
        learnerContext.recentStudioMemory.length > 0;

      const personalBlock = formatLearnerContextPrompt(learnerContext);
      const evalPrompt = `Kamu adalah AI Agent Penguji Speaking Resmi (${examTrack.toUpperCase()}) sekaligus Mentor Bahasa Pribadi untuk pelajar Indonesia.
${scoringGuide}
${speakingLangGuide}${personalBlock}

Evaluasi jawaban Speaking berikut:
Bahasa target: ${language.toUpperCase()}
Judul tugas: ${taskTitle}
Instruksi soal:
${promptBody}

Sumber input: ${hasAudio ? 'Audio rekaman suara pelajar (telah ditranskripsikan)' : 'Transkrip teks jawaban lisan pelajar'}
=== TRANSKRIP JAWABAN PELAJAR ===
${finalTranscript}
=== AKHIR TRANSKRIP ===

Kriteria rubrik (gunakan persis id yang diberikan):
${rubricDesc}

Instruksi khusus field "progressComparisonId":
${
  hasPriorStudio
    ? 'Bandingkan performa Speaking ini secara singkat (2–3 kalimat) dengan riwayat latihan Writing/Speaking akun pelajar sebelumnya: sebutkan peningkatan yang terlihat dan kesalahan yang masih perlu dilatih ulang.'
    : 'Karena ini salah satu latihan Speaking pertama yang tersimpan di memori AI Agent akun ini, tuliskan 2 kalimat catatan awal (baseline) sebagai patokan peningkatan sesi berikutnya.'
}

Berikan seluruh penjelasan, komentar, catatan pelafalan/kelancaran, perbandingan progres, dan alasan perbaikan dalam Bahasa Indonesia yang sangat jelas dan aplikatif. Sertakan "naturalPhrasingSample" dalam bahasa target (${language.toUpperCase()}) sebagai contoh jawaban lisan yang alami dan bernilai tinggi.`;

      const evalResp = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: evalPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transcript: { type: Type.STRING },
              overallScore: { type: Type.NUMBER },
              maxScore: { type: Type.NUMBER },
              scoreLabel: { type: Type.STRING },
              summaryId: { type: Type.STRING },
              progressComparisonId: { type: Type.STRING },
              criteriaFeedback: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    criterionId: { type: Type.STRING },
                    criterionName: { type: Type.STRING },
                    score: { type: Type.NUMBER },
                    commentId: { type: Type.STRING },
                  },
                  required: ['criterionId', 'criterionName', 'score', 'commentId'],
                },
              },
              pronunciationAndFluencyId: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              grammarAndVocabFixes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    original: { type: Type.STRING },
                    corrected: { type: Type.STRING },
                    reasonId: { type: Type.STRING },
                  },
                  required: ['original', 'corrected', 'reasonId'],
                },
              },
              naturalPhrasingSample: { type: Type.STRING },
              confidenceTipId: { type: Type.STRING },
            },
            required: [
              'transcript',
              'overallScore',
              'maxScore',
              'scoreLabel',
              'summaryId',
              'progressComparisonId',
              'criteriaFeedback',
              'pronunciationAndFluencyId',
              'grammarAndVocabFixes',
              'naturalPhrasingSample',
              'confidenceTipId',
            ],
          },
        },
      });

      const parsed = JSON.parse((evalResp.text ?? '{}').trim());
      parsed.transcript = finalTranscript;
      parsed.maxScore = maxScore;
      res.json(parsed);
    } catch (err) {
      handleApiError(res, err, 'Gagal menilai Speaking dengan AI.');
    }
  });

  // ---------------------------------------------------------------------------
  // 4. POST /api/ai/explain — Penerjemah & Penjelas Soal Instan Bahasa Indonesia
  // ---------------------------------------------------------------------------
  app.post('/api/ai/explain', async (req: Request, res: Response) => {
    try {
      const {
        language = 'ja',
        contextType = 'question',
        content = '',
        choices = [],
        correctAnswer = '',
        userAnswer = '',
        existingNote = '',
      } = req.body as {
        language?: string;
        contextType?: string;
        content?: string;
        choices?: string[];
        correctAnswer?: string;
        userAnswer?: string;
        existingNote?: string;
      };

      if (!String(content || '').trim()) {
        res.status(400).json({ error: 'Konten materi yang akan dijelaskan tidak ditemukan.' });
        return;
      }

      const ai = getAiClient();
      const prompt = `Kamu adalah Tutor Bahasa terbaik untuk pelajar Indonesia.
Tugasmu: Terjemahkan dan jelaskan materi/soal berikut ke dalam Bahasa Indonesia yang alami, sangat mudah dipahami, dan membantu pelajar lulus ujian.

Bahasa materi: ${language.toUpperCase()}
Jenis materi: ${contextType}
Isi materi / soal:
${content}
${choices.length > 0 ? `\nPilihan jawaban: ${choices.join(' | ')}` : ''}
${correctAnswer ? `\nJawaban benar: ${correctAnswer}` : ''}
${userAnswer ? `\nJawaban pelajar: ${userAnswer}` : ''}
${existingNote ? `\nCatatan referensi (terjemahkan & sederhanakan ke Bahasa Indonesia): ${existingNote}` : ''}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              translationId: {
                type: Type.STRING,
                description: 'Terjemahan Bahasa Indonesia yang akurat dan natural.',
              },
              explanationId: {
                type: Type.STRING,
                description:
                  'Penjelasan mudah dipahami mengapa jawaban tersebut benar atau bagaimana cara mengingat pola/kata ini.',
              },
              keyPointsId: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2-3 poin ringkas kosakata/tata bahasa kunci.',
              },
              examTipId: {
                type: Type.STRING,
                description: '1 tips praktis agar tidak terjebak di soal ujian serupa.',
              },
            },
            required: ['translationId', 'explanationId', 'keyPointsId', 'examTipId'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err) {
      handleApiError(res, err, 'Gagal memuat penjelasan Tutor AI.');
    }
  });

  // ---------------------------------------------------------------------------
  // 4b. POST /api/ai/translate-batch — Penerjemah Otomatis Bahasa Indonesia (Cached)
  // ---------------------------------------------------------------------------
  const serverTranslationCache = new Map<string, string>();

  app.post('/api/ai/translate-batch', async (req: Request, res: Response) => {
    try {
      const { entries = [] } = req.body as {
        entries?: { text: string; hint?: string }[];
      };

      if (!Array.isArray(entries) || entries.length === 0) {
        res.json({ translations: {} });
        return;
      }

      const cleaned = entries
        .slice(0, 60)
        .map((e) => ({
          text: String(e?.text || '').trim().slice(0, 600),
          hint: e?.hint ? String(e.hint).trim().slice(0, 80) : '',
        }))
        .filter((e) => e.text.length > 0);

      const result: Record<string, string> = {};
      const missing: { idx: number; text: string; hint: string }[] = [];
      const seenMissing = new Set<string>();

      for (const item of cleaned) {
        const cached = serverTranslationCache.get(item.text);
        if (cached) {
          result[item.text] = cached;
        } else if (!seenMissing.has(item.text)) {
          seenMissing.add(item.text);
          missing.push({ idx: missing.length, text: item.text, hint: item.hint });
        }
      }

      if (missing.length === 0) {
        res.json({ translations: result });
        return;
      }

      const ai = getAiClient();
      const lines = missing
        .map((m) => `[${m.idx}]${m.hint ? ` (${m.hint})` : ''}: ${m.text}`)
        .join('\n');

      const prompt = `Terjemahkan daftar arti kosakata, frasa, penjelasan tata bahasa, atau kalimat terjemahan bahasa Inggris berikut ke dalam BAHASA INDONESIA yang alami, ringkas, dan akurat untuk pelajar bahasa Jepang/JLPT di Indonesia.

ATURAN:
1. Jika input berupa arti singkat kanji/radikal/kosakata (1–4 kata), berikan padanan Bahasa Indonesia yang ringkas & natural (Title Case jika input Title Case, mis. "Mountain" -> "Gunung", "To Enter" -> "Masuk", "Rice Paddy" -> "Sawah").
2. Jika input berupa kalimat lengkap atau penjelasan tata bahasa, terjemahkan utuh dengan Bahasa Indonesia yang luwes dan mudah dipahami.
3. Pertahankan istilah Jepang (kanji/kana/romaji seperti は, が, ～次第) apa adanya di dalam kalimat.
4. Kembalikan JSON array sesuai indeks [idx] persis sebanyak input.

DAFTAR INPUT:
${lines}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    idx: { type: Type.INTEGER },
                    id: { type: Type.STRING },
                  },
                  required: ['idx', 'id'],
                },
              },
            },
            required: ['items'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        items?: { idx: number; id: string }[];
      };

      for (const row of parsed.items ?? []) {
        const target = missing[row.idx];
        const translated = String(row.id || '').trim();
        if (target && translated) {
          result[target.text] = translated;
          if (serverTranslationCache.size > 20000) {
            const firstKey = serverTranslationCache.keys().next().value;
            if (firstKey) serverTranslationCache.delete(firstKey);
          }
          serverTranslationCache.set(target.text, translated);
        }
      }

      res.json({ translations: result });
    } catch (err) {
      handleApiError(res, err, 'Gagal menerjemahkan materi ke Bahasa Indonesia.');
    }
  });

  // ---------------------------------------------------------------------------
  // 4c. POST /api/ai/enrich-vocab — Verifikasi Arti Bahasa Indonesia + Contoh Kalimat Sesuai Arti
  // ---------------------------------------------------------------------------
  interface VocabEnrichmentRecord {
    meaningId: string;
    synonymsId: string[];
    sentences: { jp: string; reading: string; id: string }[];
  }

  const vocabEnrichmentCache = new Map<string, VocabEnrichmentRecord>();
  const STATIC_VOCAB_ENRICHMENT_PATH = path.resolve(
    __dirname,
    'public',
    'data',
    'ja-vocab-enrichment.json'
  );
  const RUNTIME_VOCAB_ENRICHMENT_PATH = path.resolve(
    __dirname,
    'data',
    'vocab-enrichment-cache.json'
  );

  function loadVocabEnrichmentFile(filePath: string) {
    try {
      if (!fs.existsSync(filePath)) return;
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<
        string,
        VocabEnrichmentRecord
      >;
      if (raw && typeof raw === 'object') {
        for (const [id, rec] of Object.entries(raw)) {
          if (
            rec &&
            typeof rec.meaningId === 'string' &&
            rec.meaningId.trim() &&
            Array.isArray(rec.sentences) &&
            rec.sentences.length > 0
          ) {
            vocabEnrichmentCache.set(id, rec);
          }
        }
      }
    } catch {
      // Ignore corrupt or missing cache file
    }
  }

  loadVocabEnrichmentFile(STATIC_VOCAB_ENRICHMENT_PATH);
  loadVocabEnrichmentFile(RUNTIME_VOCAB_ENRICHMENT_PATH);

  let vocabCacheSaveTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleSaveVocabEnrichmentCache() {
    if (vocabCacheSaveTimer) return;
    vocabCacheSaveTimer = setTimeout(() => {
      vocabCacheSaveTimer = null;
      try {
        const dir = path.dirname(RUNTIME_VOCAB_ENRICHMENT_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const obj: Record<string, VocabEnrichmentRecord> = {};
        for (const [k, v] of vocabEnrichmentCache.entries()) {
          obj[k] = v;
        }
        fs.writeFileSync(RUNTIME_VOCAB_ENRICHMENT_PATH, JSON.stringify(obj), 'utf8');
      } catch {
        // Ignore read-only filesystem errors in production
      }
    }, 1500);
  }

  app.post('/api/ai/enrich-vocab', async (req: Request, res: Response) => {
    try {
      const { items = [] } = req.body as {
        items?: {
          id: string;
          characters: string;
          reading?: string;
          partOfSpeech?: string;
          rawMeaning?: string;
        }[];
      };

      if (!Array.isArray(items) || items.length === 0) {
        res.json({ enriched: {} });
        return;
      }

      const cleaned = items
        .slice(0, 16)
        .map((it) => ({
          id: String(it?.id || '').trim().slice(0, 64),
          characters: String(it?.characters || '').trim().slice(0, 40),
          reading: String(it?.reading || '').trim().slice(0, 60),
          partOfSpeech: String(it?.partOfSpeech || '').trim().slice(0, 50),
          rawMeaning: String(it?.rawMeaning || '').trim().slice(0, 120),
        }))
        .filter((it) => it.id && it.characters);

      const enriched: Record<string, VocabEnrichmentRecord> = {};
      const missing: typeof cleaned = [];
      const seen = new Set<string>();

      for (const it of cleaned) {
        const cached = vocabEnrichmentCache.get(it.id);
        if (cached) {
          enriched[it.id] = cached;
        } else if (!seen.has(it.id)) {
          seen.add(it.id);
          missing.push(it);
        }
      }

      if (missing.length === 0) {
        res.json({ enriched });
        return;
      }

      const ai = getAiClient();
      const inputLines = missing
        .map(
          (m) =>
            `- id="${m.id}" | kata="${m.characters}" | bacaan="${m.reading || '-'}" | kelas="${m.partOfSpeech || '-'}" | referensi="${m.rawMeaning || '-'}"`
        )
        .join('\n');

      const prompt = `Anda adalah leksikografer kamus Jepang–Indonesia profesional untuk pelajar JLPT.
Untuk setiap kosakata Bahasa Jepang di bawah ini, berikan:
1. "meaningId": Arti Bahasa Indonesia yang PALING TEPAT, alami, dan sesuai dengan kata Jepang, bacaan, dan kelas katanya (singkat, 1–4 kata, Title Case, mis. "Pintu Masuk", "Masuk", "Jumlah Penduduk", "Tenaga / Kekuatan"). Jangan menerjemahkan kaku atau salah konteks.
2. "synonymsId": 1–3 sinonim Bahasa Indonesia yang alami dan sah untuk jawaban kuis (huruf kecil, tanpa bahasa Inggris).
3. "sentences": TEPAT 2 contoh kalimat Bahasa Jepang yang alami, wajar, dan kontekstual:
   - "jp": Kalimat Jepang alami yang WAJIB menggunakan kata tersebut (atau konjugasi alaminya untuk kata kerja/kata sifat) dengan makna yang 100% sesuai "meaningId" dan kelas katanya.
   - "reading": Bacaan lengkap seluruh kalimat dalam hiragana/katakana (tanpa kanji sama sekali), konsisten dengan bacaan kosakata target.
   - "id": Terjemahan Bahasa Indonesia yang akurat, luwes, dan jelas memperlihatkan makna "meaningId" tersebut.

DAFTAR KOSAKATA:
${inputLines}`;

      let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  items: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        meaningId: { type: Type.STRING },
                        synonymsId: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                        sentences: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              jp: { type: Type.STRING },
                              reading: { type: Type.STRING },
                              id: { type: Type.STRING },
                            },
                            required: ['jp', 'reading', 'id'],
                          },
                        },
                      },
                      required: ['id', 'meaningId', 'synonymsId', 'sentences'],
                    },
                  },
                },
                required: ['items'],
              },
            },
          });
          break;
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          const isTransient =
            msg.includes('429') ||
            msg.includes('503') ||
            msg.includes('UNAVAILABLE') ||
            msg.includes('RESOURCE_EXHAUSTED');
          if (!isTransient || attempt === 2) throw err;
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
      if (!response) throw lastErr ?? new Error('Gagal menerima respons dari Gemini.');

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        items?: {
          id: string;
          meaningId: string;
          synonymsId?: string[];
          sentences?: { jp: string; reading: string; id: string }[];
        }[];
      };

      const validIds = new Set(missing.map((m) => m.id));
      let addedAny = false;
      for (const row of parsed.items ?? []) {
        const id = String(row.id || '').trim();
        const meaningId = String(row.meaningId || '').trim();
        if (!id || !validIds.has(id) || !meaningId) continue;

        const synonymsId = Array.isArray(row.synonymsId)
          ? row.synonymsId.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 4)
          : [];
        const sentences = Array.isArray(row.sentences)
          ? row.sentences
              .map((s) => ({
                jp: String(s?.jp || '').trim(),
                reading: String(s?.reading || '').trim(),
                id: String(s?.id || '').trim(),
              }))
              .filter((s) => s.jp && s.reading && s.id)
              .slice(0, 2)
          : [];

        if (sentences.length === 0) continue;

        const record: VocabEnrichmentRecord = { meaningId, synonymsId, sentences };
        vocabEnrichmentCache.set(id, record);
        enriched[id] = record;
        addedAny = true;
      }

      if (addedAny) {
        scheduleSaveVocabEnrichmentCache();
      }

      res.json({ enriched });
    } catch (err) {
      handleApiError(res, err, 'Gagal memuat arti dan contoh kalimat kosakata.');
    }
  });

  // ---------------------------------------------------------------------------
  // 5. POST /api/admin/create-user — Pendaftaran Pengguna Khusus Admin
  // ---------------------------------------------------------------------------
  app.post('/api/admin/create-user', async (req: Request, res: Response) => {
    try {
      const authHeader = String(req.headers.authorization || '');
      const bearerToken = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : '';

      if (!bearerToken) {
        res.status(401).json({ error: 'Sesi autentikasi Admin tidak ditemukan.' });
        return;
      }

      const supabaseUrl = (
        process.env.SUPABASE_URL ||
        process.env.VITE_SUPABASE_URL ||
        ''
      ).trim();
      const supabasePublicKey = (
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY ||
        ''
      ).trim();
      const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

      if (!supabaseUrl || (!supabasePublicKey && !supabaseServiceKey)) {
        res.status(503).json({
          error: 'Konfigurasi Supabase di server belum lengkap.',
        });
        return;
      }

      const verifierClient = createClient(
        supabaseUrl,
        supabaseServiceKey || supabasePublicKey,
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: supabaseServiceKey
            ? undefined
            : { headers: { Authorization: `Bearer ${bearerToken}` } },
        }
      );

      // Verify JWT directly with Supabase Auth
      const { data: callerAuth, error: authErr } = await verifierClient.auth.getUser(
        bearerToken
      );
      if (authErr || !callerAuth?.user) {
        res.status(401).json({
          error: 'Sesi Admin tidak valid atau telah kedaluwarsa. Silakan masuk ulang.',
        });
        return;
      }

      // Verify caller holds an active admin role in public.profiles
      const { data: callerProfile, error: profErr } = await verifierClient
        .from('profiles')
        .select('role, is_suspended')
        .eq('id', callerAuth.user.id)
        .maybeSingle();

      if (
        profErr ||
        !callerProfile ||
        callerProfile.role !== 'admin' ||
        callerProfile.is_suspended === true
      ) {
        res.status(403).json({
          error: 'Akses ditolak. Hanya akun Administrator aktif yang dapat mendaftarkan pengguna.',
        });
        return;
      }

      const {
        email: rawEmail = '',
        password: rawPassword = '',
        displayName: rawDisplayName = '',
        role: rawRole = 'user',
        initialLevel: rawLevel = 1,
      } = req.body as {
        email?: string;
        password?: string;
        displayName?: string;
        role?: string;
        initialLevel?: number;
      };

      const email = String(rawEmail).trim().toLowerCase();
      const password = String(rawPassword);
      const displayName = String(rawDisplayName).trim();
      const role: 'user' | 'admin' = rawRole === 'admin' ? 'admin' : 'user';
      const initialLevel = Math.min(60, Math.max(1, Math.floor(Number(rawLevel) || 1)));

      if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'Format alamat email tidak valid.' });
        return;
      }
      if (password.length < 6 || password.length > 128) {
        res.status(400).json({ error: 'Kata sandi harus terdiri dari 6 hingga 128 karakter.' });
        return;
      }
      if (displayName.length < 2 || displayName.length > 60) {
        res.status(400).json({ error: 'Nama tampilan harus terdiri dari 2 hingga 60 karakter.' });
        return;
      }

      let createdUserId = '';
      let emailConfirmed = false;

      if (supabaseServiceKey) {
        const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: created, error: createErr } =
          await serviceClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              display_name: displayName,
              created_by_admin: callerAuth.user.id,
            },
          });

        if (createErr || !created?.user) {
          const msg = (createErr?.message || '').toLowerCase();
          if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
            res.status(409).json({ error: 'Email tersebut sudah terdaftar sebelumnya.' });
            return;
          }
          res.status(400).json({
            error: createErr?.message || 'Gagal mendaftarkan pengguna baru di Supabase.',
          });
          return;
        }

        createdUserId = created.user.id;
        emailConfirmed = true;

        await serviceClient.from('profiles').upsert(
          {
            id: createdUserId,
            email,
            display_name: displayName,
            role,
            is_suspended: false,
          },
          { onConflict: 'id' }
        );

        await serviceClient.from('user_srs_state').upsert(
          {
            user_id: createdUserId,
            current_level: initialLevel,
          },
          { onConflict: 'user_id' }
        );
      } else {
        // Fallback using a stateless server-side client so the Admin's session is never affected
        const statelessAnon = createClient(supabaseUrl, supabasePublicKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: signedUp, error: signUpErr } = await statelessAnon.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName,
              created_by_admin: callerAuth.user.id,
            },
          },
        });

        if (signUpErr || !signedUp?.user) {
          const msg = (signUpErr?.message || '').toLowerCase();
          if (msg.includes('signups not allowed')) {
            res.status(400).json({
              error:
                'Pendaftaran publik di Supabase sudah dimatikan. Tambahkan secret supabase_service_role_key di Settings > Secrets agar Admin dapat membuat akun langsung dari panel ini.',
            });
            return;
          }
          if (msg.includes('already') || msg.includes('registered')) {
            res.status(409).json({ error: 'Email tersebut sudah terdaftar sebelumnya.' });
            return;
          }
          res.status(400).json({
            error: signUpErr?.message || 'Gagal mendaftarkan pengguna baru.',
          });
          return;
        }

        createdUserId = signedUp.user.id;
        emailConfirmed = Boolean(signedUp.session);

        // Apply requested role & starting level under verified Admin RLS session
        if (role === 'admin') {
          await verifierClient
            .from('profiles')
            .update({ role: 'admin', display_name: displayName })
            .eq('id', createdUserId);
        }
        if (initialLevel > 1) {
          await verifierClient.from('user_srs_state').upsert(
            {
              user_id: createdUserId,
              current_level: initialLevel,
            },
            { onConflict: 'user_id' }
          );
        }
      }

      res.status(201).json({
        ok: true,
        emailConfirmed,
        user: {
          id: createdUserId,
          email,
          displayName,
          role,
          currentLevel: initialLevel,
        },
        message: emailConfirmed
          ? `Akun ${displayName} (${email}) berhasil didaftarkan dan langsung aktif untuk login.`
          : `Akun ${displayName} (${email}) berhasil didaftarkan. Pengguna perlu mengonfirmasi emailnya sebelum login (atau tambahkan secret supabase_service_role_key di Settings > Secrets agar langsung aktif tanpa verifikasi email).`,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal memproses pendaftaran pengguna.',
      });
    }
  });

  const httpServer = http.createServer(app);

  if (IS_PROD) {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        hmr: process.env.DISABLE_HMR !== 'true' ? { server: httpServer } : false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Leksika server running at http://0.0.0.0:${PORT}`);
  });
}

void createApp();
