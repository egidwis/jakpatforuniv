-- ============================================================================
-- 92. Perbaikan sql/91 — pemilik boleh MEMATIKAN tagihannya, bukan menghidupkan
-- ============================================================================
--
-- ⚠️ REGRESI YANG DITUTUP DI SINI, dan ia lahir dari sql/91 kemarin malam.
--
-- `guard_invoice_columns_for_owner()` mengunci `status` secara total untuk
-- non-admin. Itu terlalu lebar: `cancelSchedule()` — jalur pembatalan jadwal
-- milik PENELITI — memang menulis `invoices.status = 'expired'` (supabase.ts,
-- blok "invoices IKUT DIMATIKAN"). Satu tagihan hidup di DUA tabel; kalau
-- `transactions` mati tapi `invoices` tidak, tagihan hantu itu persis yang blok
-- tersebut ada untuk menutup.
--
-- Akibatnya di layar peneliti:
--
--     "Kolom tagihan ini hanya bisa diubah admin; peneliti hanya boleh
--      mencatat doku_cancel_last_error."
--
-- Pembatalan jadwal jadi GAGAL TOTAL — lebih buruk daripada keadaan sebelum
-- sql/91, ketika ia setidaknya berhasil separuh.
--
-- ⚠️ KENAPA AKU MELEWATKANNYA: saat menulis sql/91 aku memeriksa jalur peneliti
-- dan menyimpulkan ia "hanya perlu doku_cancel_last_error". Pemeriksaan itu
-- berhenti di `killDokuLinksForSchedule()` dan tidak menelusuri `cancelSchedule()`
-- sampai ujung, tempat `invoices` ikut dimatikan.
--
-- ── ATURAN BARUNYA: ARAHNYA YANG DIJAGA, BUKAN KOLOMNYA ────────────────────
--
-- Pemilik boleh MEMATIKAN tagihannya sendiri (`pending` → `expired`/`cancelled`)
-- karena itu konsekuensi sah dari membatalkan jadwalnya. Yang tetap DITOLAK:
--
--   * menghidupkan kembali tagihan mati (`expired`/`cancelled` → `pending`);
--   * menyatakan LUNAS (`status` → `paid`/`completed`) — kuasa uang;
--   * menyentuh `amount`, `paid_at`, `doku_cancelled_at`, `payment_id`,
--     `schedule_id`, `form_submission_id`, `expires_at`.
--
-- `doku_cancelled_at` tetap terkunci DAN itu disengaja: ia pernyataan "DOKU
-- mengonfirmasi link ini mati", dan yang berhak menyatakannya hanya jawaban
-- DOKU lewat jalur admin/service_role — bukan klien peneliti.
--
-- Idempoten: CREATE OR REPLACE, trigger-nya tidak perlu dipasang ulang.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_invoice_columns_for_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  claims jsonb;
  jwt_role  text;
  jwt_email text;
BEGIN
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  -- Tanpa klaim = bukan permintaan lewat PostgREST (cron, psql, trigger lain).
  IF claims IS NULL THEN RETURN NEW; END IF;

  jwt_role  := coalesce(claims ->> 'role', '');
  jwt_email := lower(coalesce(claims ->> 'email', ''));

  IF jwt_role = 'service_role' OR jwt_email = 'product@jakpat.net' THEN
    RETURN NEW;
  END IF;

  -- Kolom uang & identitas: TIDAK PERNAH boleh bergeser dari klien peneliti.
  IF NEW.amount             IS DISTINCT FROM OLD.amount
     OR NEW.paid_at           IS DISTINCT FROM OLD.paid_at
     OR NEW.doku_cancelled_at IS DISTINCT FROM OLD.doku_cancelled_at
     OR NEW.payment_id        IS DISTINCT FROM OLD.payment_id
     OR NEW.schedule_id       IS DISTINCT FROM OLD.schedule_id
     OR NEW.form_submission_id IS DISTINCT FROM OLD.form_submission_id
     OR NEW.expires_at        IS DISTINCT FROM OLD.expires_at
  THEN
    RAISE EXCEPTION 'Kolom tagihan ini hanya bisa diubah admin; peneliti hanya boleh mencatat doku_cancel_last_error atau mematikan tagihannya sendiri.';
  END IF;

  /*
    `status` dijaga menurut ARAH, bukan diblokir seluruhnya.

    Satu-satunya perpindahan yang sah dari klien peneliti adalah mematikan
    tagihan yang masih menggantung — konsekuensi langsung dari membatalkan
    jadwalnya sendiri. Segala arah lain (menghidupkan kembali, apalagi
    menyatakan lunas) adalah kuasa uang dan tetap milik admin.
  */
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (COALESCE(OLD.status,'') = 'pending'
            AND NEW.status IN ('expired','cancelled')) THEN
      RAISE EXCEPTION
        'Peneliti hanya boleh mematikan tagihan yang masih pending (jadi % → % ditolak).',
        COALESCE(OLD.status,'(null)'), COALESCE(NEW.status,'(null)');
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.guard_invoice_columns_for_owner() IS
  'sql/92 (2026-09-17): memperbaiki sql/91 yang mengunci invoices.status total dan '
  'karena itu mematahkan pembatalan jadwal oleh peneliti (cancelSchedule menulis '
  'status=expired). Sekarang arahnya yang dijaga: pending → expired/cancelled BOLEH, '
  'menghidupkan kembali & menyatakan lunas TIDAK. Kolom uang tetap terkunci penuh.';

-- ============================================================================
-- VERIFIKASI (jalankan manual; bungkus dalam transaksi yang di-ROLLBACK)
-- ============================================================================
-- peneliti: pending  → expired    diharapkan BOLEH
-- peneliti: pending  → paid       diharapkan DITOLAK
-- peneliti: expired  → pending    diharapkan DITOLAK
-- peneliti: amount   diubah       diharapkan DITOLAK
-- admin    : apa pun              diharapkan BOLEH
-- service  : apa pun              diharapkan BOLEH
