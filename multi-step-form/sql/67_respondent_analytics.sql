-- 67_respondent_analytics.sql
-- Date: 2026-08-24  ·  agregasi tab Responden di Analytics
--
-- ============================================================================
-- KENAPA RPC, DAN APA YANG SEBENARNYA MAHAL
-- ============================================================================
--
-- Tab Responden dulu ikut `fetchAllData()`, yang menarik SELURUH baris
-- `page_respondents` (122.929 per 2026-08-24) lewat PostgREST. Batas satu respons
-- di PostgREST adalah 1000 baris, jadi:
--
--   • rentang 30 hari  = 25.262 baris =  26 round-trip
--   • "Semua waktu"    = 122.896 baris = 123 round-trip, ±22 MB JSON
--
-- Diukur dengan EXPLAIN (ANALYZE, BUFFERS): seq scan penuh tabel ini cuma
-- 45-85 ms dan SELURUHNYA cache hit (shared hit=3368, nol disk read). Jadi
-- database BUKAN hambatannya — yang mahal adalah MEMINDAHKAN barisnya. Fungsi
-- ini memampatkan semuanya jadi satu request dan ±1 KB payload.
--
-- Index baru sempat dipertimbangkan lalu DITOLAK: seq scan-nya sudah dari cache,
-- menambah index hanya menambah beban tulis tanpa menyelesaikan apa pun.
--
-- Waktu fungsi ini SETELAH dipasang, diukur di produksi 2026-08-24 (cache panas,
-- `shared hit` 100%, nol disk read):
--
--     7 hari      635 ms
--    30 hari      874 ms
--    Semua waktu  1,64 s  (dua pengukuran berturut: 1.640 / 1.624 ms)
--
-- ⚠️ Ini LEBIH LAMBAT dari perkiraan awal (±200-500 ms) — catat apa adanya,
-- jangan menjanjikan angka yang lebih baik di review. Biaya lantainya adalah CTE
-- `lifetime`: group-by seluruh tabel yang WAJIB berjalan berapa pun rentangnya,
-- terukur 148-206 ms sendirian. Varian semi-join (hanya meng-agregat norm_id yang
-- aktif di rentang) sudah dicoba dan DITOLAK: 231 ms, lebih lambat, karena ia
-- menambah satu scan lagi untuk sub-querynya.
--
-- Sortir pada join loyalitas sempat tumpah ke disk (external merge Disk: 1688kB),
-- jadi `work_mem` dinaikkan lewat atribut fungsi — lingkupnya cuma pemanggilan ini.
--
-- ============================================================================
-- JEBAKAN 1 — `jakpat_id` TIDAK KONSISTEN HURUF BESAR/KECIL
-- ============================================================================
--
-- Kolomnya `text` dan diisi apa adanya. `d7via` (12 baris) dan `D7via` (6 baris)
-- adalah ORANG YANG SAMA, tapi `count(distinct jakpat_id)` menghitungnya dua:
--
--                        mentah    ternormalisasi   selisih
--   30 hari               9.560          9.504      56 responden hantu
--   sepanjang masa       40.095         39.612     483 (1,2%)
--
-- 1,2% itu terdengar kecil, tapi BIASNYA SEARAH dan justru merusak kartu utama
-- tab ini. Satu orang setia yang terpecah dua casing tampil sebagai DUA orang
-- yang masing-masing jarang ikut:
--
--   bucket        mentah   ternormalisasi   selisih
--   1 survei      20.151        19.730      -421
--   2-3           12.339        12.231      -108
--   4-9            5.652         5.686       +34
--   10-24          1.501         1.507        +6
--   25+              452           458        +6
--
-- Tanpa normalisasi, kartu Loyalitas menggelembungkan bucket "sekali doang"
-- sebanyak 421 orang dan mengempiskan semua bucket setia — persis KEBALIKAN
-- dari ceritanya. Karena itu SETIAP count(distinct), group by, dan join di
-- bawah memakai `norm_id`, bukan `jakpat_id` mentah. Jangan pernah menambah
-- agregat baru yang menyentuh kolom mentahnya.
--
-- ⚠️ Temuan integritas yang ikut terbawa, DILAPORKAN bukan diperbaiki di sini:
-- `uq_page_respondent UNIQUE (page_id, jakpat_id)` bersifat case-sensitive, jadi
-- ia TIDAK benar-benar menjamin "satu respons per orang per survei". Terukur 44
-- pasang baris di mana orang yang sama menjawab survei yang sama dua kali hanya
-- dengan mengubah casing (`indah`/`Indah`, `jakpat.0bxr5`/`Jakpat.0bxr5`).
-- Memperbaikinya butuh keputusan bisnis (baris mana yang dibuang, apakah
-- insentifnya sudah terbayar dua kali), jadi itu migrasi tersendiri.
--
-- ============================================================================
-- JEBAKAN 2 — "RESPONDEN UNIK" TIDAK BISA DIJUMLAHKAN ANTAR HARI
-- ============================================================================
--
-- Rata-rata 552 responden unik/hari x 30 hari = 16.560, tapi responden unik
-- sebenarnya dalam 30 hari cuma 9.504 — orang yang sama datang lagi di hari
-- lain (rata-rata 5,8 survei menerima respons per hari; satu responden
-- mengerjakan 1,45 survei/hari, 2,64 dalam 30 hari).
--
-- Karena itu `daily` membawa DUA angka. `responses` yang BISA dijumlahkan
-- (itu yang digambar sebagai batang, dan jumlahnya wajib sama dengan
-- core.responses), dan `respondents` per hari yang HANYA untuk tooltip —
-- menjumlahkannya salah, dan itu sebabnya ia tidak pernah jadi tinggi batang.
--
-- ============================================================================
-- JEBAKAN 2b — JUMLAH RESPONS HARIAN DIKACAUKAN JUMLAH SURVEI HARI ITU
-- ============================================================================
--
-- Tinggi batang harian TIDAK bisa dipakai sebagai patokan "seberapa banyak
-- responden yang kita dapat", karena jumlah survei yang tayang berubah tiap hari.
-- Terukur 26 Jul – 24 Ags 2026: survei per hari berayun antara **1 dan 8**.
-- 10 Agustus mencatat 1.307 respons, tapi hari itu ada 5 survei; hari bersurvei-dua
-- tidak akan pernah menyamainya sekalipun tiap surveinya berkinerja lebih baik.
--
-- Karena itu `daily` ikut membawa `surveys` (survei berbeda yang menerima respons
-- hari itu), dan `core.survey_days` membawa penyebut untuk seluruh rentang:
-- jumlah pasangan (hari, survei). Laju yang benar adalah
--
--     responses / survey_days        -- 24.780 / 172 = 144,1 respons/survei/hari
--
-- ⚠️ `survey_days` SENGAJA bukan `surveys`. Satu survei yang tayang tujuh hari
-- menyumbang TUJUH penyebut, bukan satu — kalau tidak, survei berumur panjang akan
-- tampak jauh lebih produktif daripada survei sehari. Invariannya:
-- `core.survey_days` = jumlah kolom `daily.surveys`, jadi rata-rata TERTIMBANG dari
-- laju harian persis sama dengan KPI. Rata-rata POLOS dari laju harian (149,5)
-- bukan angka yang sama dan tidak boleh dipakai — ia menyamakan bobot hari
-- bersurvei-satu dengan hari bersurvei-delapan.
--
-- Sebaran lajunya lebar, dan itu memang temuannya: 69–261 respons per survei per
-- hari di rentang yang sama.
--
-- ============================================================================
-- JEBAKAN 2c — "HARI" DI SINI ADALAH SIKLUS TAYANG 15:00, BUKAN HARI KALENDER
-- ============================================================================
--
-- Iklan tayang 15:00 → 15:00 WIB, jadi satu tanggal kalender memuat DUA gelombang.
-- Terukur 14 Agustus 2026: delapan halaman menerima respons dalam satu tanggal —
-- empat gelombang pagi (mulai 13 Agu 15:00), tiga gelombang sore (mulai 14 Agu
-- 15:00), plus satu extra ad. Angka itu benar, tapi terbaca seperti pelanggaran
-- kuota (4 slot reguler + 4 extra khusus admin). Dihitung per JAM, yang tayang
-- bersamaan tidak pernah lebih dari LIMA sepanjang hari itu.
--
-- Karena itu embernya digeser: `wib - interval '15 hours'`, lalu `::date`. Satu
-- ember kini berisi satu gelombang utuh. Terukur pada rentang 30 hari yang sama:
--
--     ember hari kalender (00:00)   rata-rata 5,80 survei · maks 8 · 19/30 hari >5
--     ember siklus tayang (15:00)   rata-rata 4,67 survei · maks 7 ·  9/30 hari >5
--
-- ⚠️ KLIEN WAJIB MENGIRIM `p_from`/`p_to` PADA BATAS 15:00 WIB. Fungsi ini tidak
-- membetulkannya sendiri; mengirim batas tengah malam menghasilkan ember pertama
-- dan terakhir yang separuh terisi, dan laju per-survei di kedua ujung jadi
-- terlalu rendah. `toAiringCycleRange()` di `utils/analytics/respondent.ts` yang
-- melakukan pergeseran itu.
--
-- Sisa di atas kuota setelah pergeseran ini ditangani jebakan 2d.
--
-- `day_axis` dipotong di gelombang yang sedang berjalan (`now()`), supaya rentang
-- yang berakhir hari ini tidak melahirkan ember masa depan yang selalu nol —
-- setiap pagi sebelum pukul 15:00, gelombang hari ini memang belum mulai.
--
-- Sumbu `dow` ikut memakai tanggal SIKLUS, bukan tanggal mentah: kalau tidak,
-- "Kamis" di kartu Pola Waktu akan berisi separuh gelombang Rabu.
-- Sumbu `hourly` tetap jam WIB apa adanya — itu memang soal jam dinding.
--
-- ============================================================================
-- JEBAKAN 2d — "MENERIMA RESPONS" ≠ "TAYANG"
-- ============================================================================
--
-- Setelah embernya digeser ke siklus 15:00, 14 Agustus masih menyisakan ENAM
-- survei padahal papan Jadwal hanya mencatat EMPAT. Selisihnya bukan kuota yang
-- bocor: halaman survei tetap bisa dibuka lewat tautan langsung setelah iklannya
-- berhenti tayang, jadi ia masih kejatuhan respons susulan.
--
--   halaman     respons di siklus 14 Agu   jendela tayangnya
--   05b003cf              253              14 Agu 15:00 → 15 Agu 15:00   ✓ tayang
--   fb4cbd27              180              14 Agu 15:00 → 15 Agu 15:00   ✓ tayang
--   0fc1309c              143              14 Agu 15:00 → 15 Agu 15:00   ✓ tayang
--   02d04c14               69              13 Agu 15:00 → 15 Agu 15:00   ✓ tayang (hari 2/2)
--   5b62a18b                4              13 Agu 15:00 → 14 Agu 15:00   ✗ sudah tutup
--   73f3e696                1              13 Agu 15:00 → 14 Agu 15:00   ✗ sudah tutup
--
-- Menyaringnya tidak sesederhana "jendela tayang harus mencakup respons itu",
-- karena `publish_start_date` DITIMPA saat order dijadwal-ulang atau diperpanjang.
-- Terukur 90 hari: 3.335 respons (4,4%) tercatat SEBELUM `publish_start_date`
-- halamannya sendiri, tersebar di 26 pasangan bermedian 107 respons — itu hari
-- tayang sungguhan yang jendelanya sudah tidak akurat lagi. Menyaring dengan
-- jendela saja akan membuang semuanya.
--
-- Karena itu syaratnya DUA, dengan ATAU:
--
--   1. ada respons yang datang di dalam [publish_start_date, publish_end_date), ATAU
--   2. pasangan itu menyumbang >= 1% respons siklusnya.
--
-- Syarat 2 bersifat RELATIF, bukan ambang tetap, jadi ia ikut menyesuaikan diri
-- pada siklus sepi maupun ramai. Pemisahannya tegas, bukan pas-pasan — terukur
-- 90 hari:
--
--   pasangan (siklus, survei)         400 → 295   (105 dibuang)
--   respons yang penyebutnya hilang   182 dari 75.084 = 0,24%
--   pasangan terbesar yang dibuang    8 respons
--   survei per siklus                 rata-rata 4,49 → 3,31 · maks 8 → 6
--   modusnya                          4 survei/siklus (35 dari 89 siklus)
--
-- Syarat 2 bukan hiasan: 22 Juni 2026 dua iklan terus menerima jawaban sampai
-- pukul 22:00 padahal jendelanya tutup 15:00 (226 dan 145 respons — waktu itu
-- penghentian tayang masih manual). Dengan syarat jendela saja keduanya hilang
-- dan laju hari itu melonjak 198 → 395. Porsi 1% menahannya.
--
-- ⚠️ Respons susulan TETAP dihitung di `responses` — ia respons sungguhan, dan
-- `daily.responses` harus tetap berjumlah sama dengan `core.responses`. Yang
-- dibuang hanya PENYEBUT-nya. Efeknya 0,24%, disebut di sini supaya tidak
-- ditemukan lagi sebagai "kejanggalan" nanti.
--
-- ============================================================================
-- JEBAKAN 3 — LOYALITAS ITU UKURAN SEUMUR HIDUP, BUKAN UKURAN RENTANG
-- ============================================================================
--
-- "Berapa survei yang diikuti orang ini" dalam jendela 7 hari tidak berarti
-- apa-apa — hampir semua orang akan tampak "baru". Yang bermakna: dari
-- responden yang AKTIF di rentang terpilih, berapa survei yang sudah mereka
-- ikuti SEUMUR HIDUP. Pola yang sama dengan `firstPaidAtByCustomer` di
-- fetchRevenueData.ts. Karena itu CTE `lifetime` sengaja TIDAK difilter rentang.
--
-- ============================================================================
-- JEBAKAN 4 — `loi_seconds` BARU DICATAT SEJAK JULI 2026
-- ============================================================================
--
--   bulan 2026   Mar  Apr  Mei  Jun   Jul   Ags
--   terisi        0%   0%   0%  67%  100%  100%
--
-- Median dan speeder karena itu dihitung HANYA dari baris yang punya data
-- (`filter (where loi_seconds is not null)`), tidak pernah menganggap NULL
-- sebagai nol. `loi_covered` dikembalikan supaya lapisan tampilan bisa
-- memunculkan footnote cakupan saat porsi yang kosong ≥10% — pola yang sama
-- dengan `payment_channel` di kartu Metode Pembayaran.
--
-- ============================================================================
-- WIB
-- ============================================================================
--
-- Offset TETAP +7 jam, bukan `at time zone 'Asia/Jakarta'`. Bukan soal
-- kecepatan (terukur cuma ±15 ms bedanya), melainkan konsistensi: seluruh basis
-- kode memperlakukan WIB sebagai offset tetap (`WIB_OFFSET_MS`), dan
-- Asia/Jakarta memang tidak punya DST. `at time zone 'UTC'` dipakai lebih dulu
-- untuk MELEPAS zona jadi timestamp polos, supaya hasilnya tidak bergantung
-- pada `TimeZone` sesi pemanggil.
--
-- `p_prev_*` DIKIRIM dari klien, tidak dihitung ulang di sini: definisi "periode
-- sebelumnya" sudah hidup di `previousRange()` (fetchRevenueData.ts), dan
-- menyalinnya ke SQL berarti dua definisi yang bisa menyimpang diam-diam.

