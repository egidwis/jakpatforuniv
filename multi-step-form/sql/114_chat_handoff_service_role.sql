-- ============================================================================
-- sql/114 — service_role BOLEH MENULIS HANDOFF CHAT
-- ============================================================================
--
-- Tahap 2. Function /api/admin/chat menulis dengan service_role. Trigger
-- sql/108 hanya mengakui email product@jakpat.net, dan JWT service_role
-- tidak punya email, jadi balasan admin akan ditolak dan reply_mode diam-diam
-- dikembalikan.
--
-- Aman dijalankan SEBELUM deploy. Jalur browser Product yang sekarang tetap
-- lolos lewat email. Yang bertambah hanya service_role.
--
-- sql/115 (cabut policy tulis Product) dijalankan NANTI, sesudah function
-- terbukti hidup. Jangan lewat MCP.
-- ============================================================================

-- ── DRY-RUN ────────────────────────────────────────────────────────────────
SELECT pg_get_functiondef('public.guard_chat_handoff()'::regprocedure)
  ILIKE '%service_role%' AS sudah_mengenal_service_role;

-- ── APPLY ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_chat_handoff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor text := lower(coalesce(auth.jwt() ->> 'email', ''));
  jwt_role text := coalesce(auth.jwt() ->> 'role', '');
  is_staff boolean := jwt_role = 'service_role' OR actor = 'product@jakpat.net';
BEGIN
  IF TG_TABLE_NAME = 'chat_messages' THEN
    IF NEW.role = 'admin' AND NOT is_staff THEN
      RAISE EXCEPTION 'only staff may post as admin';
    END IF;
    IF NEW.role = 'admin' AND coalesce(NEW.sender_email, '') = '' THEN
      NEW.sender_email := actor;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'chat_sessions' AND TG_OP = 'UPDATE' THEN
    IF NOT is_staff AND (
      NEW.reply_mode IS DISTINCT FROM OLD.reply_mode
      OR NEW.taken_over_by IS DISTINCT FROM OLD.taken_over_by
      OR NEW.taken_over_at IS DISTINCT FROM OLD.taken_over_at
    ) THEN
      NEW.reply_mode := OLD.reply_mode;
      NEW.taken_over_by := OLD.taken_over_by;
      NEW.taken_over_at := OLD.taken_over_at;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
SELECT pg_get_functiondef('public.guard_chat_handoff()'::regprocedure)
  ILIKE '%service_role%' AS sudah_mengenal_service_role;
-- Harus true.

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- Jalankan ulang fungsi guard_chat_handoff di sql/108_chat_handoff.sql
-- (blok CREATE OR REPLACE FUNCTION, tanpa DROP kolom).
