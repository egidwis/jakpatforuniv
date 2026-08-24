-- ==============================================================================
-- 61_custom_mission_requests.sql
-- Tabel untuk menampung permintaan Misi & Aksi Khusus (Mystery Shopping, App Testing,
-- Tasting Produk, Validasi Lomba Bisnis, & Kebutuhan Kustom Lainnya)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.custom_mission_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    category TEXT NOT NULL, -- 'mystery_shopper', 'app_testing', 'product_tasting', 'pitch_validation', 'other'
    category_custom TEXT,   -- Teks bebas jika category = 'other'
    target_respondents INTEGER NOT NULL DEFAULT 50,
    target_deadline TEXT NOT NULL DEFAULT '< 24 Jam',
    criteria_notes TEXT,    -- Kriteria khusus responden (lokasi, profesi, dll)
    reference_url TEXT,     -- Link Google Form / Figma / Website / App
    contact_name TEXT NOT NULL,
    contact_whatsapp TEXT NOT NULL,
    contact_email TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'contacted', 'in_progress', 'completed', 'cancelled'
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for fast queries by status and creation date
CREATE INDEX IF NOT EXISTS idx_custom_mission_requests_status ON public.custom_mission_requests(status);
CREATE INDEX IF NOT EXISTS idx_custom_mission_requests_created_at ON public.custom_mission_requests(created_at DESC);

-- Enable RLS
ALTER TABLE public.custom_mission_requests ENABLE ROW LEVEL SECURITY;

-- Policies:
-- 1. Siapapun (termasuk anon & authenticated) boleh insert request baru
CREATE POLICY "Allow public insert for custom mission requests"
    ON public.custom_mission_requests
    FOR INSERT
    TO public
    WITH CHECK (true);

-- 2. Authenticated users can view their own requests
CREATE POLICY "Users can view own custom mission requests"
    ON public.custom_mission_requests
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- 3. Service role & admins can manage all records
CREATE POLICY "Allow all access to custom mission requests for service role"
    ON public.custom_mission_requests
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Also allow authenticated admin access if needed (or through standard select)
CREATE POLICY "Allow authenticated read for internal dashboard"
    ON public.custom_mission_requests
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated update for internal dashboard"
    ON public.custom_mission_requests
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);