create or replace function public.get_respondent_analytics(
    p_from      timestamptz,
    p_to        timestamptz,   -- EKSKLUSIF
    p_prev_from timestamptz,
    p_prev_to   timestamptz    -- EKSKLUSIF
) returns jsonb
language sql
stable
security definer
set search_path = public
set work_mem = '16MB'
as $$
with
span as (
    -- Satu scan untuk dua rentang sekaligus. Rentang sebelumnya selalu bersambung
    -- di depan rentang terpilih, jadi gabungannya tetap satu interval utuh.
    select least(p_from, p_prev_from) as lo,
           greatest(p_to, p_prev_to)  as hi
),
scoped as (
    select
        upper(btrim(r.jakpat_id))                              as norm_id,
        r.page_id,
        (r.created_at at time zone 'UTC') + interval '7 hours' as wib,
        -- Tanggal SIKLUS TAYANG. Lihat jebakan 2c.
        (r.created_at at time zone 'UTC') + interval '7 hours' - interval '15 hours' as cyc,
        r.loi_seconds,
        lower(btrim(r.ewallet_provider))                       as provider,
        -- Apakah respons ini datang SELAGI iklannya masih tayang. Lihat jebakan 2d.
        (sp.publish_start_date is not null
         and sp.publish_end_date is not null
         and r.created_at >= sp.publish_start_date
         and r.created_at <  sp.publish_end_date)              as in_window,
        (r.created_at >= p_from      and r.created_at < p_to)      as is_cur,
        (r.created_at >= p_prev_from and r.created_at < p_prev_to) as is_prev
    from public.page_respondents r
    cross join span s
    left join public.survey_pages sp on sp.id = r.page_id
    where r.created_at >= s.lo
      and r.created_at <  s.hi
      and btrim(r.jakpat_id) <> ''
      -- Nilai uji, bukan orang: 'jakpat'/'Jakpat'/'JAKPAT' muncul 57 kali.
      and upper(btrim(r.jakpat_id)) <> 'JAKPAT'
),
cur as (select * from scoped where is_cur),
prv as (select * from scoped where is_prev),

