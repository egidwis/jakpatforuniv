import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpCircle, Send, Bot, Sparkles, ArrowRight, ExternalLink, Calendar, Plus, RefreshCw, AlertCircle } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { supabase, getOrCreateChatSession, getChatMessages, saveChatMessage, getFormSubmissionsByUser, fetchAdSchedules, type AdScheduleEntry, type FormSubmission } from '@/utils/supabase';
import { deriveOrderUiState, describeOrderForChat } from '@/components/status/deriveOrderUiState';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import ReactMarkdown from 'react-markdown';


interface ChatCta {
    id: string;
    label: string;
    action: 'navigate' | 'chat_prompt' | 'open_modal';
    target?: string;
    variant?: 'primary' | 'secondary' | 'warning' | 'outline';
}

interface ChatMessageItem {
    role: 'user' | 'assistant';
    content: string;
    ctas?: ChatCta[];
}

export function ChatPage() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const defaultFaqs = [
        {
            q: "Apa bedanya Jakpat for Universities dengan Jakpat biasa?",
            a: "Jakpat for Univ fokus pada kebutuhan akademik dengan harga lebih ramah mahasiswa/dosen, alur yang lebih simpel, dan fleksibel untuk tugas kuliah, skripsi, thesis, atau riset akademik."
        },
        {
            q: "Untuk mendapatkan 200 responden, butuh berapa lama?",
            a: "Rata-rata 1 hari iklan atau bisa lebih cepat jika targetnya general audience. Bisa lebih lama jika kriterianya spesifik."
        },
        {
            q: "Responden seperti apa yang bisa didapat?",
            a: "Responden umum Indonesia usia 17 tahun ke atas yang tersebar di seluruh Indonesia."
        },
        {
            q: "Bagaimana demografi responden Jakpat?",
            a: "Jakpat memiliki total 1,7 juta responden. Sebaran wilayah terbesar: Jawa Barat (23.5%), Sumatera (16.3%), Jawa Timur (14.9%), Jawa Tengah (12.4%), DKI Jakarta (11.9%). Gender: Laki-laki 60.9%, Perempuan 39.1%. Usia terbesar di 18-24 tahun (42.7%). Profesi: Worker (32.7%), JobSeeker (22.5%), College (16.0%), Student (12.4%). Status: Menikah 65.49%, Belum Menikah 34.6%."
        },
        {
            q: "Berapa rekomendasi insentif untuk responden?",
            a: "Jumlah pemenang undian kami batasi maksimal 5 orang agar distribusi hadiah bisa lebih merata dengan postingan iklan lainnya. Namun, jika membutuhkan lebih dari 5 pemenang, bisa dibantu dengan metode distribusi custom (ada biaya tambahan). Silakan request ke admin Jakpat for Univ melalui chat ini. Untuk nominal hadiah, tidak ada batasan dan dapat disesuaikan dengan kebutuhanmu. Rekomendasinya adalah memberikan minimal Rp25.000 untuk 2 pemenang. Umumnya, semakin besar insentif yang ditawarkan, semakin tinggi minat responden untuk berpartisipasi dalam survei kamu."
        },
        {
            q: "Bagaimana cara distribusi insentif?",
            a: "Setelah proses pengundian pemenang selesai, tim akan menghubungi pemenang melalui email untuk meminta informasi e-wallet yang diperlukan. Setelah data lengkap diterima, insentif akan dikirimkan langsung ke e-wallet masing-masing pemenang."
        },
        {
            q: "Apakah boleh menanyakan data pribadi responden?",
            a: "Jakpat memiliki standar privasi yang melarang pengumpulan maupun penyebaran informasi pribadi responden. Karena itu, pertanyaan sensitif seperti nomor telepon, email, alamat lengkap, atau data personal lainnya tidak diperbolehkan untuk dimasukkan dalam survei."
        },
        {
            q: "Bisa menambah jadwal iklan untuk survei yang sama?",
            a: "Bisa. Kamu bisa menjadwalkan iklan lagi dengan membayar biaya iklan tambahan, tanpa perlu memberikan insentif ulang kepada responden selama jadwal barunya masih menyambung. Namun, jika iklan dihentikan cukup lama dan kemudian dijalankan kembali, hal tersebut akan dianggap sebagai iklan baru sehingga perlu menyediakan insentif responden kembali."
        },
        {
            q: "Boleh menggunakan platform selain Google Form?",
            a: "Boleh. Kamu bisa menggunakan Qualtrics, SurveyMonkey, Microsoft Forms, Typeform, atau platform apa pun selama link bisa diakses oleh responden."
        },
        {
            q: "Kapan waktu terbaik agar survei cepat terisi?",
            a: "Untuk hari penayangan, tidak ada perbedaan signifikan. Namun, waktu penayangan iklan cukup berpengaruh. Peak traffic responden biasanya terjadi pada pukul 16:00–18:00, sehingga survei cenderung lebih cepat terisi pada jam tersebut."
        },
        {
            q: "Apakah respondennya valid?",
            a: "Ya. Responden berasal dari panel Jakpat yang sudah melalui proses validasi identitas."
        },
        {
            q: "Gimana cara mencegah double submit?",
            a: "Sebelum mengakses link survei, responden diwajibkan memasukkan Jakpat ID, dan setiap responden hanya memiliki satu ID unik. Dengan sistem ini, setiap pengguna hanya dapat mengisi survei satu kali sehingga double submit dapat dicegah."
        },
        {
            q: "Mana link iklan survei saya?",
            a: "Link iklan akan diinfokan dari admin setelah iklan publish."
        }
    ];

    // --- Chat AI Logic ---
    const [messages, setMessages] = useState<ChatMessageItem[]>([
        { 
            role: 'assistant', 
            content: 'Halo! Saya Mimin AI, asisten admin Jakpat for Universities. Ada yang bisa saya bantu terkait survei akademik, pilihan jadwal, atau estimasi biayamu?' 
        }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const autoSentRef = useRef(false);

    // AI Knowledge Base State
    const [systemPrompt, setSystemPrompt] = useState<string>('');
    const [faqs, setFaqs] = useState<Array<{q: string, a: string}>>([]);

    // Order milik user, untuk disuntikkan sebagai ORDER CONTEXT ke system
    const [userOrders, setUserOrders] = useState<Array<{ submission: FormSubmission; schedules: AdScheduleEntry[] }>>([]);

    // Initial load for persistence
    useEffect(() => {
        const initData = async () => {
            // 1. Fetch AI Knowledge Base
            try {
                const [{ data: promptData }, { data: faqsData }] = await Promise.all([
                    supabase.from('ai_settings').select('value').eq('key', 'system_prompt').single(),
                    supabase.from('ai_knowledge_base').select('question, answer').eq('is_active', true).order('sort_order', { ascending: true })
                ]);

                if (promptData) setSystemPrompt(promptData.value);

                if (faqsData && faqsData.length > 0) {
                    setFaqs(faqsData.map(f => ({ q: f.question, a: f.answer })));
                } else {
                    setFaqs(defaultFaqs);
                }
            } catch (err) {
                console.error("Error fetching AI knowledge:", err);
                setFaqs(defaultFaqs);
            }

            // 2. Fetch Chat Session
            if (user?.email) {
                const session = await getOrCreateChatSession(user.email);
                if (session) {
                    setSessionId(session.id);
                    const savedMessages = await getChatMessages(session.id);
                    if (savedMessages && savedMessages.length > 0) {
                        setMessages(savedMessages.map(m => ({ 
                            role: m.role as 'user' | 'assistant', 
                            content: m.content,
                            ctas: (m as any).ctas || []
                        })));
                    }
                }
            }

            // 3. Fetch order user untuk ORDER CONTEXT (maks. 3 terbaru)
            if (user?.id) {
                try {
                    const subs = await getFormSubmissionsByUser(user.id, user.email);
                    const recent = subs.slice(0, 3);
                    const ids = recent.map((s) => s.id).filter((id): id is string => !!id);
                    const allSchedules = await fetchAdSchedules(ids);
                    setUserOrders(recent.map((submission) => ({
                        submission,
                        schedules: allSchedules.filter((s) => s.submissionId === submission.id),
                    })));
                } catch (err) {
                    console.error('Error fetching orders for chat context:', err);
                }
            }
        };
        initData();
    }, [user?.email, user?.id]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const orderStates = useMemo(
        () => userOrders.map(({ submission, schedules }) => ({
            submission,
            ui: deriveOrderUiState(submission, schedules),
        })),
        [userOrders]
    );

    // Build system prompt with Comprehensive Product Knowledge & Action Capabilities
    const buildSystemPrompt = useCallback(() => {
        const basePrompt = systemPrompt || `You are Mimin AI, the Agentic AI Assistant & Virtual Admin for Jakpat for Universities (JFU).
You are politely professional, proactive, and solution-oriented.

=== IDENTITY & PURPOSE ===
- You are Mimin AI, representing the official Jakpat for Universities (JFU) admin team.
- JFU is a specialized service from Jakpat tailored for students, thesis researchers, and lecturers to distribute academic surveys affordably and fast.
- You do NOT merely provide passive answers; you guide the researcher toward the right action (submitting, scheduling, extending, or resolving issues).

=== 3 PILARS OF PRODUCT KNOWLEDGE ===
1. **Pilar 1: Survey Ads (Iklan Survei Reguler)**
   - Iklan kuesioner akademik yang tayang di aplikasi mobile Jakpat.
   - Menggunakan sistem slot kalender harian (bisa pilih slot jam tayang).
   - Peneliti wajib menyediakan reward pool (insentif undian berupa saldo e-wallet untuk 1-5 pemenang undian acak).
   - Hasil jawaban kuesioner 100% langsung masuk ke form peneliti sendiri (Google Forms, Microsoft Forms, Qualtrics, Typeform, dll).

2. **Pilar 2: JFU Kilat (Distribusi Cepat Prioritas)**
   - Layanan distribusi cepat berbasis landing page publik di website Jakpat for Univ (/pages).
   - Sangat cocok untuk mahasiswa dengan deadline mendesak (butuh responden dalam hitungan jam / hari ini juga).
   - Responden tervalidasi langsung mengakses kuesioner tanpa antre jadwal slot harian.

3. **Pilar 3: Respondent Access (Panel Terverifikasi)**
   - Akses langsung ke panel 1,7+ Juta responden asli Indonesia di aplikasi Jakpat.
   - Tersebar di 38 provinsi (mayoritas Jawa Barat, Sumatera, Jawa Timur, Jawa Tengah, DKI Jakarta).
   - Terlindungi dari double-submit dan responden bot berkat validasi identitas unik via sistem Jakpat ID.

=== BOOKING SYSTEM & FLOW STATUS ===
- **Tahap 1: Pengajuan Order (Submissions)** -> Peneliti input judul, link kuesioner, kuota pertanyaan, dan reward pool.
- **Tahap 2: Review Manual Tim Admin** -> Kuesioner diperiksa manual & AI pre-screening (cek PII / nomor HP dilarang & kecocokan kuota). Jam kerja: Senin-Jumat 08:00-17:00 WIB (proses 1-2 jam).
- **Tahap 3: Pemilihan Jadwal & Pembayaran** -> Setelah kuesioner disetujui, peneliti memilih tanggal di kalender dan membayar via DOKU (QRIS, Bank Transfer / Virtual Account, E-Wallet).
- **Tahap 4: Penayangan Iklan Live** -> Survei tayang di aplikasi Jakpat pada tanggal yang dipilih.

=== PRICING FORMULA (BIAYA IKLAN HARIAN) ===
- 1-15 pertanyaan: Rp 150.000 / hari
- 16-30 pertanyaan: Rp 200.000 / hari
- 31-50 pertanyaan: Rp 300.000 / hari
- 51-70 pertanyaan: Rp 400.000 / hari
- >70 pertanyaan: Rp 500.000 / hari
- **Aturan Grid/Likert/Matrix**: Setiap baris pernyataan dihitung sebagai 1 pertanyaan (bukan 1 blok).
- **Insentif Responden**: Ditentukan sendiri oleh peneliti, rekomendasi minimal Rp 25.000 untuk 2 pemenang undian.
- **Add-on Randomizer**: Rp 20.000 per link.

=== CRITICAL BEHAVIOR & OUTPUT FORMAT ===
Balaslah dalam Bahasa Indonesia yang ramah, sopan, dan jelas.
Format responmu WAJIB menggunakan JSON dengan struktur:
{
  "reply": "Teks markdown jawaban ramah dan informatif...",
  "intent": "issue" | "feedback" | "request_extend" | "request_upsell" | "faq",
  "tag_label": "Label ringkas maks 3 kata (cth: Kendala Bayar / Saran Fitur / Tanya Jadwal / Request Extend)",
  "needs_attention": true | false (isi true jika user mengalami kendala teknis, pembayaran gagal, atau butuh bantuan manual admin),
  "ctas": [
    {
      "id": "track_ads" | "extend_ads" | "calendar" | "kilat" | "audit_form" | "report_issue",
      "label": "Teks tombol yang menarik (cth: 📊 Pantau Iklan / ➕ Perpanjang Iklan / 📅 Buka Kalender / ⚡ Info JFU Kilat)",
      "action": "navigate" | "chat_prompt",
      "target": "/dashboard" (untuk navigate) ATAU teks pertanyaan cepat (untuk chat_prompt)
    }
  ]
}`;

        const currentFaqs = faqs.length > 0 ? faqs : defaultFaqs;

        const orderContext = orderStates.length > 0
            ? `\n\n=== ORDER CONTEXT (DATA ORDER MILIK USER SAAT INI) ===\nBerikut order survei milik user yang sedang chat denganmu:\n\n${orderStates.map(({ submission, ui }) => describeOrderForChat(submission, ui)).join('\n\n')}\n\nGunakan data di atas untuk menjawab status survei user secara akurat dan sertakan CTA yang relevan!`
            : '';

        return `${basePrompt}

=== KNOWLEDGE BASE (FAQ) ===
${currentFaqs.map(f => `Q: ${f.q}\nA: ${f.a}`).join('\n')}
${orderContext}
`;
    }, [systemPrompt, faqs, orderStates]);

function parseMiminResponse(
    rawText: string,
    userPrompt: string,
    userOrderStates: Array<{ submission: FormSubmission; ui: any }>
): {
    reply: string;
    intent: 'issue' | 'feedback' | 'request_extend' | 'request_upsell' | 'faq';
    tag_label: string;
    needs_attention: boolean;
    ctas: ChatCta[];
} {
    let reply = rawText;
    let intent: 'issue' | 'feedback' | 'request_extend' | 'request_upsell' | 'faq' = 'faq';
    let tag_label = 'FAQ Umum';
    let needs_attention = false;
    let ctas: ChatCta[] = [];

    // 1. Try parsing JSON block from AI output
    try {
        const jsonMatch = rawText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || rawText.match(/(\{[\s\S]*"reply"[\s\S]*\})/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[1]);
            if (parsed.reply || parsed.message) reply = parsed.reply || parsed.message;
            if (parsed.intent) intent = parsed.intent;
            if (parsed.tag_label) tag_label = parsed.tag_label;
            if (typeof parsed.needs_attention === 'boolean') needs_attention = parsed.needs_attention;
            if (Array.isArray(parsed.ctas)) ctas = parsed.ctas;
        }
    } catch (_) {}

    // 2. Fallback Heuristic intent & Dynamic CTAs
    const lowerPrompt = userPrompt.toLowerCase();
    const lowerReply = reply.toLowerCase();

    // Issue / Bug detection
    if (
        lowerPrompt.includes('kendala') ||
        lowerPrompt.includes('gagal') ||
        lowerPrompt.includes('error') ||
        lowerPrompt.includes('masalah') ||
        lowerPrompt.includes('saldo terpotong') ||
        lowerPrompt.includes('belum masuk') ||
        lowerPrompt.includes('kenapa belum')
    ) {
        intent = 'issue';
        tag_label = lowerPrompt.includes('bayar') || lowerPrompt.includes('saldo') ? 'Kendala Pembayaran' : 'Kendala Sistem';
        needs_attention = true;
        if (ctas.length === 0) {
            ctas.push({
                id: 'report_admin',
                label: '🚨 Lapor Kendala ke Admin',
                action: 'chat_prompt',
                target: 'Min, saya ada kendala pada pesanan saya dan butuh bantuan admin.',
                variant: 'warning'
            });
        }
    }
    // Feedback / Saran
    else if (
        lowerPrompt.includes('saran') ||
        lowerPrompt.includes('masukan') ||
        lowerPrompt.includes('usul') ||
        lowerPrompt.includes('rekomendasi fitur')
    ) {
        intent = 'feedback';
        tag_label = 'Saran / Masukan';
        needs_attention = false;
    }
    // Request Extend / Tambah Hari
    else if (
        lowerPrompt.includes('perpanjang') ||
        lowerPrompt.includes('extend') ||
        lowerPrompt.includes('tambah hari') ||
        lowerPrompt.includes('tambah durasi')
    ) {
        intent = 'request_extend';
        tag_label = 'Request Extend';
        needs_attention = true;
        if (ctas.length === 0) {
            ctas.push({
                id: 'extend_action',
                label: '➕ Ajukan Perpanjangan Iklan',
                action: 'chat_prompt',
                target: 'Min, saya mau ajukan perpanjangan durasi penayangan survei saya.'
            });
        }
    }
    // Request JFU Kilat
    else if (
        lowerPrompt.includes('kilat') ||
        lowerPrompt.includes('cepat') ||
        lowerPrompt.includes('mendesak') ||
        lowerPrompt.includes('deadline') ||
        lowerPrompt.includes('hari ini juga')
    ) {
        intent = 'request_upsell';
        tag_label = 'Tanya JFU Kilat';
        if (ctas.length === 0) {
            ctas.push({
                id: 'kilat_info',
                label: '⚡ Buka Layanan JFU Kilat',
                action: 'chat_prompt',
                target: 'Min, tolong jelaskan detail dan biaya JFU Kilat untuk survei saya.'
            });
        }
    }

    // Contextual order CTAs if relevant order exists and no CTAs yet
    if (ctas.length === 0) {
        const liveOrder = userOrderStates.find(o => o.ui.callout === 'live');
        const paymentOrder = userOrderStates.find(o => o.ui.callout === 'payment' || o.ui.callout === 'ready_to_launch');
        if (liveOrder && (lowerReply.includes('tayang') || lowerReply.includes('live') || lowerPrompt.includes('status'))) {
            ctas.push({
                id: 'track_ads',
                label: '📊 Pantau Iklan Survei',
                action: 'navigate',
                target: '/dashboard'
            });
            ctas.push({
                id: 'extend_ads',
                label: '➕ Perpanjang Iklan',
                action: 'chat_prompt',
                target: 'Min, survei saya yang sedang live ini bisa diperpanjang 1 hari lagi?'
            });
        } else if (paymentOrder && (lowerReply.includes('jadwal') || lowerReply.includes('bayar') || lowerPrompt.includes('kapan'))) {
            ctas.push({
                id: 'calendar_pay',
                label: '📅 Buka Kalender & Bayar',
                action: 'navigate',
                target: '/dashboard'
            });
        }
    }

    return { reply, intent, tag_label, needs_attention, ctas };
}

    // Auto-send message from query param or user input
    const sendMessageDirect = useCallback(async (messageText: string) => {
        if (!messageText.trim() || isLoading) return;

        const userMessage = messageText.trim();
        const newMessages = [...messages, { role: 'user' as const, content: userMessage }];
        setMessages(newMessages);
        setIsLoading(true);

        if (sessionId) {
            saveChatMessage(sessionId, 'user', userMessage);
        }

        const systemPrompt = buildSystemPrompt();

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    "model": "google/gemini-2.5-flash-lite",
                    "sessionId": sessionId,
                    "messages": [
                        { "role": "system", "content": systemPrompt },
                        ...newMessages.map(m => ({ role: m.role, content: m.content }))
                    ]
                })
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                console.error('[Mimin AI] OpenRouter error:', { status: response.status, error: data.error, data });
            }

            const rawAiContent = data.choices?.[0]?.message?.content || "Maaf, saya sedang mengalami kendala. Silakan coba lagi nanti.";
            const parsed = parseMiminResponse(rawAiContent, userMessage, orderStates);

            setMessages(prev => [...prev, { 
                role: 'assistant', 
                content: parsed.reply,
                ctas: parsed.ctas
            }]);

            if (sessionId) {
                saveChatMessage(sessionId, 'assistant', parsed.reply, {
                    tag: parsed.intent,
                    tag_label: parsed.tag_label,
                    needs_attention: parsed.needs_attention
                });
            }
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Maaf, terjadi kesalahan koneksi. Silakan coba lagi.' }]);
        } finally {
            setIsLoading(false);
        }
    }, [messages, isLoading, sessionId, buildSystemPrompt, orderStates]);

    useEffect(() => {
        const messageParam = searchParams.get('message');
        if (messageParam && !autoSentRef.current && sessionId) {
            autoSentRef.current = true;
            // Clear the param from URL
            setSearchParams(params => {
                params.delete('message');
                return params;
            });
            // Small delay to allow chat to initialize
            setTimeout(() => sendMessageDirect(messageParam), 500);
        }
    }, [searchParams, sessionId, sendMessageDirect, setSearchParams]);

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isLoading) return;
        const userMessage = input.trim();
        setInput('');
        await sendMessageDirect(userMessage);
    };

    const handleCtaClick = (cta: ChatCta) => {
        if (cta.action === 'navigate' && cta.target) {
            navigate(cta.target);
        } else if (cta.action === 'chat_prompt' && cta.target) {
            sendMessageDirect(cta.target);
        } else {
            sendMessageDirect(cta.label);
        }
    };

    // Contextual Quick Chips based on User's Order Status (Status-Aware)
    const quickChips = useMemo(() => {
        const chips: Array<{ label: string; action: 'navigate' | 'prompt'; target?: string; prompt?: string }> = [];
        const calloutSet = new Set(orderStates.map((o) => o.ui.callout));

        if (calloutSet.has('live')) {
            chips.push({ label: '📊 Pantau Iklan Live', action: 'navigate', target: '/dashboard' });
            chips.push({ label: '➕ Perpanjang Iklan', action: 'prompt', prompt: 'Min, saya mau ajukan perpanjangan durasi iklan survei saya.' });
        }
        if (calloutSet.has('payment') || calloutSet.has('ready_to_launch') || calloutSet.has('extend_payment')) {
            chips.push({ label: '📅 Buka Kalender Jadwal & Bayar', action: 'navigate', target: '/dashboard' });
        }
        if (calloutSet.has('review_manual')) {
            chips.push({ label: '🕒 Berapa lama review survei?', action: 'prompt', prompt: 'Berapa lama proses review survei saya?' });
        }
        if (calloutSet.has('revision')) {
            chips.push({ label: '⚠️ Kenapa survei perlu revisi?', action: 'prompt', prompt: 'Kenapa survei saya perlu revisi?' });
        }

        chips.push({ label: '⚡ Opsi JFU Kilat', action: 'prompt', prompt: 'Min, apa bedanya JFU Kilat dengan Survey Ads biasa?' });
        chips.push({ label: '🔍 Cek Biaya & Kuota', action: 'prompt', prompt: 'Min, bagaimana cara hitung biaya survei dan pertanyaan grid?' });
        chips.push({ label: '🚨 Lapor Kendala', action: 'prompt', prompt: 'Min, saya ada kendala pada pesanan saya dan butuh bantuan admin.' });

        return chips;
    }, [orderStates]);

    return (
        <div className="h-[calc(100dvh-3.5rem)] md:h-auto">
            <div className="max-w-4xl mx-auto h-full px-0 md:px-6 md:py-4">
                <div className="h-full md:h-[calc(100vh-7.5rem)] md:grid md:grid-cols-2 md:gap-6 md:items-stretch">
                    {/* FAQ — desktop saja */}
                    <div className="hidden md:block h-full min-h-0">
                        <Card className="h-full flex flex-col overflow-hidden border border-jfu-primary/[0.06] shadow-card bg-white transition-colors duration-300" style={{ borderRadius: '20px' }}>
                            <CardHeader className="pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-jfu-primary/[0.08] rounded-xl flex items-center justify-center">
                                        <HelpCircle className="w-5 h-5 text-jfu-primary" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl font-bold text-[#1a1a1a]">FAQ & Knowledge</CardTitle>
                                        <CardDescription className="text-[#666]">Pertanyaan umum seputar Jakpat for Univ.</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="overflow-y-auto pr-4 custom-scrollbar">
                                <Accordion type="single" collapsible className="w-full">
                                    {faqs.map((faq, i) => (
                                        <AccordionItem key={i} value={`item-${i}`} className="border-b border-gray-100 px-2">
                                            <AccordionTrigger className="text-left py-4 text-[15px] font-medium text-[#1a1a1a] hover:text-jfu-primary transition-colors">
                                                {faq.q}
                                            </AccordionTrigger>
                                            <AccordionContent className="text-gray-600 text-sm pb-4 leading-relaxed">
                                                {faq.a}
                                            </AccordionContent>
                                        </AccordionItem>
                                    ))}
                                </Accordion>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Chat Mimin AI — tampilan utama tab Bantuan */}
                    <div className="h-full min-h-0">
                        <Card className="border-0 md:border md:border-jfu-primary/[0.06] bg-white h-full flex flex-col rounded-none md:rounded-[20px] shadow-none md:shadow-card overflow-hidden">
                            <CardHeader className="relative bg-white border-b border-gray-100 py-3 md:pb-4">
                                <div className="flex items-center gap-3 md:gap-4">
                                    <div className="relative">
                                        <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-jfu-primary to-jfu-light rounded-full flex items-center justify-center shadow-glow">
                                            <Bot className="w-6 h-6 md:w-7 md:h-7 text-white" />
                                        </div>
                                        <span className="absolute bottom-0 right-0 w-3 h-3 md:w-3.5 md:h-3.5 bg-green-500 border-2 border-white rounded-full"></span>
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg md:text-xl font-bold text-[#1a1a1a]">Mimin AI</CardTitle>
                                        <CardDescription className="flex items-center gap-1.5 text-xs font-medium text-[#666] mt-0.5">
                                            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                                            Asisten Admin Cerdas - Siap Membantu
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>

                            {/* Chat Messages Area */}
                            <CardContent className="flex-1 overflow-y-auto p-4 md:p-5 space-y-5 md:space-y-6 bg-jfu-bg" ref={scrollRef}>
                                {messages.map((msg, idx) => (
                                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                                        <div className={`
                                            max-w-[88%] px-4 py-3 md:px-5 md:py-3.5 text-[15px] shadow-sm
                                            ${msg.role === 'user'
                                                ? 'bg-gradient-to-br from-jfu-primary to-jfu-light text-white rounded-2xl rounded-tr-sm'
                                                : 'bg-white text-[#1a1a1a] border border-gray-200 rounded-2xl rounded-tl-sm shadow-sm'
                                            }
                                        `}>
                                            <ReactMarkdown
                                                components={{
                                                    p: (props) => <p className="mb-2.5 last:mb-0 leading-relaxed" {...props} />,
                                                    ul: (props) => <ul className="list-disc pl-5 mb-2.5 space-y-1" {...props} />,
                                                    ol: (props) => <ol className="list-decimal pl-5 mb-2.5 space-y-1" {...props} />,
                                                    li: (props) => <li className="pl-1" {...props} />,
                                                    strong: (props) => <span className="font-semibold" {...props} />,
                                                    a: (props) => <a className={`${msg.role === 'user' ? 'text-white/90 hover:text-white' : 'text-jfu-primary hover:text-jfu-dark'} underline transition-colors`} target="_blank" rel="noopener noreferrer" {...props} />,
                                                }}
                                            >
                                                {msg.content}
                                            </ReactMarkdown>

                                            {/* Dynamic Action Buttons / CTAs in Assistant Message */}
                                            {msg.ctas && msg.ctas.length > 0 && (
                                                <div className="mt-3 pt-2.5 border-t border-gray-100 flex flex-wrap gap-1.5">
                                                    {msg.ctas.map((cta, ctaIdx) => (
                                                        <button
                                                            key={ctaIdx}
                                                            type="button"
                                                            onClick={() => handleCtaClick(cta)}
                                                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95 ${
                                                                cta.variant === 'warning'
                                                                    ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                                                                    : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                                                            }`}
                                                        >
                                                            <span>{cta.label}</span>
                                                            <ArrowRight className="w-3 h-3" />
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {isLoading && (
                                    <div className="flex justify-start animate-in fade-in duration-300">
                                        <div className="bg-white rounded-2xl rounded-tl-sm px-5 py-3 border border-gray-200 shadow-sm flex items-center gap-3 text-sm text-gray-500">
                                            <div className="flex gap-1">
                                                <span className="w-1.5 h-1.5 bg-jfu-primary rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                                <span className="w-1.5 h-1.5 bg-jfu-primary rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                                <span className="w-1.5 h-1.5 bg-jfu-primary rounded-full animate-bounce"></span>
                                            </div>
                                            <span className="font-medium">Mimin sedang mengetik...</span>
                                        </div>
                                    </div>
                                )}
                            </CardContent>

                            {/* Contextual Quick Chips Bar (Mobile & Desktop) */}
                            <div className="border-t border-gray-100 bg-white px-3 md:px-4 py-2">
                                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                                    <span className="text-[11px] font-bold text-gray-400 shrink-0 mr-1 flex items-center gap-1">
                                        <Sparkles className="w-3 h-3 text-jfu-primary" /> Rekomendasi:
                                    </span>
                                    {quickChips.map((chip, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            disabled={isLoading}
                                            onClick={() => {
                                                if (chip.action === 'navigate' && chip.target) {
                                                    navigate(chip.target);
                                                } else {
                                                    sendMessageDirect(chip.prompt || chip.label);
                                                }
                                            }}
                                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-jfu-primary/20 bg-jfu-primary/[0.06] hover:bg-jfu-primary/[0.12] px-3 py-1 text-xs font-semibold text-jfu-primary transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                                        >
                                            <span>{chip.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Chat Input Area */}
                            <div className="p-3 md:p-4 bg-white border-t border-gray-100">
                                <form onSubmit={handleSendMessage} className="flex gap-3 relative">
                                    <Input
                                        placeholder="Ketik pertanyaan atau minta bantuan Mimin..."
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        disabled={isLoading}
                                        className="flex-1 bg-white text-[#1a1a1a] border border-gray-200 focus-visible:ring-jfu-primary/30 focus-visible:ring-offset-0 focus-visible:border-jfu-primary py-6 pl-5 pr-14 rounded-full text-[15px] shadow-sm transition-all placeholder:text-gray-400"
                                    />
                                    <Button
                                        type="submit"
                                        size="icon"
                                        disabled={isLoading || !input.trim()}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 bg-gradient-to-br from-jfu-primary to-jfu-light hover:from-jfu-dark hover:to-jfu-primary text-white rounded-full shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                                    >
                                        <Send className="w-4 h-4 ml-0.5" />
                                    </Button>
                                </form>
                                <div className="hidden md:block text-[11px] font-medium text-center text-gray-400 mt-2.5 tracking-wide">
                                    ⚡ Powered by Jakpat Agentic AI
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
