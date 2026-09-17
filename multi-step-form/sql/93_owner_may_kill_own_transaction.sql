-- ============================================================================
-- 93. `transactions` — pemilik boleh MEMATIKAN transaksinya sendiri
-- ============================================================================
--
-- ⚠️ INI KAMBUHAN KEENAM DARI POLA YANG SAMA: "RLS UPDATE hilang = 0 baris
-- senyap". Lihat memori proyek `rls-update-policy-silent-zero-rows.md`.
--
-- ── GEJALA YANG DILAPORKAN PEMILIK PRODUK (17 Sep 2026) ────────────────────
--
-- Peneliti membatalkan jadwal, lalu memesan lagi di TANGGAL YANG SAMA. Layar
-- menolak, atau menampilkan "tagihan sedang disiapkan tim kami" — kalimat
-- tentang admin, di tengah fitur yang justru dibuat supaya admin tidak perlu.
-- Diperbaiki sekali (582994c, filter `.or()`), TAPI KAMBUH LAGI.
--
-- ── SEBAB SESUNGGUHNYA ─────────────────────────────────────────────────────
--
-- `public.transactions` hanya punya SATU policy UPDATE:
--
--     "Admin Update Transactions"  →  auth.jwt()->>'email' = 'product@jakpat.net'
--
-- NOL policy UPDATE untuk pemilik. Maka `cancelSchedule()` — yang dijalankan
-- dari klien PENELITI — mengirim UPDATE-nya, mengenai NOL baris, dan PostgREST
-- MENGEMBALIKANNYA TANPA ERROR. Kode lalu berjalan terus seolah berhasil.
--
-- Terukur di produksi, sebagai peneliti sungguhan (SET LOCAL ROLE + klaim JWT
-- asli, dibungkus ROLLBACK):
--
--     tx_terlihat (SELECT) = 1     ← peneliti BISA melihat barisnya
--     tx_terupdate (UPDATE) = 0    ← tapi TIDAK bisa mengubahnya, tanpa error
--     inv_terupdate (UPDATE) = 1   ← `invoices` justru BISA (sql/92)
--
-- Asimetri itulah cacatnya. Satu tagihan hidup di DUA tabel. Sesudah sql/92,
-- `invoices` mati sementara `transactions` tetap `pending` selamanya — persis
-- "tagihan hantu" yang blok itu ada untuk menutup, hanya terbalik tabelnya.
--
-- Terukur pada order uji 08ef25ac (sebelum perbaikan ini): 4 dari 6 jadwal
-- `cancelled` masih menyisakan `transactions.status = 'pending'`.
--
-- ── KENAPA TIDAK KETAHUAN LEBIH AWAL ───────────────────────────────────────
--
-- Karena tidak ada yang gagal. Tidak ada exception, tidak ada baris merah di
-- log. Fitur yang melebar dari admin → peneliti WAJIB diaudit policy-nya
-- PER PERAN dan PER PERINTAH (SELECT ≠ UPDATE); membaca kode klien saja tidak
-- akan pernah memperlihatkannya.
--
-- ── ATURANNYA: ARAH YANG DIJAGA, BUKAN KOLOMNYA ────────────────────────────
--
-- Disalin utuh dari sql/92 supaya kedua tabel tidak pernah lagi berbeda
-- pendapat tentang siapa boleh mematikan apa:
--
--   BOLEH   : pending → expired / cancelled   (akibat sah membatalkan jadwal)
--   DITOLAK : menghidupkan kembali tagihan mati
--   DITOLAK : menyatakan lunas (paid/completed/settled) — kuasa uang
--   DITOLAK : menggeser amount / payment_id / schedule_id / form_submission_id
--             / extend_id / entity_type / paid_at
--
-- ⚠️ `payment_status` BUKAN bukti pembayaran (memori proyek): sebagian order
-- dibayar di luar sistem. Karena itu jalur peneliti TIDAK PERNAH boleh menulis
-- status lunas, bahkan untuk barisnya sendiri.
--
-- Idempoten: DROP POLICY IF EXISTS + CREATE, CREATE OR REPLACE FUNCTION.
-- ============================================================================

-- ── 1. Policy UPDATE untuk pemilik ─────────────────────────────────────────
-- Kepemilikan diturunkan lewat `form_submissions`, PERSIS seperti policy
-- SELECT yang sudah ada di tabel ini — supaya tidak lahir definisi
-- "pemilik" kedua yang bisa menyimpang diam-diam.

DROP POLICY IF EXISTS "Peneliti mematikan transaksinya sendiri" ON public.transactions;