-- Penyebut laju "respons per survei per hari tayang": jumlah pasangan
-- (siklus, survei) yang BENAR-BENAR TAYANG — bukan jumlah survei, dan bukan
-- sekadar "survei yang menerima respons". Lihat jebakan 2b dan 2d.
-- `page_id` nullable, jadi baris tanpa induk dibuang di sini supaya penyebutnya
-- tidak digelembungkan satu ember hantu.
pairs as (
    select cyc::date                        as d,
           page_id,
           count(*) filter (where is_cur)   as n_cur,
           count(*) filter (where is_prev)  as n_prev,
           bool_or(is_cur  and in_window)   as win_cur,
           bool_or(is_prev and in_window)   as win_prev
    from scoped
    where page_id is not null
    group by 1, 2
),
pair_day as (
    select d, sum(n_cur) as day_cur, sum(n_prev) as day_prev
    from pairs group by 1
),
-- Dua syarat, ATAU. Jendela tayang yang tercatat adalah bukti utama; porsi >= 1%
-- adalah jaring pengaman untuk baris yang jendelanya sudah DITIMPA (reschedule /
-- perpanjangan menulis ulang publish_start_date). Lihat jebakan 2d.
airing as (
    select p.d, p.page_id,
           (p.n_cur  > 0 and (p.win_cur  or p.n_cur ::numeric / nullif(t.day_cur , 0) >= 0.01)) as air_cur,
           (p.n_prev > 0 and (p.win_prev or p.n_prev::numeric / nullif(t.day_prev, 0) >= 0.01)) as air_prev
    from pairs p join pair_day t using (d)
),
cur_survey_days  as (select (count(*) filter (where air_cur ))::int as n from airing),
prev_survey_days as (select (count(*) filter (where air_prev))::int as n from airing),
cur_surveys      as (select count(distinct page_id)::int as n from airing where air_cur),
prev_surveys     as (select count(distinct page_id)::int as n from airing where air_prev),

