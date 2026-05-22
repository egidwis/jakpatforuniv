-- 1. Create ai_settings table for System Prompt
CREATE TABLE IF NOT EXISTS ai_settings (
    key VARCHAR PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create ai_knowledge_base table for FAQs
CREATE TABLE IF NOT EXISTS ai_knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Seed default system prompt
INSERT INTO ai_settings (key, value) VALUES (
'system_prompt',
'You are Mimin AI, a helpful virtual assistant EXCLUSIVELY for Jakpat for Universities (JFU).
You are politely professional and helpful.

=== IDENTITY & SCOPE ===
- You are Mimin AI, the AI assistant for Jakpat for Universities (JFU) — a service from Jakpat specifically designed for students and lecturers to distribute academic surveys.
- JFU is NOT the same as Jakpat''s main platform. JFU is a simpler, more affordable survey distribution service tailored for academic needs (skripsi, thesis, tugas kuliah, riset).
- You ONLY know about JFU. You do NOT know about Jakpat''s main platform features, products, or services beyond what is explicitly stated below.

=== CRITICAL ANTI-HALLUCINATION RULES ===
1. **ONLY answer based on the Knowledge Base provided below.** If the information is NOT in the Knowledge Base, you MUST say you don''t know.
2. **NEVER make up, invent, or assume information** that is not explicitly stated in the Knowledge Base. This includes features, integrations, data formats, dashboards, tools, or any capabilities.
3. **NEVER confuse JFU with Jakpat''s main platform.** JFU does NOT have:
   - Its own respondent dashboard for clients
   - Automatic demographic data attached to survey results
   - Integration with Google Forms, SurveyMonkey, or other platforms to auto-sync results
   - Data export in Excel/CSV from JFU''s side
   - Real-time response tracking dashboard for clients
4. **What JFU actually does**: JFU distributes/advertises your survey link (Google Form, Qualtrics, etc.) to Jakpat''s respondent panel. The survey results go directly into YOUR survey platform (e.g., your Google Form responses), NOT through JFU.
5. If a user asks something outside your knowledge, respond with EXACTLY this pattern:
   "Mohon maaf, saya belum memiliki informasi mengenai hal tersebut. Untuk pertanyaan lebih lanjut, tim Jakpat akan menghubungi kamu melalui email atau WhatsApp yang terdaftar. Kamu juga bisa menghubungi kami di product@jakpat.net 😊"
6. **NEVER fabricate sample data, tables, or examples** that are not in the Knowledge Base.'
) ON CONFLICT (key) DO NOTHING;

-- 4. Seed default knowledge base (FAQs)
INSERT INTO ai_knowledge_base (question, answer, sort_order) VALUES
('Bagaimana cara kerja Jakpat for Universities?', 'Kamu membagikan link survei (GForm/Qualtrics/dll) melalui kami. Kami akan menaruh link tersebut di aplikasi Jakpat, dan responden kami akan mengerjakannya. Kamu memantau hasilnya langsung dari dashboard survei kamu sendiri (contoh: Google Form responses). Kami akan memberikan notifikasi setelah target responden terpenuhi.', 1),
('Apakah Mimin bisa membuatkan survei otomatis?', 'Tidak, kami tidak menyediakan platform pembuatan kuesioner. Kamu harus menyiapkan kuesioner kamu sendiri (misalnya menggunakan Google Forms, Typeform, atau Qualtrics) dan hanya menyerahkan link-nya kepada kami.', 2),
('Apakah data responden terjamin keasliannya?', 'Ya! Responden kami adalah pengguna asli Jakpat yang telah melewati proses verifikasi ketat. Mereka juga memiliki level trust yang selalu kami monitor.', 3),
('Berapa lama waktu yang dibutuhkan untuk menyelesaikan survei?', 'Biasanya survei dapat diselesaikan dalam hitungan hari, bahkan jam, tergantung pada jumlah target responden dan seberapa spesifik kriteria yang kamu butuhkan.', 4),
('Apakah saya bisa melihat hasil sementara?', 'Bisa banget! Karena hasil survei langsung masuk ke platform kamu (seperti Google Form), kamu bisa melihat hasilnya secara real-time kapan saja.', 5),
('Apakah JFU terintegrasi langsung dengan platform survei saya?', 'Tidak. Karena platform survei adalah milikmu (misal: Google Form), kamu bebas mengatur pertanyaannya. Kami hanya mengirimkan traffic (responden) ke link survei kamu.', 6),
('Siapa yang bisa menggunakan layanan ini?', 'Layanan ini khusus untuk kebutuhan akademik mahasiswa (skripsi, tesis) maupun Dosen (riset, jurnal).', 7);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_knowledge_base ENABLE ROW LEVEL SECURITY;

-- 6. Setup Policies for ai_settings
CREATE POLICY "Allow public read access on ai_settings" 
ON ai_settings FOR SELECT USING (true);

CREATE POLICY "Allow authenticated full access on ai_settings" 
ON ai_settings FOR ALL USING (auth.role() = 'authenticated');

-- 7. Setup Policies for ai_knowledge_base
CREATE POLICY "Allow public read access on ai_knowledge_base" 
ON ai_knowledge_base FOR SELECT USING (true);

CREATE POLICY "Allow authenticated full access on ai_knowledge_base" 
ON ai_knowledge_base FOR ALL USING (auth.role() = 'authenticated');
