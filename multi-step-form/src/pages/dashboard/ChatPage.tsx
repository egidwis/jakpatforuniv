import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpCircle, Send, Bot } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { supabase, getOrCreateChatSession, getChatMessages, saveChatMessage, getFormSubmissionsByUser, getExtendsBySubmissionIds, type FormSubmission, type FormSubmissionExtend } from '@/utils/supabase';
import { deriveOrderUiState, describeOrderForChat } from '@/components/status/deriveOrderUiState';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import ReactMarkdown from 'react-markdown';


export function ChatPage() {
    const { user } = useAuth();


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
            q: "Bisa extend durasi iklan/survei?",
            a: "Bisa. Durasi iklan dapat diperpanjang dengan membayar biaya iklan tambahan tanpa perlu memberikan insentif ulang kepada responden. Namun, jika iklan dihentikan cukup lama dan kemudian dijalankan kembali, hal tersebut akan dianggap sebagai iklan baru sehingga perlu menyediakan insentif responden kembali."
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
    const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant', content: string }>>([
        { role: 'assistant', content: 'Halo! Saya Mimin AI. Ada yang bisa saya bantu terkait survei akademikmu?' }
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
    // prompt — tanpa ini Mimin buta terhadap order dan tidak bisa menjawab
    // "kapan survei saya tayang?".
    const [userOrders, setUserOrders] = useState<Array<{ submission: FormSubmission; extends_: FormSubmissionExtend[] }>>([]);

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
                        setMessages(savedMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })));
                    }
                }
            }

            // 3. Fetch order user untuk ORDER CONTEXT (maks. 3 terbaru, data
            // milik sendiri di bawah RLS — dibangun client-side seperti prompt)
            if (user?.id) {
                try {
                    const subs = await getFormSubmissionsByUser(user.id, user.email);
                    const recent = subs.slice(0, 3);
                    const ids = recent.map((s) => s.id).filter((id): id is string => !!id);
                    const allExtends = ids.length > 0 ? await getExtendsBySubmissionIds(ids) : [];
                    setUserOrders(recent.map((submission) => ({
                        submission,
                        extends_: allExtends.filter((e) => e.submission_id === submission.id),
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
        () => userOrders.map(({ submission, extends_ }) => ({
            submission,
            ui: deriveOrderUiState(submission, extends_),
        })),
        [userOrders]
    );

    // Build system prompt (shared by handleSendMessage and sendMessageDirect)
    const buildSystemPrompt = useCallback(() => {
        const basePrompt = systemPrompt || `You are Mimin AI, a helpful virtual assistant EXCLUSIVELY for Jakpat for Universities (JFU).
You are politely professional and helpful.

=== IDENTITY & SCOPE ===
- You are Mimin AI, the AI assistant for Jakpat for Univ — a service from Jakpat specifically designed for students and lecturers to distribute academic surveys.
- Jakpat for Univ is NOT the same as Jakpat's main platform. Jakpat for Univ is a simpler, more affordable survey distribution service tailored for academic needs (skripsi, thesis, tugas kuliah, riset).
- You ONLY know about Jakpat for Univ. You do NOT know about Jakpat's main platform features, products, or services beyond what is explicitly stated below.

=== CRITICAL ANTI-HALLUCINATION RULES ===
1. **ONLY answer based on the Knowledge Base provided below.** If the information is NOT in the Knowledge Base, you MUST say you don't know.
2. **NEVER make up, invent, or assume information** that is not explicitly stated in the Knowledge Base. This includes features, integrations, data formats, dashboards, tools, or any capabilities.
3. **NEVER confuse Jakpat for Univ with Jakpat's main platform.** Jakpat for Univ does NOT have:
   - Its own respondent dashboard for clients
   - Automatic demographic data attached to survey results
   - Integration with Google Forms, SurveyMonkey, or other platforms to auto-sync results
   - Data export in Excel/CSV from Jakpat for Univ's side
   - Real-time response tracking dashboard for clients
4. **What Jakpat for Univ actually does**: Jakpat for Univ distributes/advertises your survey link (Google Form, Qualtrics, etc.) to Jakpat's respondent panel. The survey results go directly into YOUR survey platform (e.g., your Google Form responses), NOT through Jakpat for Univ.
5. If a user asks something outside your knowledge, respond with EXACTLY this pattern:
   "Mohon maaf, saya belum memiliki informasi mengenai hal tersebut. Untuk pertanyaan lebih lanjut, tim Jakpat akan menghubungi kamu melalui email atau WhatsApp yang terdaftar. Kamu juga bisa menghubungi kami di product@jakpat.net 😊"
6. **NEVER fabricate sample data, tables, or examples** that are not in the Knowledge Base.`;

        const currentFaqs = faqs.length > 0 ? faqs : defaultFaqs;

        // Blok ORDER CONTEXT: data order asli user (maks. 3 terbaru). Bot hanya
        // boleh menjawab pertanyaan status dari blok ini — tidak boleh mengarang.
        const orderContext = orderStates.length > 0
            ? `

=== ORDER CONTEXT (DATA ORDER ASLI MILIK USER INI) ===
Berikut order survei terbaru milik user yang sedang chat denganmu (maksimal 3 terbaru ditampilkan):

${orderStates.map(({ submission, ui }) => describeOrderForChat(submission, ui)).join('\n\n')}

ATURAN ORDER CONTEXT:
1. Jawab pertanyaan tentang status/jadwal/pembayaran order user HANYA berdasarkan blok ORDER CONTEXT di atas. JANGAN mengarang status, tanggal, atau jumlah di luar blok ini.
2. Jika user menanyakan order yang TIDAK ada di blok ini, gunakan jawaban fallback resmi (arahkan ke product@jakpat.net atau halaman Order Saya di dashboard).
3. Jumlah responden TIDAK PERNAH dijamin — JFU hanya mengiklankan survei. Jangan menjanjikan angka responden.
4. Untuk aksi (bayar, pilih jadwal, ajukan ulang), arahkan user ke halaman "Order Saya" di dashboard.`
            : '';

        return `${basePrompt}

=== KNOWLEDGE BASE (FAQ) ===
${currentFaqs.map(f => `Q: ${f.q}\nA: ${f.a}`).join('\n')}

=== ADDITIONAL VERIFIED INFORMATION ===

1. **Review Process**:
   - Reviews are done during Working Days (Mon-Fri, 08:00 - 17:00 WIB).
   - Submissions outside these hours will be queued for review on the next business day.

2. **Invoicing**:
   - Once the survey is reviewed and approved, the Admin will send the invoice via WhatsApp.

3. **How Jakpat for Univ Works (Step by Step)**:
   - Step 1: Klik menu "Submissions" lalu isi order form. Lengkapi detail surveymu di form pemesanan.
   - Step 2: Track status surveimu. Admin akan cek & beri feedback. Tim Jakpat akan memverifikasi dan memberikan masukan jika perlu.
   - Step 3: Surveimu diiklankan. Kami publikasikan surveymu di website Jakpat agar responden bisa mengisinya.
   - Step 4: Tunggu hasilnya. Responden mengisi survei langsung di platform survei kamu (Google Form, dll). Hasil masuk langsung ke Google Form / platform survei kamu.

4. **Pricing (Per Day — Biaya Iklan)**:
   - 1-15 pertanyaan: Rp 150.000
   - 16-30 pertanyaan: Rp 200.000
   - 31-50 pertanyaan: Rp 300.000
   - 51-70 pertanyaan: Rp 400.000
   - >70 pertanyaan: Rp 500.000
   - *Catatan: Harga belum termasuk insentif responden.*
   - **PENTING - Penghitungan Grid/Matrix/Likert**: Pertanyaan dalam format grid, matrix, atau skala Likert dihitung PER BARIS/OPTION, bukan dihitung sebagai 1 pertanyaan. Contoh: jika ada 1 pertanyaan grid dengan 5 pernyataan/baris, maka itu dihitung sebagai 5 pertanyaan, BUKAN 1 pertanyaan.

5. **Fitur Tambahan**:
   - **Randomization**: Rp 20.000 per link. Digunakan untuk mendistribusikan beberapa skenario survei secara acak.

6. **Link Iklan Survei**:
   - Link iklan akan diinfokan oleh admin setelah iklan berhasil dipublish.

7. **Data Demografi Responden Jakpat** (Total: 1.7 juta responden, data diupdate secara berkala):
   - Ini adalah data demografi PANEL RESPONDEN JAKPAT secara umum, BUKAN data yang otomatis terlampir di hasil survei kamu.
   - **Sebaran Wilayah**: Jawa Barat 23.5%, Sumatera 16.3%, Jawa Timur 14.9%, Jawa Tengah 12.4%, DKI Jakarta 11.9%, Banten 6.1%, Kalimantan 5.5%, Sulawesi 4.0%, Bali Nusa 3.3%, DI Yogyakarta 2.5%, Maluku Papua 0.6%
   - **Gender**: Laki-laki 60.9%, Perempuan 39.1%
   - **Usia**: <17 tahun 7.7%, 18-24 tahun 42.7% (terbesar), 25-30 tahun 23.1%, 31-35 tahun 12.5%, 36-40 tahun 6.9%, 40+ tahun 7.1%
   - **Profesi**: Worker 32.7%, JobSeeker 22.5%, College 16.0%, Student 12.4%, Housewife 9.7%, Entrepreneur 6.8%
   - **Status Pernikahan**: Menikah 65.49%, Belum Menikah 34.6%

8. **Tentang Hasil Survei (PENTING)**:
   - Hasil survei LANGSUNG masuk ke platform survei yang kamu gunakan (Google Form, Qualtrics, SurveyMonkey, dll).
   - Jakpat for Univ TIDAK menyediakan dashboard khusus untuk melihat hasil survei.
   - Jakpat for Univ TIDAK menyediakan export data dalam format Excel/CSV.
   - Jakpat for Univ TIDAK menambahkan data demografi otomatis ke hasil surveimu.
   - Jika kamu ingin data demografi, kamu perlu menambahkan pertanyaan demografi sendiri di dalam kuesionermu.
${orderContext}

=== BEHAVIORAL RULES ===
1. ONLY answer based on the Knowledge Base, Additional Verified Information, and (for this user's own orders) the ORDER CONTEXT above. NO EXCEPTIONS.
2. **DO NOT** provide the Admin's or Jakpat Team's WhatsApp number if asked. Instead, inform:
   - Kamu tidak bisa membagikan nomor kontak pribadi.
   - Jika mereka sudah submit survei, Tim Jakpat akan otomatis mereview-nya.
   - Setelah review selesai, Tim Jakpat yang akan menghubungi MEREKA langsung via WhatsApp untuk langkah selanjutnya.
3. If the user asks about payment errors, technical bugs, or complex issues, ask them to wait for the official team or email product@jakpat.net.
4. Be concise, friendly, and use Indonesian language (Bahasa Indonesia).
5. **Winner Count Request Flow**: If a user asks about having more than 5 winners:
   - Default max is 5 pemenang for standard distribution.
   - Alasan: "agar distribusi hadiah bisa lebih merata dengan postingan iklan lainnya".
   - Jika butuh lebih dari 5, bisa dilakukan dengan metode distribusi custom (ada biaya tambahan).
   - Minta mereka submit order form dulu dengan 5 pemenang agar data tersimpan.
   - Jaminkan bahwa saat pembayaran/penjadwalan, admin akan menghubungi untuk diskusi detail custom distribution.
6. REPEAT: If the question is outside your knowledge, ALWAYS use the fallback response. NEVER guess or improvise.
`;
    }, [systemPrompt, faqs, orderStates]);

    // Auto-send message from query param
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

            const aiContent = data.choices?.[0]?.message?.content || "Maaf, saya sedang mengalami kendala. Silakan coba lagi nanti.";

            setMessages(prev => [...prev, { role: 'assistant', content: aiContent }]);

            if (sessionId) {
                saveChatMessage(sessionId, 'assistant', aiContent);
            }
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Maaf, terjadi kesalahan. Silakan coba lagi.' }]);
        } finally {
            setIsLoading(false);
        }
    }, [messages, isLoading, sessionId, buildSystemPrompt]);

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

    // Quick-reply chips (mobile): pertanyaan teratas disesuaikan state order
    // user, sisanya dari knowledge base + eskalasi admin.
    const quickReplies = useMemo(() => {
        const chips: string[] = [];
        const calloutSet = new Set(orderStates.map((o) => o.ui.callout));

        if (calloutSet.has('payment') || calloutSet.has('extend_payment')) chips.push('Bagaimana cara membayar order saya?');
        if (calloutSet.has('review_manual')) chips.push('Berapa lama proses review survei?');
        if (calloutSet.has('ready_to_launch') || calloutSet.has('payment') || calloutSet.has('awaiting_invoice')) chips.push('Kapan survei saya tayang?');
        if (calloutSet.has('live')) {
            chips.push('Survei saya sedang tayang, berapa responden yang bisa didapat dalam sehari?');
            chips.push('Mana link iklan survei saya?');
        }
        if (calloutSet.has('revision')) chips.push('Kenapa survei saya perlu revisi?');
        if (calloutSet.has('expired')) chips.push('Pembayaran saya kedaluwarsa, apa yang harus saya lakukan?');

        // Isi sisa slot dari FAQ knowledge base
        const currentFaqs = faqs.length > 0 ? faqs : defaultFaqs;
        for (const faq of currentFaqs) {
            if (chips.length >= 5) break;
            if (!chips.includes(faq.q)) chips.push(faq.q);
        }

        chips.push('Saya ingin menghubungi admin');
        return chips;
    }, [orderStates, faqs]);

    return (
        <div className="h-[calc(100dvh-3.5rem)] md:h-auto">
            <div className="max-w-4xl mx-auto h-full px-0 md:px-6 md:py-4">
                <div className="h-full md:h-[calc(100vh-7.5rem)] md:grid md:grid-cols-2 md:gap-6 md:items-stretch">
                    {/* FAQ — desktop saja; di mobile FAQ hadir sebagai quick-reply chips */}
                    <div className="hidden md:block h-full min-h-0">
                        <Card className="h-full flex flex-col overflow-hidden border border-jfu-primary/[0.06] shadow-card bg-white transition-colors duration-300" style={{ borderRadius: '20px' }}>
                            <CardHeader className="pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-jfu-primary/[0.08] rounded-xl flex items-center justify-center">
                                        <HelpCircle className="w-5 h-5 text-jfu-primary" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl font-bold text-[#1a1a1a]">FAQ</CardTitle>
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
                                            Sedang online - Siap membantu
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>

                            {/* Chat Messages Area */}
                            <CardContent className="flex-1 overflow-y-auto p-4 md:p-5 space-y-5 md:space-y-6 bg-jfu-bg" ref={scrollRef}>
                                {messages.map((msg, idx) => (
                                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                                        <div className={`
                                            max-w-[85%] px-4 py-3 md:px-5 md:py-3.5 text-[15px] shadow-sm
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

                            {/* Quick-reply chips (mobile) — FAQ versi tap-to-ask, pill DNA */}
                            <div className="md:hidden border-t border-gray-100 bg-white">
                                <div className="overflow-x-auto">
                                    <div className="flex gap-2 w-max px-4 py-2.5">
                                        {quickReplies.map((q) => (
                                            <button
                                                key={q}
                                                type="button"
                                                disabled={isLoading}
                                                onClick={() => sendMessageDirect(q)}
                                                className="whitespace-nowrap rounded-full border border-jfu-primary/20 bg-jfu-primary/[0.06] px-3 py-1.5 text-xs font-semibold text-jfu-primary active:bg-jfu-primary/[0.15] disabled:opacity-50 max-w-[260px] truncate"
                                            >
                                                {q}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Chat Input Area */}
                            <div className="p-3 md:p-4 bg-white border-t border-gray-100">
                                <form onSubmit={handleSendMessage} className="flex gap-3 relative">
                                    <Input
                                        placeholder="Ketik pertanyaanmu di sini..."
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        disabled={isLoading}
                                        className="flex-1 bg-white text-[#1a1a1a] border border-gray-200 focus-visible:ring-jfu-primary/30 focus-visible:ring-offset-0 focus-visible:border-jfu-primary py-6 pl-5 pr-14 rounded-full text-[15px] shadow-sm transition-all placeholder:text-gray-400"
                                    />
                                    <Button
                                        type="submit"
                                        size="icon"
                                        disabled={isLoading || !input.trim()}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 bg-gradient-to-br from-jfu-primary to-jfu-light hover:from-jfu-dark hover:to-jfu-primary text-white rounded-full shadow-sm transition-all disabled:opacity-50"
                                    >
                                        <Send className="w-4 h-4 ml-0.5" />
                                    </Button>
                                </form>
                                <div className="hidden md:block text-[11px] font-medium text-center text-gray-400 mt-3 tracking-wide">
                                    ⚡ Powered by Jakpat AI
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
