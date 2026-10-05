-- ============================================================================
-- sql/108 — ADMIN NIMBRUNG DI CHAT MIMIN
-- ============================================================================
--
-- Satu sesi bisa dipegang manusia. reply_mode = 'human' menahan Mimin;
-- 'ai' mengembalikannya. Pesan manusia role = 'admin', terpisah dari
-- user (peneliti) dan assistant (Mimin).
--
-- Hanya email product@jakpat.net yang boleh menyisipkan role admin atau
-- mengubah reply_mode. Peneliti yang meng-update sesi (cuplikan, tag)
-- tidak bisa menggeser mode.
--
-- ============================================================================

-- ── DRY-RUN ────────────────────────────────────────────────────────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'chat_sessions'
  AND column_name IN ('reply_mode', 'taken_over_by', 'taken_over_at');

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'chat_messages'
  AND column_name IN ('role', 'sender_email');
-- reply_mode 0 baris = belum ada, aman diterapkan.

-- ── APPLY ──────────────────────────────────────────────────────────────────
ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS reply_mode TEXT NOT NULL DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS taken_over_by TEXT,
  ADD COLUMN IF NOT EXISTS taken_over_at TIMESTAMPTZ;

ALTER TABLE public.chat_sessions
  DROP CONSTRAINT IF EXISTS chat_sessions_reply_mode_check;

ALTER TABLE public.chat_sessions
  ADD CONSTRAINT chat_sessions_reply_mode_check
  CHECK (reply_mode IN ('ai', 'human'));

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS sender_email TEXT;

-- role bisa text atau enum. Enum dapat nilai 'admin'; text dapat CHECK.
DO $$
DECLARE
  coltype text;
  r record;
BEGIN
  SELECT c.udt_name INTO coltype
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'chat_messages'
    AND c.column_name = 'role';

  IF coltype IS NULL THEN
    RAISE EXCEPTION 'chat_messages.role tidak ditemukan';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = coltype AND typtype = 'e') THEN
    EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', coltype, 'admin');
  ELSE
    FOR r IN
      SELECT con.conname
      FROM pg_constraint con
      WHERE con.conrelid = 'public.chat_messages'::regclass
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) ILIKE '%role%'
    LOOP
      EXECUTE format('ALTER TABLE public.chat_messages DROP CONSTRAINT %I', r.conname);
    END LOOP;

    ALTER TABLE public.chat_messages
      ADD CONSTRAINT chat_messages_role_check
      CHECK (role IN ('user', 'assistant', 'admin'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_chat_handoff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor text := lower(coalesce(auth.jwt() ->> 'email', ''));
  is_staff boolean := actor = 'product@jakpat.net';
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

DROP TRIGGER IF EXISTS trg_guard_chat_message_role ON public.chat_messages;
CREATE TRIGGER trg_guard_chat_message_role
  BEFORE INSERT OR UPDATE ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_chat_handoff();

DROP TRIGGER IF EXISTS trg_guard_chat_session_mode ON public.chat_sessions;
CREATE TRIGGER trg_guard_chat_session_mode
  BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_chat_handoff();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'chat_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'chat_sessions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_sessions;
    END IF;
  END IF;
END $$;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'chat_sessions' AND column_name IN ('reply_mode', 'taken_over_by', 'taken_over_at'))
    OR (table_name = 'chat_messages' AND column_name = 'sender_email')
  )
ORDER BY table_name, column_name;

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS trg_guard_chat_message_role ON public.chat_messages;
-- DROP TRIGGER IF EXISTS trg_guard_chat_session_mode ON public.chat_sessions;
-- DROP FUNCTION IF EXISTS public.guard_chat_handoff();
-- ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_role_check;
-- ALTER TABLE public.chat_messages DROP COLUMN IF EXISTS sender_email;
-- ALTER TABLE public.chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_reply_mode_check;
-- ALTER TABLE public.chat_sessions
--   DROP COLUMN IF EXISTS reply_mode,
--   DROP COLUMN IF EXISTS taken_over_by,
--   DROP COLUMN IF EXISTS taken_over_at;
-- Nilai enum 'admin' (jika role berupa enum) tidak bisa dihapus dengan aman.
