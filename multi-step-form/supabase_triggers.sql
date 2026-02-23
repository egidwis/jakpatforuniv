-- Function to handle synchronization between scheduled_ads and form_submissions
-- This function is triggered whenever a scheduled_ad is inserted, updated, or deleted.

CREATE OR REPLACE FUNCTION handle_scheduled_ad_sync()
RETURNS TRIGGER AS $$
BEGIN
  -- Logic for INSERT or UPDATE
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    UPDATE form_submissions
    SET 
      -- Sync start and end dates from the scheduled ad
      start_date = NEW.start_date,
      end_date = NEW.end_date,
      
      -- Determine and update the status based on the current time relative to the schedule
      submission_status = CASE
        -- If the schedule has already ended
        WHEN NEW.end_date < NOW() THEN 'completed'
        
        -- If the schedule is currently active (start <= now <= end)
        WHEN NEW.start_date <= NOW() AND NEW.end_date >= NOW() THEN 'publishing'
        
        -- If the schedule is in the future
        ELSE 'scheduling'
      END,
      
      -- Optional: Sync the ad link if you have a column for it (uncomment if needed)
      -- ad_link = NEW.ad_link, 
      
      updated_at = NOW()
    WHERE id = NEW.form_submission_id;
    
    RETURN NEW;
    
  -- Logic for DELETE (Optional: Reset status or leave as is?)
  -- For now, we might want to set it back to 'paid' or 'in_review' if the schedule is deleted, 
  -- but 'scheduling' is a safe fallback if they are managing ads.
  -- ELSIF (TG_OP = 'DELETE') THEN
  --   UPDATE form_submissions
  --   SET submission_status = 'paid', -- or 'scheduling'
  --       updated_at = NOW()
  --   WHERE id = OLD.form_submission_id;
  --   RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS on_scheduled_ad_change ON scheduled_ads;

CREATE TRIGGER on_scheduled_ad_change
AFTER INSERT OR UPDATE ON scheduled_ads
FOR EACH ROW
EXECUTE FUNCTION handle_scheduled_ad_sync();

-- Optional: Create a scheduled function (CRON) to update statuses daily
-- This is useful to automatically move 'scheduling' -> 'publishing' -> 'completed' 
-- without needing a row update on the table.
-- Note: Requires 'pg_cron' extension which might not be enabled on all Supabase tiers.
-- Alternatively, you can rely on the trigger coupled with an Application-side check or a scheduled Edge Function.

-- For now, the trigger ensures that ANY edit to the schedule immediately corrects the status.
