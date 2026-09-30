import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpCircle, Send, Bot, ArrowRight } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { 
    supabase, 
    getOrCreateChatSession, 
    getChatMessages, 
    saveChatMessage, 
    getFormSubmissionsByUser, 
    fetchAdSchedules, 
    fetchActiveAISkills,
    type AdScheduleEntry, 
    type FormSubmission,
    type AISkill 
} from '@/utils/supabase';
import { deriveOrderUiState, describeOrderForChat } from '@/components/status/deriveOrderUiState';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import ReactMarkdown from 'react-markdown';
import { GenerativeUiRenderer, type GenerativeUiData } from '@/components/chat/generative/GenerativeUiRenderer';

interface ChatCta {
    id: string;
    label: string;
    action: 'navigate' | 'chat_prompt' | 'open_modal' | 'open_url';
    target?: string;
    variant?: 'primary' | 'secondary' | 'warning' | 'outline';
}

interface ChatMessageItem {
    role: 'user' | 'assistant';
    content: string;
    ctas?: ChatCta[];
    generative_ui?: GenerativeUiData;
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

    // AI Knowledge Base & Skills State
    const [systemPrompt, setSystemPrompt] = useState<string>('');
    const [skills, setSkills] = useState<AISkill[]>([]);
    const [faqs, setFaqs] = useState<Array<{q: string, a: string}>>([]);

    // Order milik user, untuk disuntikkan sebagai ORDER CONTEXT ke system
    const [userOrders, setUserOrders] = useState<Array<{ submission: FormSubmission; schedules: AdScheduleEntry[] }>>([]);

