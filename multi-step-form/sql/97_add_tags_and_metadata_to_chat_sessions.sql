-- Migration 97: Add tags, intent classification, and resolution metadata to chat_sessions
-- For Agentic AI auto-tagging and internal dashboard filtering

ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS tag VARCHAR(50) DEFAULT 'faq',
ADD COLUMN IF NOT EXISTS tag_label VARCHAR(100) DEFAULT 'FAQ Umum',
ADD COLUMN IF NOT EXISTS needs_attention BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_message_snippet TEXT,
ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;

-- Create index for quick filtering in internal-dash
CREATE INDEX IF NOT EXISTS idx_chat_sessions_needs_attention 
ON chat_sessions (needs_attention, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_tag 
ON chat_sessions (tag, last_message_at DESC);

-- Ensure RLS allows read and update for authenticated users / admins
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'chat_sessions' AND policyname = 'Allow authenticated users update chat_sessions'
    ) THEN
        CREATE POLICY "Allow authenticated users update chat_sessions"
        ON chat_sessions FOR UPDATE
        USING (auth.role() = 'authenticated');
    END IF;
END $$;