core as (
    select
        count(*)::int                as responses,
        count(distinct norm_id)::int as respondents,
        (select n from cur_surveys)     as surveys,
        (select n from cur_survey_days) as survey_days,
        percentile_cont(0.5) within group (order by loi_seconds)
            filter (where loi_seconds is not null)                             as median_loi,
        count(*) filter (where loi_seconds is not null and loi_seconds < 60)::int as speeders,
        count(*) filter (where loi_seconds is not null)::int                   as loi_covered
    from cur
),
prev_core as (
    select
        count(*)::int                as responses,
        count(distinct norm_id)::int as respondents,
        (select n from prev_surveys)     as surveys,
        (select n from prev_survey_days) as survey_days,
        percentile_cont(0.5) within group (order by loi_seconds)
            filter (where loi_seconds is not null)                             as median_loi,
        count(*) filter (where loi_seconds is not null and loi_seconds < 60)::int as speeders,
        count(*) filter (where loi_seconds is not null)::int                   as loi_covered
    from prv
),

-- Hari KOSONG wajib ikut terbit sebagai nol, bukan hilang: sumbu X yang melompati
-- hari sepi membuat jarak antar batang berbohong tentang waktu.
day_axis as (
    select generate_series(
        ((p_from at time zone 'UTC') + interval '7 hours' - interval '15 hours')::date,
        -- Dipotong di gelombang yang SEDANG berjalan: sebelum pukul 15:00 WIB,
        -- gelombang hari ini belum mulai dan embernya akan selalu nol.
        least(
            (((p_to at time zone 'UTC') + interval '7 hours' - interval '15 hours') - interval '1 day')::date,
            ((now() at time zone 'UTC') + interval '7 hours' - interval '15 hours')::date
        ),
        interval '1 day'
    )::date as day
),
day_hits as (
    select cyc::date as day,
           count(*) as responses,
           count(distinct norm_id) as respondents
    from cur group by 1
),
-- Sengaja TIDAK dari `cur`: yang dihitung adalah survei yang tayang, bukan survei
-- yang kebetulan kejatuhan satu-dua respons susulan. Lihat jebakan 2d.
day_surveys as (
    select d as day, count(*)::int as surveys
    from airing where air_cur group by 1
),
daily as (
    select a.day,
           coalesce(h.responses, 0)::int   as responses,
           coalesce(h.respondents, 0)::int as respondents,
           coalesce(s.surveys, 0)::int     as surveys
    from day_axis a
    left join day_hits    h on h.day = a.day
    left join day_surveys s on s.day = a.day
    order by a.day
),

