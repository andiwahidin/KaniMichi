import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

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
      } = req.body as {
        language?: string;
        examTarget?: string;
        messages?: { role: 'user' | 'assistant'; content: string }[];
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Pesan pertanyaan tidak boleh kosong.' });
        return;
      }

      const ai = getAiClient();
      const langContext =
        language === 'ja'
          ? 'Bahasa Jepang (JLPT N5 hingga N1: Kanji, Kosakata, Tata Bahasa, Dokkai, Chōkai, Strategi Lulus JLPT)'
          : language === 'en'
          ? 'Bahasa Inggris (TOEFL ITP, TOEFL iBT, IELTS Academic, TOEIC: Vocabulary, Grammar, Reading, Listening, Writing, Speaking)'
          : language === 'ar'
          ? 'Bahasa Arab Fusha (TOAFL UIN/PTKIN: Mufradat, Nahwu & Shorof, Tarakib, Qira’ah berharakat/gundul, Istima’)'
          : 'Multibahasa (Bahasa Jepang JLPT N5–N1, Bahasa Inggris TOEFL/IELTS/TOEIC, Bahasa Arab TOAFL)';

      const systemInstruction = `Kamu adalah Tutor Bahasa Profesional di platform Leksika yang sangat sabar, terstruktur, dan ahli membantu pelajar Indonesia benar-benar paham materi dan yakin lulus ujian kemampuan bahasa.

Konteks aktif pelajar: ${langContext}${examTarget ? ` · Target ujian: ${examTarget}` : ''}.

ATURAN WAJIB:
1. SELALU jawab dalam Bahasa Indonesia yang alami, hangat, jelas, dan mudah dipahami (jangan gunakan istilah rumit tanpa penjelasan sederhana).
2. Jika menampilkan contoh bahasa Jepang, sertakan furigana/cara baca hiragana + terjemahan Bahasa Indonesia yang akurat.
3. Jika menampilkan contoh bahasa Arab, sertakan harakat lengkap + transliterasi Latin + terjemahan Bahasa Indonesia yang akurat.
4. Jika menampilkan contoh bahasa Inggris, sertakan terjemahan Bahasa Indonesia dan jelaskan nuansa pemakaiannya di ujian TOEFL/IELTS/TOEIC.
5. Gunakan struktur ringkas dan rapi: (a) Inti Jawaban / Rumus Mudah, (b) Contoh Kontekstual + Terjemahan Indonesia, (c) Jebakan Umum di Ujian & Tips Lulus, dan (d) 1 Pertanyaan Latihan Singkat jika relevan.
6. Panjang jawaban ideal 120–320 kata kecuali pelajar meminta penjelasan panjang atau jadwal belajar lengkap.`;

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
      } = req.body as {
        language?: 'en' | 'ja' | 'ar';
        examTrack?: string;
        taskTitle?: string;
        promptBody?: string;
        readingExcerpt?: string;
        minWords?: number;
        userEssay?: string;
        rubricCriteria?: { id: string; name: string; description: string }[];
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
        : 'Gunakan skala 0 sampai 100 untuk overallScore dan skala 1 sampai 10 untuk tiap kriteria.';

      const systemInstruction = `Kamu adalah Penguji Resmi Writing (IELTS/TOEFL iBT/JLPT/TOAFL) sekaligus Tutor Bahasa yang menjelaskan SEMUA umpan balik, alasan koreksi, dan saran dalam Bahasa Indonesia yang sangat jelas, ramah, dan mudah dipahami.
${scoringGuide}
Berikan penilaian objektif sesuai kualitas tulisan nyata pelajar (jangan melebih-lebihkan skor jika masih banyak kesalahan, tetapi selalu beri arahan perbaikan yang membangun dan konkret agar pelajar tahu persis cara menaikkan skornya).`;

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

Berikan hasil evaluasi JSON yang lengkap dalam Bahasa Indonesia untuk seluruh penjelasan, komentar, kelebihan, kekurangan, dan alasan koreksi. Untuk field "improvedSample", tuliskan versi peningkatan dari esai pelajar dalam bahasa target (${language.toUpperCase()}) yang setara skor tinggi (Band 8.0+ / Skor 28+) sambil mempertahankan ide utama pelajar.`;

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
      } = req.body as {
        language?: 'en' | 'ja' | 'ar';
        examTrack?: string;
        taskTitle?: string;
        promptBody?: string;
        audioBase64?: string;
        audioMimeType?: string;
        transcriptText?: string;
        rubricCriteria?: { id: string; name: string; description: string }[];
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

      const evalPrompt = `Kamu adalah Penguji Speaking Resmi (${examTrack.toUpperCase()}) sekaligus Tutor Bahasa Indonesia yang ramah dan mudah dipahami.
${scoringGuide}

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

Berikan seluruh penjelasan, komentar, catatan pelafalan/kelancaran, dan alasan perbaikan dalam Bahasa Indonesia yang sangat jelas dan aplikatif. Sertakan "naturalPhrasingSample" dalam bahasa target (${language.toUpperCase()}) sebagai contoh jawaban lisan yang alami dan bernilai tinggi.`;

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

  if (IS_PROD) {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Leksika server running at http://0.0.0.0:${PORT}`);
  });
}

void createApp();
