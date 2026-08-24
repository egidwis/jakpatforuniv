-- 68_campaign_link_clicks.sql
-- Date: 2026-08-24  ·  log klik per-tanggal untuk tab Campaign
--
-- ============================================================================
-- MASALAHNYA: `click_count` TIDAK PUNYA TANGGAL
-- ============================================================================
--
-- `campaign_links` hanya menyimpan penghitung kumulatif seumur hidup plus satu
-- `last_clicked_at`. Terukur 2026-08-24: 3 link, 44 klik total, dan **tidak ada
-- satu pun cara** untuk menjawab "berapa klik minggu lalu". Tab Campaign sedang
-- dipindahkan ke rentang tanggal bebas (seperti Revenue & Responden), dan angka
-- kumulatif tidak bisa dipotong per rentang tanpa log.
--
-- Ini kategori masalah yang sama dengan `views_count` di `survey_pages` — bedanya
-- klik masih bisa diselamatkan karena satu-satunya penulisnya adalah SATU fungsi.
--
-- ⚠️ LOG INI MULAI DARI NOL. 44 klik lama hanya ada sebagai angka tanpa tanggal
-- dan TIDAK BISA dibangkitkan ulang. UI wajib menyebutkan tanggal mulai
-- pencatatan (`CAMPAIGN_CLICK_LOG_SINCE` di `src/utils/constants.ts`) selama
-- rentang yang dipilih belum sepenuhnya tertutup log — pola yang sama dengan
-- footnote cakupan `loi_seconds` di tab Responden.
--
-- ============================================================================
-- KENAPA SISI KLIEN TIDAK BERUBAH SAMA SEKALI
-- ============================================================================
--
-- `CampaignTracker.tsx` memanggil `increment_campaign_click(p_source)` lalu
-- selalu redirect, terlepas dari hasil RPC-nya. Dengan menaruh penulisan log DI
-- DALAM fungsi yang sama, log ikut terisi tanpa satu baris pun perubahan di
-- klien, tanpa round-trip kedua, dan tanpa risiko penghitung naik sementara
-- log-nya gagal — keduanya satu transaksi.
--
-- Fungsinya sudah SECURITY DEFINER dan dipanggil `anon`; itu tetap. Yang berubah
-- hanya isinya.
--
-- ⚠️ SIFAT YANG SENGAJA DIPERTAHANKAN: `ON CONFLICT (source_name)` berarti
-- membuka `/c/<apa pun>` MEMBUAT baris link baru — tidak ada allowlist. Belum
-- disalahgunakan (baru 3 baris sejak Mei 2026), tapi log ini mewarisi sifat yang
-- sama. Memperbaikinya adalah perubahan perilaku tersendiri, bukan pekerjaan
-- migrasi ini; jangan diselipkan di sini.

-- ---------------------------------------------------------------------------
-- Tabel log
-- ---------------------------------------------------------------------------

create table if not exists public.campaign_link_clicks (
    id          bigint generated always as identity primary key,
    -- Sengaja TEKS, bukan FK ke campaign_links.id: baris link boleh dihapus dari
    -- tabel manajemen ("Data klik tidak akan terhapus" — janji yang sudah ada di
    -- dialog konfirmasi UI), dan FK ber-cascade akan diam-diam mengingkarinya.
    source_name text        not null,
    clicked_at  timestamptz not null default now()
);

-- Satu-satunya pola query: filter rentang, lalu group per hari & per source.
create index if not exists campaign_link_clicks_clicked_at_idx
    on public.campaign_link_clicks (clicked_at);
create index if not exists campaign_link_clicks_source_clicked_at_idx
    on public.campaign_link_clicks (source_name, clicked_at);

comment on table public.campaign_link_clicks is
    'Satu baris = satu klik campaign link. Ditulis HANYA oleh increment_campaign_click() (SECURITY DEFINER). Pencatatan dimulai 2026-08-24; klik sebelum itu hanya ada sebagai campaign_links.click_count tanpa tanggal.';

-- ---------------------------------------------------------------------------
-- RLS: anon tidak pernah menyentuh tabel ini secara langsung
-- ---------------------------------------------------------------------------
--
-- Grant tabel di proyek ini luas (anon punya INSERT/SELECT/UPDATE/DELETE pada
-- `public` lewat default privileges), jadi RLS-lah yang benar-benar menggerbang.
-- Nol policy untuk `anon` = anon tidak bisa membaca maupun menulis; jalur satu-
-- satunya adalah fungsi definer. Grant-nya tetap dicabut eksplisit supaya
-- niatnya terbaca tanpa harus menelusuri policy.

alter table public.campaign_link_clicks enable row level security;

revoke all on public.campaign_link_clicks from anon;

drop policy if exists "Authenticated can read campaign link clicks" on public.campaign_link_clicks;
create policy "Authenticated can read campaign link clicks"
    on public.campaign_link_clicks
    for select
    to authenticated
    using (true);

drop policy if exists "Service role full access campaign link clicks" on public.campaign_link_clicks;
create policy "Service role full access campaign link clicks"
    on public.campaign_link_clicks
    for all
    to service_role
    using (true)
    with check (true);

-- ---------------------------------------------------------------------------
-- RPC: penghitung + log dalam SATU transaksi
-- ---------------------------------------------------------------------------
--
-- `click_count` SENGAJA tetap dipelihara. Ia bukan duplikat yang bisa dibuang:
-- tabel manajemen menampilkan total seumur hidup, dan hanya kolom itu yang tahu
-- 44 klik sebelum log ada. Menghapusnya berarti angka itu jadi nol besok pagi.

create or replace function public.increment_campaign_click(p_source text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
    v_source text := lower(trim(p_source));
begin
    if v_source is null or v_source = '' then
        return;
    end if;

    insert into public.campaign_links (source_name, click_count, last_clicked_at, description)
    values (v_source, 1, now(), null)
    on conflict (source_name)
    do update set
        click_count     = public.campaign_links.click_count + 1,
        last_clicked_at = now();

    insert into public.campaign_link_clicks (source_name) values (v_source);
end;
$function$;

comment on function public.increment_campaign_click(text) is
    'Menaikkan campaign_links.click_count DAN menulis satu baris campaign_link_clicks, dalam satu transaksi. Dipanggil anon dari CampaignTracker.tsx.';

grant execute on function public.increment_campaign_click(text) to anon, authenticated;