CREATE POLICY "Peneliti mematikan transaksinya sendiri"
  ON public.transactions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.form_submissions fs
      WHERE fs.id = transactions.form_submission_id
        AND (
          fs.auth_user_id = auth.uid()
          OR (fs.auth_user_id IS NULL AND fs.email = (auth.jwt() ->> 'email'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.form_submissions fs
      WHERE fs.id = transactions.form_submission_id
        AND (
          fs.auth_user_id = auth.uid()
          OR (fs.auth_user_id IS NULL AND fs.email = (auth.jwt() ->> 'email'))
        )
    )
  );

-- ── 2. Penjaga kolom & arah ────────────────────────────────────────────────
-- ⚠️ Postgres TIDAK punya policy UPDATE per-kolom. Policy di atas membuka
-- BARISNYA; yang membatasi KOLOM & ARAH hanya trigger. Tanpa trigger ini,
-- policy tadi akan memberi peneliti kuasa menulis `status = 'paid'`.

CREATE OR REPLACE FUNCTION public.guard_transaction_columns_for_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  claims    jsonb;
  jwt_role  text;
  jwt_email text;
BEGIN
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  -- Tanpa klaim = bukan permintaan lewat PostgREST (cron, psql, webhook DOKU
  -- lewat service_role, trigger lain). Jalur itu punya aturannya sendiri.
  IF claims IS NULL THEN RETURN NEW; END IF;

  jwt_role  := coalesce(claims ->> 'role', '');
  jwt_email := lower(coalesce(claims ->> 'email', ''));

  IF jwt_role = 'service_role' OR jwt_email = 'product@jakpat.net' THEN
    RETURN NEW;
  END IF;

  /*
    ⚠️ `schedule_id` SENGAJA TIDAK DISAMAKAN dengan yang lain, dan ini bukan
    kelonggaran asal-asalan.

    Tabel ini sudah punya `trg_derive_schedule_id`, yang BERJALAN LEBIH DULU
    (urutan trigger Postgres menurut abjad: trg_derive… < trg_guard…) dan
    MENGISI `schedule_id` ketika kolomnya masih NULL. Terukur 17 Sep: 1 dari
    749 baris memang ber-`schedule_id` NULL.

    Kalau kolom itu dijaga sekaku yang lain, pembatalan atas baris warisan
    semacam itu akan ditolak oleh penjaga kita sendiri — gara-gara tulisan yang
    dilakukan trigger lain, bukan oleh peneliti. Karena itu yang dilarang hanya
    MENGGESER nilai yang sudah ada; mengisi dari NULL dibiarkan.
  */
  IF OLD.schedule_id IS NOT NULL
     AND NEW.schedule_id IS DISTINCT FROM OLD.schedule_id
  THEN
    RAISE EXCEPTION
      'Kolom transaksi ini hanya bisa diubah admin; peneliti hanya boleh mematikan transaksinya sendiri.';
  END IF;

  -- Kolom uang & identitas: TIDAK PERNAH bergeser dari klien peneliti.
  IF NEW.amount              IS DISTINCT FROM OLD.amount
     OR NEW.payment_id         IS DISTINCT FROM OLD.payment_id
     OR NEW.form_submission_id IS DISTINCT FROM OLD.form_submission_id
     OR NEW.extend_id          IS DISTINCT FROM OLD.extend_id
     OR NEW.entity_type        IS DISTINCT FROM OLD.entity_type
     OR NEW.paid_at            IS DISTINCT FROM OLD.paid_at
  THEN
    RAISE EXCEPTION
      'Kolom transaksi ini hanya bisa diubah admin; peneliti hanya boleh mematikan transaksinya sendiri.';
  END IF;

  /*
    `status` dijaga menurut ARAH, sama persis dengan
    `guard_invoice_columns_for_owner()` (sql/92). Satu-satunya perpindahan yang
    sah dari klien peneliti adalah mematikan transaksi yang masih menggantung.

    ⚠️ Menyatakan LUNAS tetap ditolak walau barisnya milik sendiri: uang yang
    sungguh diterima hanya boleh dinyatakan oleh webhook DOKU (service_role)
    atau admin.
  */
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (COALESCE(OLD.status,'') = 'pending'
            AND NEW.status IN ('expired','cancelled')) THEN
      RAISE EXCEPTION
        'Peneliti hanya boleh mematikan transaksi yang masih pending (jadi % → % ditolak).',
        COALESCE(OLD.status,'(null)'), COALESCE(NEW.status,'(null)');
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_transaction_columns_for_owner ON public.transactions;

CREATE TRIGGER trg_guard_transaction_columns_for_owner
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_transaction_columns_for_owner();

COMMENT ON FUNCTION public.guard_transaction_columns_for_owner() IS
  'sql/93 (2026-09-17): pasangan guard_invoice_columns_for_owner (sql/92) untuk '
  'transactions. Lahir dari kambuhan keenam "RLS UPDATE hilang = 0 baris senyap": '
  'transactions nol policy UPDATE pemilik, jadi cancelSchedule() mengenai 0 baris '
  'TANPA error dan meninggalkan transaksi pending selamanya. Arah dijaga: '
  'pending → expired/cancelled BOLEH; menghidupkan kembali & menyatakan lunas TIDAK.';

-- ============================================================================
-- VERIFIKASI (jalankan manual, bungkus dalam transaksi yang di-ROLLBACK)
-- ============================================================================
-- Sebagai peneliti pemilik:
--   pending  → expired      diharapkan BOLEH   (1 baris)
--   pending  → paid         diharapkan DITOLAK (exception)
--   expired  → pending      diharapkan DITOLAK (exception)
--   amount diubah           diharapkan DITOLAK (exception)
-- Sebagai peneliti BUKAN pemilik:
--   apa pun                 diharapkan 0 baris (policy, bukan exception)
-- Sebagai admin / service_role:
--   apa pun                 diharapkan BOLEH
