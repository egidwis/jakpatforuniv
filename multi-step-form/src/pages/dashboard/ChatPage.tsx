import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpCircle, Send, Loader2, Bot } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { getOrCreateChatSession, getChatMessages, saveChatMessage, type ChatSession } from '@/utils/supabase';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import ReactMarkdown from 'react-markdown';

export function ChatPage() {
    const { user } = useAuth();


    const faqs = [
        {
            q: "Apa bedanya Jakpat for Universities dengan Jakpat biasa?",
            a: "JFU fokus pada kebutuhan akademik dengan harga lebih ramah mahasiswa/dosen, alur yang lebih simpel, dan fleksibel untuk tugas kuliah, skripsi, thesis, atau riset akademik."
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
            q: "Berapa rekomendasi insentif untuk responden?",
            a: "Kami membatasi jumlah pemenang hingga maksimal 5 orang, namun untuk nominal hadiah tidak ada batasan, dapat disesuaikan kebutuhan. Rekomendasinya adalah memberikan minimal Rp25.000 untuk 2 pemenang. Umumnya, semakin besar insentif yang ditawarkan, semakin tinggi minat responden untuk berpartisipasi dalam survei kamu."
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

        // System prompt construction
        const systemPrompt = `You are Mimin AI, a helpful virtual assistant for Jakpat for Universities (JFU).
Your goal is to assist students and lecturers with their academic survey needs using Jakpat.
You are politely but strictly profesional.
Context: Jakpat (Jajak Pendapat) is an online survey platform with valid respondents in Indonesia.

Here is the Knowledge Base (FAQ):
${faqs.map(f => `Q: ${f.q}\nA: ${f.a}`).join('\n')}

Additional Important Information:
1. **Review Process**:
   - Reviews are done during Working Days (Mon-Fri, 08:00 - 17:00).
   - Submissions outside these hours will be queued for review.
2. **Invoicing**:
   - Once the survey is reviewed and approved, the Admin will send the invoice via WhatsApp.
3. **How it Works**:
   - Step 1: Klik menu "Submissions" lalu Isi order form. Lengkapi detail surveymu di form pemesanan.
   - Step 2: Track status surveimu, Admin akan cek & beri feedback, Tim Jakpat akan memverifikasi dan memberikan masukan jika perlu.
   - Step 3: Surveimu diiklankan. Kami publikasikan surveymu di website Jakpat.
   - Step 4: Tunggu hasilnya. Duduk santai dan pantau responden masuk.
4. **Pricing (Per Day)**:
   - 1-15 questions: Rp 150.000
   - 16-30 questions: Rp 200.000
   - 31-50 questions: Rp 300.000
   - 51-70 questions: Rp 400.000
   - >70 questions: Rp 500.000
   - *Note: Price does not include respondent incentives.*
5. **features**:
   - **Randomization**: Rp 20.000 per link. Used to distribute multiple survey scenarios randomly.
6. **Survey Ad Link**:
   - Link iklan akan diinfokan dari admin setelah iklan publish.

Rules:
1. Answer based on the FAQ and Additional Information provided.
2. **DO NOT** provide the Admin's or Jakpat Team's WhatsApp number if asked. Instead, politely inform the user that:
   - You cannot share personal contact numbers.
   - If they have submitted a survey, the Jakpat Team will automatically review it.
   - Once the review is complete, the Jakpat Team will contact THEM directly via WhatsApp for the next steps (invoicing/scheduling).
3. If the user asks about payment errors or complex issues that Mimin cannot answer, ask them to wait for the official team to contact them.
4. Be concise and friendly. Use Indonesian language.
`;

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY}`,
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
        <div className="p-6 md:p-8 max-w-6xl mx-auto h-[calc(100vh-4rem)] flex flex-col">
            <div className="space-y-8 h-full flex flex-col">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Bantuan & Chat</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">
                        Cari jawaban di FAQ atau tanya langsung ke Mimin AI.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6 items-start flex-1 min-h-0">
                    {/* FAQ Card - Left Side */}
                    <Card className="h-full flex flex-col overflow-hidden">
                        <CardHeader>
                            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
                                <HelpCircle className="w-6 h-6 text-orange-600" />
                            </div>
                            <CardTitle>FAQ</CardTitle>
                            <CardDescription>
                                Pertanyaan umum seputar JFU.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="overflow-y-auto pr-2 custom-scrollbar">
                            <Accordion type="single" collapsible className="w-full">
                                {faqs.map((faq, i) => (
                                    <AccordionItem key={i} value={`item-${i}`}>
                                        <AccordionTrigger className="text-left text-sm">{faq.q}</AccordionTrigger>
                                        <AccordionContent className="text-gray-600 dark:text-gray-300 text-sm">
                                            {faq.a}
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        </CardContent>
                    </Card>

                    {/* Chat AI Card - Right Side */}
                    <Card className="border-blue-100 bg-white dark:bg-gray-800 h-full flex flex-col shadow-lg overflow-hidden">
                        <CardHeader className="bg-blue-50/50 dark:bg-blue-900/10 border-b pb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center">
                                    <Bot className="w-6 h-6 text-blue-600 dark:text-blue-300" />
                                </div>
                                <div>
                                    <CardTitle className="text-lg">Mimin AI</CardTitle>
                                    <CardDescription className="flex items-center gap-1.5 text-xs">
                                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                        Online - Siap membantu
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>

                        {/* Chat Messages Area */}
                        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30 dark:bg-gray-900/30" ref={scrollRef}>
                            {messages.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`
                                        max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm
                                        ${msg.role === 'user'
                                            ? 'bg-blue-600 text-white rounded-tr-sm'
                                            : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 border border-gray-100 dark:border-gray-600 rounded-tl-sm'
                                        }
                                    `}>
                                        <ReactMarkdown
                                            components={{
                                                p: (props) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
                                                ul: (props) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />,
                                                ol: (props) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...props} />,
                                                li: (props) => <li className="pl-1" {...props} />,
                                                strong: (props) => <span className="font-bold" {...props} />,
                                                a: (props) => <a className="underline hover:text-blue-200 transition-colors" target="_blank" rel="noopener noreferrer" {...props} />,
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-white dark:bg-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 border border-gray-100 dark:border-gray-600 flex items-center gap-2 text-sm text-gray-500">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Mimin sedang mengetik...
                                    </div>
                                </div>
                            )}
                        </CardContent>

                        {/* Chat Input Area */}
                        <div className="p-4 bg-white dark:bg-gray-800 border-t">
                            <form onSubmit={handleSendMessage} className="flex gap-2">
                                <Input
                                    placeholder="Ketik pertanyaanmu..."
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    disabled={isLoading}
                                    className="flex-1 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus-visible:ring-blue-500"
                                />
                                <Button type="submit" size="icon" disabled={isLoading || !input.trim()} className="bg-blue-600 hover:bg-blue-700">
                                    <Send className="w-4 h-4" />
                                </Button>
                            </form>
                            <div className="text-[10px] text-center text-gray-400 mt-2">
                                Powered by Jakpat AI
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
