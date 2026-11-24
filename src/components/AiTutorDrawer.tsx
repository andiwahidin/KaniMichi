import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, Sparkles, Trash2, Volume2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { askAiTutor, type AiTutorMessage } from '../lib/aiTutor';
import { speakText, stopSpeech } from '../utils/audio';

export const OPEN_AI_TUTOR_EVENT = 'leksika:open-ai-tutor';

export function openAiTutorWithPrompt(prompt?: string, language?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(OPEN_AI_TUTOR_EVENT, {
      detail: { prompt: prompt ?? '', language },
    })
  );
}

const QUICK_PROMPTS: Record<string, { label: string; prompt: string }[]> = {
  ja: [
    {
      label: 'Rencana lulus JLPT N5–N4',
      prompt:
        'Buatkan panduan belajar harian 30 menit agar saya cepat paham dasar Bahasa Jepang dan yakin lulus JLPT N5 lalu N4.',
    },
    {
      label: 'Bedakan partikel は dan が',
      prompt:
        'Jelaskan perbedaan partikel は (wa) dan が (ga) dengan penjelasan paling sederhana dan 4 contoh kalimat + terjemahan Indonesia.',
    },
    {
      label: 'Cara mudah baca Dokkai JLPT',
      prompt:
        'Bagaimana strategi cepat mengerjakan soal Dokkai (membaca) JLPT agar tidak kehabisan waktu?',
    },
    {
      label: 'Latih kalimat JLPT N3',
      prompt:
        'Berikan 1 soal latihan tata bahasa JLPT N3 beserta pilihan gandanya, tunggu jawaban saya sebelum memberi kunci.',
    },
  ],
  en: [
    {
      label: 'Trik tembus TOEFL ITP 550+',
      prompt:
        'Apa 5 pola jebakan paling sering muncul di TOEFL ITP Structure & Written Expression dan cara cepat mengenalinya?',
    },
    {
      label: 'Struktur esai IELTS Band 7.5',
      prompt:
        'Ajarkan kerangka paragraf paling mudah dan aman untuk IELTS Writing Task 2 agar bisa mencapai Band 7.0–7.5.',
    },
    {
      label: 'Tips TOEFL iBT Speaking',
      prompt:
        'Berikan template jawaban 45 detik untuk TOEFL iBT Speaking Task 1 beserta contoh topik dan terjemahannya.',
    },
    {
      label: 'Bedakan Present Perfect vs Past',
      prompt:
        'Jelaskan perbedaan Present Perfect dan Simple Past secara mudah dipahami beserta contoh jebakan soal TOEIC/TOEFL.',
    },
  ],
  ar: [
    {
      label: 'Trik lulus TOAFL 450+',
      prompt:
        'Apa strategi paling efektif untuk menembus skor TOAFL 450+ di bagian Istima’, Tarakib, dan Qira’ah teks gundul?',
    },
    {
      label: 'Cara baca Arab tanpa harakat',
      prompt:
        'Ajarkan langkah praktis membaca teks Arab gundul (tanpa harakat) dengan mengenali posisi Fa’il, Maf’ul Bih, dan Idhafah.',
    },
    {
      label: 'Bedakan Inna dan Kaana',
      prompt:
        'Jelaskan perbedaan kaidah إِنَّ (Inna) dan كَانَ (Kaana) dengan contoh berharakat lengkap, transliterasi, dan terjemahan Indonesia.',
    },
    {
      label: 'Latih Tarakib TOAFL',
      prompt:
        'Berikan 1 soal Tarakib TOAFL pilihan ganda tentang I’rab, lalu tunggu jawaban saya.',
    },
  ],
  all: [
    {
      label: 'Pilih jalur ujian terbaik',
      prompt:
        'Bantu saya membandingkan JLPT, TOEFL ITP/iBT, IELTS, TOEIC, dan TOAFL serta cara menyusun jadwal belajar yang realistis.',
    },
    {
      label: 'Tips hafal kosakata cepat',
      prompt:
        'Bagaimana cara paling efektif memanfaatkan sistem SRS dan contoh kalimat agar kosakata tidak mudah lupa saat ujian?',
    },
    {
      label: 'Latihan Grammar Jepang',
      prompt: 'Ajarkan 3 pola tata bahasa wajib JLPT N5 dengan penjelasan mudah dan contoh kalimat.',
    },
    {
      label: 'Latihan Structure TOEFL',
      prompt:
        'Berikan 1 soal TOEFL ITP Structure beserta tips cepat mencari Subject dan Verb utama.',
    },
  ],
};