-- SEUMUR HIDUP — sengaja tanpa filter rentang. Lihat jebakan 3.
lifetime as (
    select upper(btrim(jakpat_id)) as norm_id,
           count(distinct page_id) as surveys
    from public.page_respondents
    where btrim(jakpat_id) <> ''
      and upper(btrim(jakpat_id)) <> 'JAKPAT'
    group by 1
),
loy_labels(ord, label) as (
    values (1, '1 survei'), (2, '2-3 survei'), (3, '4-9 survei'), (4, '10-24 survei'), (5, '25+ survei')
),
loy_hits as (
    select case
               when l.surveys >= 25 then 5
               when l.surveys >= 10 then 4
               when l.surveys >=  4 then 3
               when l.surveys >=  2 then 2
               else 1
           end as ord,
           count(*)::int as respondents
    from (select distinct norm_id from cur) c
    join lifetime l using (norm_id)
    group by 1
),
loyalty as (
    select b.ord, b.label, coalesce(h.respondents, 0)::int as respondents
    from loy_labels b left join loy_hits h using (ord)
    order by b.ord
),

loi_labels(ord, label) as (
    values (1, '< 1 mnt'), (2, '1-3 mnt'), (3, '3-6 mnt'), (4, '6-10 mnt'), (5, '> 10 mnt')
),
loi_hits as (
    select case
               when loi_seconds <  60 then 1
               when loi_seconds < 180 then 2
               when loi_seconds < 360 then 3
               when loi_seconds < 600 then 4
               else 5
           end as ord,
           count(*)::int as responses
    from cur where loi_seconds is not null
    group by 1
),
loi as (
    select b.ord, b.label, coalesce(h.responses, 0)::int as responses
    from loi_labels b left join loi_hits h using (ord)
    order by b.ord
),

