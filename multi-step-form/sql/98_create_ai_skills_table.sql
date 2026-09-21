-- Migration 98: Create ai_skills table for Agentic AI Capabilities & SOP Management
-- Allows admin to define modular skills, triggers, procedural SOPs, and dynamic action CTAs

CREATE TABLE IF NOT EXISTS ai_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    description TEXT,
    trigger_context TEXT NOT NULL,
    sop_instructions TEXT NOT NULL,
    suggested_actions JSONB DEFAULT '[]'::jsonb,
    tag VARCHAR(50) DEFAULT 'faq',
    tag_label VARCHAR(100) DEFAULT 'FAQ Umum',
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for querying active skills quickly
CREATE INDEX IF NOT EXISTS idx_ai_skills_active_sort 
ON ai_skills (is_active, sort_order ASC);

-- Enable RLS
ALTER TABLE ai_skills ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read active skills (used by client chat)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'ai_skills' AND policyname = 'Allow public read active skills'
    ) THEN
        CREATE POLICY "Allow public read active skills"
        ON ai_skills FOR SELECT
        USING (is_active = true);
    END IF;
END $$;

-- Policy: Authenticated users / admins can do all actions (CRUD)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'ai_skills' AND policyname = 'Allow authenticated users manage ai_skills'
    ) THEN
        CREATE POLICY "Allow authenticated users manage ai_skills"
        ON ai_skills FOR ALL
        USING (auth.role() = 'authenticated')
        WITH CHECK (auth.role() = 'authenticated');
    END IF;
END $$;