    // Initial load for persistence
    useEffect(() => {
        const initData = async () => {
            // 1. Fetch AI Knowledge Base & Active Skills
            try {
                const [{ data: promptData }, { data: faqsData }, activeSkills] = await Promise.all([
                    supabase.from('ai_settings').select('value').eq('key', 'system_prompt').single(),
                    supabase.from('ai_knowledge_base').select('question, answer').eq('is_active', true).order('sort_order', { ascending: true }),
                    fetchActiveAISkills()
                ]);

                if (promptData) setSystemPrompt(promptData.value);

                if (activeSkills && activeSkills.length > 0) {
                    setSkills(activeSkills);
                }

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
                            ctas: (m as any).ctas || [],
                            generative_ui: (m as any).generative_ui
                        })));
                    }
                }
            }

            // 3. Fetch order user untuk ORDER CONTEXT & Generative UI (hingga 50 survei)
            if (user?.id) {
                try {
                    const subs = await getFormSubmissionsByUser(user.id, user.email);
                    const recent = subs.slice(0, 50);
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

    // Build system prompt with Comprehensive Product Knowledge, Agentic Skills & Action Capabilities
    const buildSystemPrompt = useCallback(() => {
        const basePersona = systemPrompt || `You are Mimin AI, the Agentic AI Assistant & Virtual Admin for Jakpat for Universities (JFU).
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
- **Struktur Tier Pertanyaan**:
  * T1 (1–15 pertanyaan)
  * T2 (16–30 pertanyaan)
  * T3 (31–50 pertanyaan)
  * T4 (51–70 pertanyaan)
  * T5 (>70 pertanyaan)
- **Roadmap & Tarif Iklan (per hari tayang)**:
  * **s/d 30 September 2026**:
    T1: Rp 150.000 | T2: Rp 200.000 | T3: Rp 300.000 | T4: Rp 400.000 | T5: Rp 500.000
  * **1 Oktober – 30 November 2026** (Masa Transisi & Promo Pengenalan):
    Harga katalog resmi (list price) baru: T1: Rp 200.000 | T2: Rp 350.000 | T3: Rp 500.000 | T4: Rp 650.000 | T5: Rp 800.000.
    TETAPI ada promo potongan sehingga harga efektif yang dibayar SAMA PERSIS dengan harga lama (1 Okt adalah no-op rupiah bagi peneliti):
    -> T1: Rp 150.000 (hemat Rp 50.000)
    -> T2: Rp 200.000 (hemat Rp 150.000)
    -> T3: Rp 300.000 (hemat Rp 200.000)
    -> T4: Rp 400.000 (hemat Rp 250.000)
    -> T5: Rp 500.000 (hemat Rp 300.000)
    *PENTING: Komunikasikan penghematan selalu dalam format nominal Rupiah (bukan persentase).*
  * **1 Desember – 31 Desember 2026** (Promo Akhir Tahun: Diskon 20% dari list price):
    -> T1: Rp 160.000 | T2: Rp 280.000 | T3: Rp 400.000 | T4: Rp 520.000 | T5: Rp 640.000
  * **Mulai 1 Januari 2027** (Tarif Normal Penuh):
    -> T1: Rp 200.000 | T2: Rp 350.000 | T3: Rp 500.000 | T4: Rp 650.000 | T5: Rp 800.000
- **Tarif mana yang berlaku (WAJIB dijelaskan dengan benar)**:
  * Jadwal pertama sebuah order memakai tarif pada TANGGAL ORDER DIBUAT — termasuk bila tanggal tayangnya baru dipilih belakangan.
  * Perpanjangan (jadwal ke-2 dst.) memakai tarif pada tanggal perpanjangan DIPESAN, bukan tarif order awal.
  * Jadwal yang dilepas (lewat batas bayar) atau dibatalkan lalu DIPESAN ULANG memakai tarif pada tanggal pemesanan ulang.
  * Jadwal yang tanggal tayangnya DIPINDAH ke hari lain sebelum dibayar (oleh peneliti maupun tim Jakpat) memakai tarif pada tanggal pemindahan. Menggeser jam di hari yang sama tidak mengubah tarif.
  * Jangan menjanjikan tarif lama untuk jadwal yang dipesan ulang, dipindah, atau diperpanjang setelah tarif naik.
  * Add-on JFU Kilat tetap Rp 200.000 (belum berubah).
- **Aturan Grid/Likert/Matrix**: Setiap baris pernyataan dihitung sebagai 1 pertanyaan (bukan 1 blok).
- **Insentif Responden**: Ditentukan sendiri oleh peneliti, rekomendasi minimal Rp 25.000 untuk 2 pemenang undian.
- **Add-on Randomizer**: Rp 20.000 per link.`;

        const currentFaqs = faqs.length > 0 ? faqs : defaultFaqs;

        // Contextual SOPs from ai_skills (managed in /internal-dash)
        const skillsContext = skills.length > 0
            ? `\n\n=== PANDUAN SOP INTERNAL TIM (AGENTIC SKILLS DARI /internal-dash) ===\n` +
              `Jika konteks obrolan user berkaitan dengan salah satu situasi SOP di bawah ini, ikuti langkah SOP dan WAJIB sertakan Action Buttons (CTAs) yang ditentukan:\n\n` +
              skills.map(s => {
                let block = `[SOP: ${s.name}]\n- Situasi / Trigger: ${s.trigger_context}\n- Langkah Panduan Jawaban:\n${s.sop_instructions}\n`;
                if (s.tag) block += `- Tag Kategori: ${s.tag} (${s.tag_label || ''})\n`;
                if (s.suggested_actions && s.suggested_actions.length > 0) {
                  block += `- Action Buttons (CTAs) yang WAJIB dimasukkan ke array JSON "ctas":\n` +
                    JSON.stringify(s.suggested_actions.map(a => ({
                      id: a.label.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                      label: a.label,
                      action: a.action,
                      target: a.url || a.prompt || ''
                    }))) + '\n';
                }
                return block;
              }).join('\n\n')
            : '';

        const orderContext = orderStates.length > 0
            ? `\n\n=== ORDER CONTEXT (DATA ORDER MILIK USER SAAT INI) ===
Berikut daftar order survei milik user yang sedang chat denganmu:

${orderStates.map(({ submission, ui }) => describeOrderForChat(submission, ui)).join('\n\n')}

=== PANDUAN TOMBOL AKSI MANDIRI (SELF-SERVICE CTAS) ===
Gunakan data ORDER CONTEXT di atas untuk membuatkan tombol aksi (CTA) yang kontekstual bagi user:
1. Jika user menanyakan atau bermaksud untuk PERPANJANG DURASI SURVEI / TAMBAH HARI TAYANG / RESPON BELUM CUKUP:
   - Buatkan tombol aksi (CTA) tipe "navigate" langsung mengarah ke formulir tambah jadwal survei tersebut:
     "action": "navigate"
     "target": "/dashboard/jadwal/baru/<ID_SURVEI>"
     "label": "➕ Tambah Jadwal Baru" (atau sertakan judul singkat survei jika user punya lebih dari 1 survei)
   - Jika user memiliki lebih dari 1 survei, buatkan tombol untuk masing-masing survei agar user tinggal pilih survei mana yang ingin ditambah jadwalnya.
   - Jika user belum punya survei di ORDER CONTEXT, gunakan "target": "/dashboard".
2. Jika user menanyakan status atau ingin melihat detail survei:
   - "action": "navigate", "target": "/dashboard", "label": "📊 Buka Dashboard Survei"`
            : `\n\n=== ORDER CONTEXT ===
User saat ini belum memiliki data survei aktif di akunnya. Jika user bertanya cara perpanjang survei, jelaskan langkahnya dan beri tombol "target": "/dashboard".`;

        const jsonContract = `
=== CRITICAL BEHAVIOR & OUTPUT FORMAT ===
Balaslah dalam Bahasa Indonesia yang ramah, sopan, bersahabat, dan jelas.
PENTING:
- Teks obrolanmu ('reply') harus 100% percakapan alami manusiawi yang hangat, solutif, dan mengalir.
- JANGAN PERNAH menampilkan format teknis seperti "Label: ... -> Action: ...", "Action Buttons", atau mencantumkan kode teknis di dalam teks 'reply'.
- Tombol aksi (CTA) HANYA dimasukkan ke dalam array JSON "ctas".

=== GENERATIVE UI CAPABILITIES (@json-render) ===
Kamu memiliki kemampuan Generative UI dengan komponen standar @json-render!
Sertakan field "generative_ui" di JSON output kapan pun relevan:
1. Saat user meminta daftar survei, status survei, atau ingin mengedit:
   Sertakan Card dengan SurveyItem:
   {
     "component": "Card",
     "props": { "title": "Daftar Survei Anda", "description": "...", "badge": "..." },
     "children": [
       {
         "component": "SurveyItem",
         "props": {
           "title": "Judul Survei",
           "badge": "Perlu Revisi" | "Live" | "Review" | "Selesai",
           "badgeVariant": "warning" | "success" | "info" | "danger",
           "description": "Keterangan status / alasan revisi",
           "schedule": "Jadwal tayang jika ada",
           "actionLabel": "✏️ Edit Survei" | "📋 Buka Dashboard",
           "actionUrl": "/dashboard"
         }
       }
     ]
   }
2. Saat user bertanya estimasi biaya atau simulasi harga:
   Sertakan { "type": "price_calculator" }
3. Saat user ingin menambah jadwal / extend survei:
   Sertakan { "type": "survey_picker", "props": { "action": "extend_schedule", "action_label": "➕ Tambah Jadwal Baru" } }

Format responmu WAJIB menggunakan JSON dengan struktur:
{
  "reply": "Teks pengantar alami tanpa format teknis...",
  "intent": "issue" | "feedback" | "request_extend" | "request_upsell" | "faq",
  "tag_label": "Label ringkas maks 3 kata",
  "needs_attention": true | false,
  "ctas": [
    {
      "id": "string",
      "label": "Teks tombol",
      "action": "navigate" | "open_url" | "chat_prompt",
      "target": "URL atau prompt"
    }
  ],
  "generative_ui": { ... } // Opsional: gunakan untuk merender Card/SurveyItem/PriceCalculator/SurveyPicker
}`;

        return `${basePersona}
${skillsContext}

=== KNOWLEDGE BASE (FAQ) ===
${currentFaqs.map(f => `Q: ${f.q}\nA: ${f.a}`).join('\n')}
${orderContext}
${jsonContract}
`;
    }, [systemPrompt, skills, faqs, orderStates]);

function extractJsonObject(text: string): Record<string, any> | null {
    if (!text) return null;

    // 1. Try direct parse if whole string is valid JSON
    const trimmed = text.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
            return JSON.parse(trimmed);
        } catch (_) {}
    }

    // 2. Scan for first '{' and find matching '}' via balanced brace counter
    const firstBrace = text.indexOf('{');
    if (firstBrace === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;
    let endIdx = -1;

    for (let i = firstBrace; i < text.length; i++) {
        const char = text[i];

        if (escape) {
            escape = false;
            continue;
        }

        if (char === '\\') {
            escape = true;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            continue;
        }

        if (!inString) {
            if (char === '{') {
                depth++;
            } else if (char === '}') {
                depth--;
                if (depth === 0) {
                    endIdx = i;
                    break;
                }
            }
        }
    }

    if (endIdx !== -1) {
        const jsonStr = text.slice(firstBrace, endIdx + 1);
        try {
            return JSON.parse(jsonStr);
        } catch (_) {}
    }

    // 3. Fallback regex match for code blocks
    const match = text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (match) {
        try {
            return JSON.parse(match[1]);
        } catch (_) {}
    }

    return null;
}

function cleanRawReply(text: string): string {
    if (!text) return '';

    // Remove any ```json ... ``` blocks
    let cleaned = text.replace(/```(?:json)?[\s\S]*?```/g, '').trim();

    // Remove trailing/standalone JSON array (e.g. [{"id":...}] or [ { ... } ])
    cleaned = cleaned.replace(/\[\s*\{[\s\S]*\}\s*\]/g, '').trim();

    // Remove standalone JSON objects if leaked
    cleaned = cleaned.replace(/\{\s*["'](?:reply|component|intent|ctas|generative_ui|type)["'][\s\S]*\}/g, '').trim();

    return cleaned
        .split('\n')
        .filter(line => {
            const trimmed = line.trim();
            // Filter technical action syntax
            if (/^(?:[-*•]\s*)?label:\s*["'].*["']\s*->\s*action:/i.test(trimmed)) return false;
            if (/^(?:[-*•]\s*)?label:\s*["'].*["']/i.test(trimmed) && /action:/i.test(trimmed)) return false;
            if (/^(?:[-*•]\s*)?action:\s*(?:navigate|open_url|chat_prompt)/i.test(trimmed)) return false;
            if (/^silakan pilih salah satu opsi di bawah ini/i.test(trimmed)) return false;
            if (/^(?:[-*•]\s*)?pilih opsi berikut/i.test(trimmed)) return false;
            if (/^(?:[-*•]\s*)?action buttons?:/i.test(trimmed)) return false;

            // Filter raw JSON syntax lines (e.g. "actionUrl": "/dashboard", or closing brackets)
            if (/^\s*["'][a-zA-Z0-9_-]+["']\s*:\s*/.test(trimmed)) return false;
            if (/^\s*[{}\[\],]\s*$/.test(trimmed)) return false;
            if (trimmed.startsWith('"') && (trimmed.endsWith('",') || trimmed.endsWith('"'))) return false;

            return true;
        })
        .join('\n')
        .trim();
}

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
    generative_ui?: GenerativeUiData;
} {
    let reply = '';
    let intent: 'issue' | 'feedback' | 'request_extend' | 'request_upsell' | 'faq' = 'faq';
    let tag_label = 'FAQ Umum';
    let needs_attention = false;
    let ctas: ChatCta[] = [];
    let generative_ui: GenerativeUiData | undefined = undefined;

    // 1. Try parsing JSON object from AI output with robust brace scanning
    const parsed = extractJsonObject(rawText);
    if (parsed) {
        if (parsed.reply || parsed.message) {
            reply = cleanRawReply(parsed.reply || parsed.message);
        }
        if (parsed.intent) intent = parsed.intent;
        if (parsed.tag_label) tag_label = parsed.tag_label;
        if (typeof parsed.needs_attention === 'boolean') needs_attention = parsed.needs_attention;
        if (Array.isArray(parsed.ctas)) ctas = parsed.ctas;
        const rawUi = parsed.generative_ui || parsed.ui;
        if (rawUi && typeof rawUi === 'object') {
            generative_ui = rawUi;
        }
    } else {
        // Fallback: If rawText looks like JSON or leaked code, don't show raw brackets
        if (rawText.trim().startsWith('{')) {
            reply = cleanRawReply(rawText);
        } else {
            reply = cleanRawReply(rawText);
        }
    }

    // 2. Fallback Heuristic intent & Dynamic CTAs
    const lowerPrompt = userPrompt.toLowerCase();
    const lowerReply = (reply || rawText).toLowerCase();

    // Issue / Bug detection (for tagging/needs_attention only if not already specified by AI)
    if (
        lowerPrompt.includes('kendala') ||
        lowerPrompt.includes('gagal') ||
        lowerPrompt.includes('error') ||
        lowerPrompt.includes('masalah') ||
        lowerPrompt.includes('saldo terpotong') ||
        lowerPrompt.includes('belum masuk') ||
        lowerPrompt.includes('kenapa belum')
    ) {
        if (intent === 'faq') {
            intent = 'issue';
            tag_label = lowerPrompt.includes('bayar') || lowerPrompt.includes('saldo') ? 'Kendala Pembayaran' : 'Kendala Sistem';
            needs_attention = true;
        }
    }
    // Feedback / Saran
    else if (
        lowerPrompt.includes('saran') ||
        lowerPrompt.includes('masukan') ||
        lowerPrompt.includes('usul') ||
        lowerPrompt.includes('rekomendasi fitur')
    ) {
        if (intent === 'faq') {
            intent = 'feedback';
            tag_label = 'Saran / Masukan';
            needs_attention = false;
        }
    }
    // Request Extend / Tambah Hari / Kurang Responden
    else if (
        lowerPrompt.includes('perpanjang') ||
        lowerPrompt.includes('extend') ||
        lowerPrompt.includes('tambah hari') ||
        lowerPrompt.includes('tambah durasi') ||
        lowerPrompt.includes('responden belum') ||
        lowerPrompt.includes('responden tidak') ||
        lowerPrompt.includes('kurang responden') ||
        lowerPrompt.includes('tambah responden')
    ) {
        if (intent === 'faq') {
            intent = 'request_extend';
            tag_label = 'Request Extend';
            needs_attention = true;
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
        if (intent === 'faq') {
            intent = 'request_upsell';
            tag_label = 'Tanya JFU Kilat';
        }
    }

    // 3. Generative UI Smart Assignment
    const isExtendTopic = intent === 'request_extend' ||
        lowerPrompt.includes('perpanjang') ||
        lowerPrompt.includes('extend') ||
        lowerPrompt.includes('tambah hari') ||
        lowerPrompt.includes('tambah durasi') ||
        lowerPrompt.includes('responden belum') ||
        lowerPrompt.includes('kurang responden') ||
        lowerReply.includes('perpanjang');

    const isListOrEditSurveyTopic =
        lowerPrompt.includes('list survey') ||
        lowerPrompt.includes('list survei') ||
        lowerPrompt.includes('daftar survey') ||
        lowerPrompt.includes('daftar survei') ||
        lowerPrompt.includes('survey ku') ||
        lowerPrompt.includes('survei ku') ||
        lowerPrompt.includes('mau edit') ||
        lowerPrompt.includes('edit survey') ||
        lowerPrompt.includes('edit survei') ||
        lowerPrompt.includes('order saya') ||
        lowerPrompt.includes('pesanan saya') ||
        (lowerPrompt.includes('survei') && (lowerPrompt.includes('apa aja') || lowerPrompt.includes('yang mana')));

    // Generative UI: Survey Picker jika user ingin perpanjang dan punya survei terdaftar
    if (!generative_ui && isExtendTopic && userOrderStates.length > 0) {
        generative_ui = {
            type: 'survey_picker',
            props: { action: 'extend_schedule', action_label: '➕ Tambah Jadwal untuk Survei Terpilih' }
        };
        // Bersihkan direct CTAs repetitif agar digantikan oleh SurveyPickerWidget yang interaktif
        ctas = ctas.filter(c => !c.target || !c.target.includes('jadwal/baru'));
    }
    // Generative UI (@json-render pure): Card & SurveyItem jika user ingin melihat atau mengedit daftar survei mereka
    else if (!generative_ui && isListOrEditSurveyTopic && userOrderStates.length > 0) {
        const isEditAction = lowerPrompt.includes('edit');
        generative_ui = {
            component: 'Card',
            props: {
                title: isEditAction ? '✏️ Pilih Survei untuk Diedit' : '📋 Daftar Survei Anda',
                description: `${userOrderStates.length} survei terdaftar di akun Anda. Klik tombol untuk menuju halaman survei:`,
                badge: `${userOrderStates.length} Survei`,
            },
            children: userOrderStates.slice(0, 5).map(({ submission, ui }) => ({
                component: 'SurveyItem',
                props: {
                    title: submission.title || 'Survei Tanpa Judul',
                    badge: ui?.badgeText || (submission.status === 'approved' ? 'Disetujui' : 'Perlu Tindakan'),
                    badgeVariant: ui?.callout === 'live' ? 'success' : ui?.callout === 'payment' ? 'info' : 'warning',
                    description: ui?.body || (submission as any).rejection_reason || (submission.distribution_type === 'kilat' ? '⚡ Layanan JFU Kilat' : 'Layanan Regular'),
                    schedule: (submission as any).ad_schedules?.[0] ? `${new Date((submission as any).ad_schedules[0].start_date).toLocaleDateString('id-ID')} - ${new Date((submission as any).ad_schedules[0].end_date).toLocaleDateString('id-ID')}` : undefined,
                    actionLabel: isEditAction ? '✏️ Buka Halaman Edit' : '📋 Lihat Status Survei',
                    actionUrl: '/dashboard'
                }
            }))
        };
        ctas = ctas.filter(c => !c.target || c.target !== '/dashboard');
    }
    // Generative UI: Price Calculator jika user bertanya estimasi biaya atau harga
    else if (
        !generative_ui && (
            lowerPrompt.includes('biaya') ||
            lowerPrompt.includes('harga') ||
            lowerPrompt.includes('tarif') ||
            lowerPrompt.includes('kalkulator') ||
            (lowerPrompt.includes('berapa') && (lowerPrompt.includes('responden') || lowerPrompt.includes('hari') || lowerPrompt.includes('paket')))
        )
    ) {
        generative_ui = {
            type: 'price_calculator'
        };
    }

    // Fallback direct extend CTA jika user belum punya survei terdaftar
    if (isExtendTopic && userOrderStates.length === 0 && !ctas.some(c => c.target && c.target.includes('dashboard'))) {
        ctas.push({
            id: 'extend_order_generic',
            label: '➕ Buka Dashboard Survei',
            action: 'navigate',
            target: '/dashboard',
            variant: 'primary'
        });
    }

    // Contextual order CTAs if relevant order exists and no CTAs yet
    if (ctas.length === 0 && !generative_ui) {
        const liveOrder = userOrderStates.find(o => o.ui.callout === 'live');
        const paymentOrder = userOrderStates.find(o => o.ui.callout === 'payment' || o.ui.callout === 'ready_to_launch');
        if (liveOrder && (lowerReply.includes('tayang') || lowerReply.includes('live') || lowerPrompt.includes('status'))) {
            ctas.push({
                id: 'track_ads',
                label: '📊 Pantau Iklan Survei',
                action: 'navigate',
                target: '/dashboard'
            });
            if (liveOrder.submission.id) {
                ctas.push({
                    id: `extend_ads_${liveOrder.submission.id}`,
                    label: '➕ Tambah Hari Tayang',
                    action: 'navigate',
                    target: `/dashboard/jadwal/baru/${liveOrder.submission.id}`
                });
            }
        } else if (paymentOrder && (lowerReply.includes('jadwal') || lowerReply.includes('bayar') || lowerPrompt.includes('kapan'))) {
            ctas.push({
                id: 'calendar_pay',
                label: '📅 Buka Kalender & Bayar',
                action: 'navigate',
                target: '/dashboard'
            });
        }
    }

    if (!reply.trim() && generative_ui) {
        reply = 'Berikut adalah data survei Anda:';
    }

    return { reply, intent, tag_label, needs_attention, ctas, generative_ui };
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
                    "response_format": { "type": "json_object" },
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
                ctas: parsed.ctas,
                generative_ui: parsed.generative_ui
            }]);

            if (sessionId) {
                saveChatMessage(sessionId, 'assistant', parsed.reply, {
                    tag: parsed.intent,
                    tag_label: parsed.tag_label,
                    needs_attention: parsed.needs_attention
                }, parsed.ctas, parsed.generative_ui);
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
        let target = (cta.target || '').trim();

        // Jika target berupa full URL yang menuju ke domain aplikasi sendiri, ubah jadi relative path untuk React Router navigate
        if (target.startsWith('http://') || target.startsWith('https://')) {
            try {
                const parsedUrl = new URL(target);
                if (
                    parsedUrl.hostname.includes('jakpatforuniv.com') ||
                    parsedUrl.hostname === 'localhost' ||
                    parsedUrl.hostname === '127.0.0.1'
                ) {
                    target = parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
                }
            } catch (_) {}
        }

        if ((cta.action === 'navigate' || target.startsWith('/')) && target) {
            navigate(target);
        } else if (cta.action === 'open_url' && target) {
            // Automatically support email address even if user didn't write mailto:
            if (target.includes('@') && !target.startsWith('http') && !target.startsWith('mailto:')) {
                target = `mailto:${target}`;
            }

            if (target.startsWith('mailto:') || target.startsWith('tel:')) {
                window.location.href = target;
            } else {
                window.open(target, '_blank', 'noopener,noreferrer');
            }
        } else if (cta.action === 'chat_prompt' && target) {
            sendMessageDirect(target);
        } else {
            sendMessageDirect(cta.label);
        }
    };


    return (
        <div className="h-[calc(100dvh-3.5rem)] md:h-auto">
            <div className="max-w-6xl xl:max-w-7xl mx-auto h-full px-0 md:px-6 md:py-4">
                <div className="h-full md:h-[calc(100vh-7.5rem)] md:grid md:grid-cols-[360px_minmax(0,1fr)] lg:grid-cols-[400px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)] md:gap-6 md:items-stretch overflow-hidden">
                    {/* FAQ — desktop saja */}
                    <div className="hidden md:block h-full min-h-0 min-w-0">
                        <Card className="h-full flex flex-col overflow-hidden border border-jfu-primary/[0.08] shadow-card bg-white transition-all duration-300 min-w-0" style={{ borderRadius: '24px' }}>
                            <CardHeader className="pb-3.5 pt-5 px-5 border-b border-gray-100 bg-slate-50/40">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-jfu-primary/[0.08] text-jfu-primary rounded-2xl flex items-center justify-center shrink-0 shadow-2xs">
                                        <HelpCircle className="w-5 h-5 text-jfu-primary" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <CardTitle className="text-lg font-bold text-slate-900 tracking-tight">FAQ & Knowledge</CardTitle>
                                        <CardDescription className="text-xs text-slate-500 mt-0.5">Pertanyaan umum seputar Jakpat for Universities.</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="flex-1 overflow-y-auto p-4 md:p-5 custom-scrollbar min-w-0">
                                <Accordion type="single" collapsible className="w-full space-y-2.5">
                                    {faqs.map((faq, i) => (
                                        <AccordionItem 
                                            key={i} 
                                            value={`item-${i}`} 
                                            className="border border-slate-200/70 rounded-2xl px-4 py-0 bg-slate-50/40 hover:bg-slate-50/90 transition-all data-[state=open]:bg-white data-[state=open]:border-jfu-primary/30 data-[state=open]:shadow-2xs"
                                        >
                                            <AccordionTrigger className="text-left py-3.5 text-sm font-semibold text-slate-800 hover:text-jfu-primary hover:no-underline transition-colors leading-snug">
                                                {faq.q}
                                            </AccordionTrigger>
                                            <AccordionContent className="text-slate-600 text-xs sm:text-sm pb-4 leading-relaxed border-t border-slate-100 pt-2.5">
                                                {faq.a}
                                            </AccordionContent>
                                        </AccordionItem>
                                    ))}
                                </Accordion>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Chat Mimin AI — tampilan utama tab Bantuan */}
                    <div className="h-full min-h-0 min-w-0">
                        <Card className="border-0 md:border md:border-jfu-primary/[0.08] bg-white h-full flex flex-col rounded-none md:rounded-[24px] shadow-none md:shadow-card overflow-hidden min-w-0">
                            <CardHeader className="relative bg-white border-b border-gray-100 py-3 md:pb-4 shrink-0">
                                <div className="flex items-center gap-3 md:gap-4">
                                    <div className="relative">
                                        <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-jfu-primary to-jfu-light rounded-full flex items-center justify-center shadow-glow">
                                            <Bot className="w-6 h-6 md:w-7 md:h-7 text-white" />
                                        </div>
                                        <span className="absolute bottom-0 right-0 w-3 h-3 md:w-3.5 md:h-3.5 bg-green-500 border-2 border-white rounded-full"></span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <CardTitle className="text-lg md:text-xl font-bold text-[#1a1a1a] truncate">Mimin AI</CardTitle>
                                        <CardDescription className="flex items-center gap-1.5 text-xs font-medium text-[#666] mt-0.5">
                                            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse shrink-0" />
                                            <span className="truncate">Asisten Admin Cerdas - Siap Membantu</span>
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>

                            {/* Chat Messages Area */}
                            <CardContent className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 sm:p-4 md:p-5 space-y-4 md:space-y-5 bg-jfu-bg min-w-0" ref={scrollRef}>
                                {messages.map((msg, idx) => (
                                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} w-full min-w-0 animate-in slide-in-from-bottom-2 duration-300`}>
                                        <div className={`
                                            max-w-[94%] sm:max-w-[85%] px-3.5 py-3 md:px-5 md:py-3.5 text-[14px] sm:text-[15px] shadow-sm min-w-0 break-words overflow-hidden box-border
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

                                            {/* Generative UI Component Widget (@json-render / Custom) */}
                                            {msg.generative_ui && (
                                                <GenerativeUiRenderer
                                                    data={msg.generative_ui}
                                                    userOrders={userOrders}
                                                />
                                            )}

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