-- Sumbu jam & hari selalu LENGKAP (24 dan 7). Jam sepi yang hilang dari sumbu
-- membuat puncaknya tampak lebih lebar dari sebenarnya.
hour_axis as (select generate_series(0, 23) as hour),
hour_hits as (select extract(hour from wib)::int as hour, count(*)::int as responses from cur group by 1),
hourly as (
    select a.hour, coalesce(h.responses, 0)::int as responses
    from hour_axis a left join hour_hits h using (hour)
    order by a.hour
),
dow_axis(dow, label) as (
    values (1, 'Sen'), (2, 'Sel'), (3, 'Rab'), (4, 'Kam'), (5, 'Jum'), (6, 'Sab'), (7, 'Min')
),
dow_hits as (select extract(isodow from cyc)::int as dow, count(*)::int as responses from cur group by 1),
dow as (
    select a.dow, a.label, coalesce(h.responses, 0)::int as responses
    from dow_axis a left join dow_hits h using (dow)
    order by a.dow
),

ewallet as (
    select coalesce(nullif(provider, ''), '(kosong)') as provider, count(*)::int as responses
    from cur group by 1 order by 2 desc
)

select jsonb_build_object(
    'core', (select to_jsonb(c) from core c),
    'prev', (select to_jsonb(p) from prev_core p),
    'daily',   coalesce((select jsonb_agg(to_jsonb(d)) from daily d), '[]'::jsonb),
    'loyalty', coalesce((select jsonb_agg(to_jsonb(l)) from loyalty l), '[]'::jsonb),
    'loi',     coalesce((select jsonb_agg(to_jsonb(l)) from loi l), '[]'::jsonb),
    'hourly',  coalesce((select jsonb_agg(to_jsonb(h)) from hourly h), '[]'::jsonb),
    'dow',     coalesce((select jsonb_agg(to_jsonb(d)) from dow d), '[]'::jsonb),
    'ewallet', coalesce((select jsonb_agg(to_jsonb(e)) from ewallet e), '[]'::jsonb)
);
$$;

