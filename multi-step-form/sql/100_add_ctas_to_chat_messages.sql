-- Migration 100: Add ctas column to chat_messages
-- Menyimpan Action Buttons (CTAs) yang dihasilkan oleh Agentic Mimin AI
ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS ctas JSONB DEFAULT '[]'::jsonb;
