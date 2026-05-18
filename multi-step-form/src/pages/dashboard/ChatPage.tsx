import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpCircle, Send, Bot, Menu } from 'lucide-react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { getOrCreateChatSession, getChatMessages, saveChatMessage } from '@/utils/supabase';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import ReactMarkdown from 'react-markdown';


export function ChatPage() {
    const { user } = useAuth();
    const { toggleSidebar } = useOutletContext<{ toggleSidebar: () => void }>();


    const faqs = [
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

    // Initial load for persistence
    useEffect(() => {
        const initSession = async () => {
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
        };
        initSession();
    }, [user?.email]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Build system prompt (shared by handleSendMessage and sendMessageDirect)
    const buildSystemPrompt = useCallback(() => {
        return `You are Mimin AI, a helpful virtual assistant EXCLUSIVELY for Jakpat for Universities (JFU).
You are politely professional and helpful.

=== IDENTITY & SCOPE ===
- You are Mimin AI, the AI assistant for Jakpat for Universities (JFU) — a service from Jakpat specifically designed for students and lecturers to distribute academic surveys.
- JFU is NOT the same as Jakpat's main platform. JFU is a simpler, more affordable survey distribution service tailored for academic needs (skripsi, thesis, tugas kuliah, riset).
- You ONLY know about JFU. You do NOT know about Jakpat's main platform features, products, or services beyond what is explicitly stated below.

=== CRITICAL ANTI-HALLUCINATION RULES ===
1. **ONLY answer based on the Knowledge Base provided below.** If the information is NOT in the Knowledge Base, you MUST say you don't know.
2. **NEVER make up, invent, or assume information** that is not explicitly stated in the Knowledge Base. This includes features, integrations, data formats, dashboards, tools, or any capabilities.
3. **NEVER confuse JFU with Jakpat's main platform.** JFU does NOT have:
   - Its own respondent dashboard for clients
   - Automatic demographic data attached to survey results
   - Integration with Google Forms, SurveyMonkey, or other platforms to auto-sync results
   - Data export in Excel/CSV from JFU's side
   - Real-time response tracking dashboard for clients
4. **What JFU actually does**: JFU distributes/advertises your survey link (Google Form, Qualtrics, etc.) to Jakpat's respondent panel. The survey results go directly into YOUR survey platform (e.g., your Google Form responses), NOT through JFU.
5. If a user asks something outside your knowledge, respond with EXACTLY this pattern:
   "Mohon maaf, saya belum memiliki informasi mengenai hal tersebut. Untuk pertanyaan lebih lanjut, tim Jakpat akan menghubungi kamu melalui email atau WhatsApp yang terdaftar. Kamu juga bisa menghubungi kami di product@jakpat.net 😊"
6. **NEVER fabricate sample data, tables, or examples** that are not in the Knowledge Base.

=== KNOWLEDGE BASE (FAQ) ===
${faqs.map(f => `Q: ${f.q}\nA: ${f.a}`).join('\n')}

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

=== BEHAVIORAL RULES ===
1. ONLY answer based on the Knowledge Base and Additional Verified Information above. NO EXCEPTIONS.
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
    }, [faqs]);

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
                    "model": "google/gemini-2.0-flash-lite-001",
                    "messages": [
                        { "role": "system", "content": systemPrompt },
                        ...newMessages.map(m => ({ role: m.role, content: m.content }))
                    ]
                })
            });

            const data = await response.json();
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
    }, [messages, isLoading, sessionId]);

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
        const newMessages = [...messages, { role: 'user' as const, content: userMessage }];
        setMessages(newMessages);
        setIsLoading(true);

        // Save user message to DB
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
                    "model": "google/gemini-2.0-flash-lite-001",
                    "messages": [
                        { "role": "system", "content": systemPrompt },
                        ...newMessages.map(m => ({ role: m.role, content: m.content }))
                    ]
                })
            });

            const data = await response.json();
            const aiContent = data.choices?.[0]?.message?.content || "Maaf, saya sedang mengalami kendala. Silakan coba lagi nanti.";

            setMessages(prev => [...prev, { role: 'assistant', content: aiContent }]);

            // Save Assistant message to DB
            if (sessionId) {
                saveChatMessage(sessionId, 'assistant', aiContent);
            }

        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => [...prev, { role: 'assistant', content: "Maaf, koneksi terputus. Mohon periksa internet Anda." }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-6 md:p-8 max-w-6xl mx-auto h-screen md:h-[calc(100vh-4rem)] flex flex-col">
            {/* Floating Mobile Header */}
            <div className="fixed top-4 left-4 right-4 z-40 md:hidden">
                <div className="backdrop-blur-md bg-white/80 border border-gray-100 shadow-sm rounded-2xl px-4 py-2.5 flex items-center justify-between">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleSidebar}
                        className="-ml-2 h-9 w-9"
                    >
                        <Menu className="w-5 h-5 text-gray-700" />
                    </Button>
                    <span className="text-sm font-semibold text-gray-700">Support</span>
                    <div className="w-9" />
                </div>
            </div>
            <div className="h-16 shrink-0 md:hidden" />{/* Spacer for floating header */}
            <div className="space-y-4 h-full flex flex-col pt-2">
                <div className="grid md:grid-cols-2 gap-6 items-start flex-1 min-h-0">
                    {/* FAQ Card - Left Side */}
                    <Card className="h-full flex flex-col overflow-hidden border-transparent shadow-sm bg-gray-50/50 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-800 transition-colors duration-300">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center shadow-inner">
                                    <HelpCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                </div>
                                <div>
                                    <CardTitle className="text-xl">FAQ</CardTitle>
                                    <CardDescription>Pertanyaan umum seputar JFU.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="overflow-y-auto pr-4 custom-scrollbar">
                            <Accordion type="single" collapsible className="w-full">
                                {faqs.map((faq, i) => (
                                    <AccordionItem key={i} value={`item-${i}`} className="border-b border-gray-100 dark:border-gray-700/50 px-2">
                                        <AccordionTrigger className="text-left py-4 text-[15px] font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                                            {faq.q}
                                        </AccordionTrigger>
                                        <AccordionContent className="text-gray-600 dark:text-gray-300 text-sm pb-4 leading-relaxed">
                                            {faq.a}
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        </CardContent>
                    </Card>

                    {/* Chat AI Card - Right Side */}
                    <Card className="border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 h-full flex flex-col shadow-xl shadow-blue-900/5 hover:shadow-2xl hover:shadow-blue-900/10 transition-shadow duration-300 overflow-hidden ring-1 ring-blue-50 dark:ring-blue-900/20">
                        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-b border-blue-100 dark:border-blue-800/50 pb-4">
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-md">
                                        <Bot className="w-7 h-7 text-white" />
                                    </div>
                                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full"></span>
                                </div>
                                <div>
                                    <CardTitle className="text-xl font-bold text-gray-900 dark:text-white">Mimin AI</CardTitle>
                                    <CardDescription className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 mt-0.5">
                                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                        Sedang online - Siap membantu
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>

                        {/* Chat Messages Area */}
                        <CardContent className="flex-1 overflow-y-auto p-5 space-y-6 bg-slate-50/50 dark:bg-slate-900/50" ref={scrollRef}>
                            {messages.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                                    <div className={`
                                        max-w-[85%] px-5 py-3.5 text-[15px] shadow-sm
                                        ${msg.role === 'user'
                                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl rounded-tr-sm'
                                            : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-100 dark:border-gray-700/50 rounded-2xl rounded-tl-sm shadow-sm'
                                        }
                                    `}>
                                        <ReactMarkdown
                                            components={{
                                                p: (props) => <p className="mb-2.5 last:mb-0 leading-relaxed" {...props} />,
                                                ul: (props) => <ul className="list-disc pl-5 mb-2.5 space-y-1" {...props} />,
                                                ol: (props) => <ol className="list-decimal pl-5 mb-2.5 space-y-1" {...props} />,
                                                li: (props) => <li className="pl-1" {...props} />,
                                                strong: (props) => <span className="font-semibold" {...props} />,
                                                a: (props) => <a className={`${msg.role === 'user' ? 'text-blue-200 hover:text-blue-100' : 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300'} underline transition-colors`} target="_blank" rel="noopener noreferrer" {...props} />,
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex justify-start animate-in fade-in duration-300">
                                    <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-tl-sm px-5 py-3 border border-gray-100 dark:border-gray-700/50 shadow-sm flex items-center gap-3 text-sm text-gray-500">
                                        <div className="flex gap-1">
                                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></span>
                                        </div>
                                        <span className="font-medium">Mimin sedang mengetik...</span>
                                    </div>
                                </div>
                            )}
                        </CardContent>

                        {/* Chat Input Area */}
                        <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700/50 shadow-[0_-4px_24px_-12px_rgba(0,0,0,0.05)]">
                            <form onSubmit={handleSendMessage} className="flex gap-3 relative">
                                <Input
                                    placeholder="Ketik pertanyaanmu di sini..."
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    disabled={isLoading}
                                    className="flex-1 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus-visible:ring-blue-500 focus-visible:ring-offset-0 focus-visible:border-blue-500 py-6 pl-4 pr-14 rounded-xl text-[15px] shadow-sm transition-all placeholder:text-gray-400"
                                />
                                <Button
                                    type="submit"
                                    size="icon"
                                    disabled={isLoading || !input.trim()}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-all disabled:opacity-50"
                                >
                                    <Send className="w-4 h-4 ml-0.5" />
                                </Button>
                            </form>
                            <div className="text-[11px] font-medium text-center text-gray-400 dark:text-gray-500 mt-3 tracking-wide">
                                ⚡ Powered by Jakpat AI
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