-- Tabelnya berisi `e_wallet_number` dan `jakpat_id`. Fungsinya SECURITY DEFINER,
-- jadi hak aksesnya harus disebut eksplisit — dan `anon` tidak pernah ikut.
revoke all on function public.get_respondent_analytics(timestamptz, timestamptz, timestamptz, timestamptz) from public;
revoke all on function public.get_respondent_analytics(timestamptz, timestamptz, timestamptz, timestamptz) from anon;
grant execute on function public.get_respondent_analytics(timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;

comment on function public.get_respondent_analytics(timestamptz, timestamptz, timestamptz, timestamptz) is
'Agregasi tab Responden Analytics. Identitas responden DINORMALISASI (upper(btrim(jakpat_id))) di setiap hitungan — lihat catatan jebakan di sql/67. Loyalitas bersifat seumur hidup, bukan sebatas rentang. daily.responses bisa dijumlahkan; daily.respondents TIDAK. Ember harian = SIKLUS TAYANG 15:00-15:00 WIB (wib - 15 jam), bukan hari kalender - klien WAJIB mengirim p_from/p_to pada batas 15:00 WIB. core.survey_days = jumlah pasangan (siklus, survei) yang BENAR-BENAR TAYANG - respons susulan setelah iklan tutup tetap masuk responses tapi tidak menambah penyebut (lihat jebakan 2d).';