-- Seed Default Core Agentic Skills
INSERT INTO ai_skills (name, description, trigger_context, sop_instructions, suggested_actions, tag, tag_label, is_active, sort_order)
VALUES
(
    'Diagnosa Responden Kurang & Upsell Extend',
    'Menangani keluhan user ketika perolehan responden kuesioner lambat atau sedikit, menganalisis penyebab, dan menawarkan opsi perpanjangan jadwal tayang.',
    'User bertanya atau mengeluh: respondennya sepi, lambat, belum mencapai target, kenapa kuesioner belum selesai, atau ingin menambah durasi penayangan.',
    '1. Tunjukkan empati dan periksa status order user yang aktif (cek tanggal selesai tayang).\n2. Berikan insight penyebab (misal: kriteria demografi spesifik membutuhkan waktu penetrasi, atau traffic akhir pekan/hari libur).\n3. Tawarkan solusi konkrit: perpanjangan slot tayang (Extend) seharga Rp 50.000/hari tambahan untuk memberi waktu responden mengisi kuesioner.\n4. Sertakan action button untuk membuka perpanjangan atau konsultasi kriteria.',
    '[
        {"label": "🚀 Perpanjang Durasi Tayang (+50rb/hari)", "action": "navigate", "url": "/dashboard"},
        {"label": "💬 Konsultasi Target Responden", "action": "open_url", "url": "https://wa.me/6281234567890?text=Halo%20Admin%20Jakpat,%20saya%20ingin%20konsultasi%20target%20responden%20kuesioner"}
    ]'::jsonb,
    'request',
    'Request Extend / Kuota',
    true,
    1
),
(
    'Konsultasi Pemilihan Layanan (Survey Ads vs Kilat vs Panel)',
    'Membimbing calon peneliti memilih layanan yang paling cocok berdasarkan deadline dan spesifikasi responden yang dibutuhkan.',
    'User bingung memilih produk, menanyakan perbedaan Survey Ads vs JFU Kilat vs Respondent Access, atau bertanya layanan mana yang cocok untuk skripsi mereka.',
    '1. Tanyakan 2 faktor penentu utama: (a) Deadline kapan kuesioner harus selesai, dan (b) Apakah butuh kriteria responden spesifik/niche.\n2. Jika butuh sangat cepat (< 24 jam) untuk kriteria umum mahasiswa: rekomendasikan JFU Kilat.\n3. Jika budget terjangkau dan kriteria umum: rekomendasikan Survey Ads (mulai Rp 150.000).\n4. Jika butuh kriteria khusus (misal: pemilik mobil tertentu, profesi dokter): rekomendasikan Respondent Access / Dedicated Panel.\n5. Berikan tombol langsung ke pembuatan order atau kalkulator harga.',
    '[
        {"label": "⚡ Mulai Order JFU Kilat", "action": "navigate", "url": "/dashboard"},
        {"label": "📋 Buat Order Survey Ads", "action": "navigate", "url": "/dashboard"},
        {"label": "📊 Cek Simulasi Biaya", "action": "navigate", "url": "/pricing"}
    ]'::jsonb,
    'faq',
    'Konsultasi Produk',
    true,
    2
),
(
    'Bantuan Status Order & Kendala Pembayaran',
    'Membantu user yang menanyakan status verifikasi kuesioner, tagihan DOKU pending, atau cara pembayaran QRIS/VA.',
    'User menanyakan kenapa kuesionernya masih "Menunggu Verifikasi", belum disetujui, link pembayaran kedaluwarsa, atau pembayaran belum terkonfirmasi.',
    '1. Jelaskan proses verifikasi: tim melakukan audit kesesuaian jumlah pertanyaan dan memastikan tidak ada permintaan data pribadi (PII) sensitif (maksimal 1x24 jam kerja).\n2. Ingatkan user memastikan link Google Form / kuesioner sudah berstatus "Siapa saja yang memiliki tautan dapat mengisi" (bukan restricted restricted email kampus).\n3. Untuk kendala pembayaran pending/expired, arahkan untuk cek tab Riwayat Pembayaran atau generate ulang invoice.\n4. Berikan tombol CTA langsung ke halaman order.',
    '[
        {"label": "🔍 Cek Status Order Saya", "action": "navigate", "url": "/dashboard"},
        {"label": "💳 Panduan Pembayaran", "action": "navigate", "url": "/faq"}
    ]'::jsonb,
    'issue',
    'Kendala Status / Bayar',
    true,
    3
),
(
    'Eskalasi Komplain & Human Handoff (Darurat)',
    'Mendeteksi keluhan serius, frustrasi user, transaksi gagal tapi saldo terpotong, atau permintaan berbicara langsung dengan tim support manusia.',
    'User marah, kecewa, mengalami error fatal, saldo terpotong tapi order gagal, atau secara eksplisit meminta "bicara dengan manusia/admin asli".',
    '1. Berikan respon permohonan maaf yang tulus dan tenang, akui masalah yang dialami user.\n2. Catat bahwa kasus ini segera dieskalasikan ke tim admin prioritas tinggi.\n3. Jangan berdebat atau memberikan alasan teknis yang berbelit-belit.\n4. Sediakan tombol langsung untuk terhubung dengan WhatsApp Customer Support resmi Jakpat beserta ringkasan masalah.',
    '[
        {"label": "🔴 Hubungi Admin CS Resmi (WhatsApp)", "action": "open_url", "url": "https://wa.me/6281234567890?text=Halo%20Admin%20Jakpat,%20saya%20mengalami%20kendala%20mendesak%20pada%20order%20saya"}
    ]'::jsonb,
    'issue',
    'Eskalasi Mendesak',
    true,
    4
),
(
    'Panduan Form & Audit Data Pribadi (PII)',
    'Mengedukasi user tentang aturan kuesioner di Jakpat, larangan meminta KTP/No HP/Nomor Rekening responden, dan cara setting kuesioner agar cepat disetujui.',
    'User bertanya kenapa kuesionernya ditolak/diminta revisi, aturan pertanyaan kuesioner, atau apakah boleh minta kontak responden untuk undian hadiah.',
    '1. Jelaskan regulasi Jakpat: Dilarang keras meminta PII (Nomor KTP, Nomor Rekening, atau kontak pribadi responden) di dalam form kuesioner demi privasi responden.\n2. Jika user menyediakan doorprize insentif sendiri: sarankan menaruh pertanyaan nomor HP/e-wallet di form terpisah di halaman akhir (bukan di form utama) atau gunakan mekanisme reward Jakpat.\n3. Berikan tips agar kuesioner cepat disetujui: pastikan form public dan jumlah pertanyaan sesuai dengan paket yang dipesan.',
    '[
        {"label": "📝 Cek Aturan Kuesioner", "action": "navigate", "url": "/faq"},
        {"label": "✏️ Edit Kuesioner Saya", "action": "navigate", "url": "/dashboard"}
    ]'::jsonb,
    'faq',
    'Panduan Kuesioner',
    true,
    5
)
ON CONFLICT DO NOTHING;