export const AiTutorDrawer: React.FC = () => {
  const { activeLanguage, activeExamTrack, state } = useApp();
  const [open, setOpen] = useState(false);
  const [tutorLang, setTutorLang] = useState<string>(activeLanguage);
  const [messages, setMessages] = useState<AiTutorMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTutorLang(activeLanguage);
  }, [activeLanguage]);

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ prompt?: string; language?: string }>).detail;
      if (detail?.language) setTutorLang(detail.language);
      setOpen(true);
      if (detail?.prompt) {
        void sendMessage(detail.prompt, detail.language || activeLanguage);
      }
    };
    window.addEventListener(OPEN_AI_TUTOR_EVENT, handler);
    return () => window.removeEventListener(OPEN_AI_TUTOR_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLanguage, messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, open]);

  const sendMessage = async (textOverride?: string, langOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;

    const targetLang = langOverride ?? tutorLang;
    const nextMessages: AiTutorMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    if (!textOverride) setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await askAiTutor({
        language: targetLang,
        examTarget: activeExamTrack ?? undefined,
        messages: nextMessages,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghubungi Tutor AI.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage();
  };

  if (!open) return null;

  const starters = QUICK_PROMPTS[tutorLang] ?? QUICK_PROMPTS.all;
  const ttsLocale =
    tutorLang === 'ja'
      ? 'ja-JP'
      : tutorLang === 'ar'
      ? 'ar-SA'
      : tutorLang === 'en'
      ? state.settings.englishAccent ?? 'en-US'
      : 'id-ID';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 backdrop-blur-[1px]">
      <div
        className="flex-1"
        onClick={() => {
          stopSpeech();
          setOpen(false);
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Tutor AI Leksika"
        className="w-full max-w-lg bg-white dark:bg-[#161A22] border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col h-full"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#0284C7] text-white flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white truncate">
                Tutor AI Leksika
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Penjelasan mudah dalam Bahasa Indonesia · Siap bantu lulus ujian
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setError(null);
                }}
                title="Bersihkan percakapan"
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                stopSpeech();
                setOpen(false);
              }}
              aria-label="Tutup Tutor AI"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Language Focus Switcher */}
        <div className="px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: 'Semua' },
            { id: 'ja', label: 'Jepang (JLPT N5–N1)' },
            { id: 'en', label: 'Inggris (TOEFL/IELTS/TOEIC)' },
            { id: 'ar', label: 'Arab (TOAFL)' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTutorLang(opt.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                tutorLang === opt.id
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Chat Body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0284C7] dark:text-sky-400">
                  <Sparkles className="w-3.5 h-3.5" />
                  Halo! Saya Tutor Pribadi Anda
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Tanyakan apa saja — arti kosakata, tata bahasa yang membingungkan, cara membaca
                  teks Arab gundul, koreksi kalimat buatan sendiri, atau strategi lulus JLPT N5–N1,
                  TOEFL, IELTS, TOEIC, dan TOAFL.
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Pilih topik cepat untuk mulai
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {starters.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => void sendMessage(s.prompt)}
                      className="text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#0284C7] bg-white dark:bg-[#161A22] transition-colors cursor-pointer"
                    >
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {s.label}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                        {s.prompt}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[90%] rounded-xl px-4 py-3 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[#0284C7] text-white'
                      : 'bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100'
                  }`}
                >
                  {msg.content}
                  {msg.role === 'assistant' && (
                    <div className="mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => speakText(msg.content.slice(0, 600), 'id-ID', 0.96)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        Bacakan ({ttsLocale === 'id-ID' ? 'ID' : 'Audio'})
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
              Tutor AI sedang menyusun penjelasan yang mudah dipahami...
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}
        </div>

        {/* Input Form */}
        <form
          onSubmit={handleSubmit}
          className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161A22] flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
            rows={2}
            placeholder="Tulis pertanyaan, kalimat yang ingin dicek, atau soal yang belum dipahami..."
            className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-11 px-4 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer shrink-0"
          >
            <Send className="w-4 h-4" />
            Kirim
          </button>
        </form>
      </aside>
    </div>
  );
};
