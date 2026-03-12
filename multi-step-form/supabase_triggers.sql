-- Function to handle synchronization between scheduled_ads, form_submissions, AND survey_pages
-- This function is triggered whenever a scheduled_ad is inserted, updated, or deleted.

CREATE OR REPLACE FUNCTION handle_scheduled_ad_sync()
RETURNS TRIGGER AS $$
BEGIN
  -- Logic for INSERT or UPDATE
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    -- 1. Sync to form_submissions
    UPDATE form_submissions
    SET 
      start_date = NEW.start_date,
      end_date = NEW.end_date,
      submission_status = CASE
        WHEN NEW.end_date < NOW() THEN 'completed'
        WHEN NEW.start_date <= NOW() AND NEW.end_date >= NOW() THEN 'publishing'
        ELSE 'scheduling'
      END,
      updated_at = NOW()
    WHERE id = NEW.form_submission_id;

    -- 2. Sync to survey_pages (publish dates)
    UPDATE survey_pages
    SET 
      publish_start_date = NEW.start_date,
      publish_end_date = NEW.end_date,
      updated_at = NOW()
    WHERE submission_id = NEW.form_submission_id;
    
    RETURN NEW;

  -- Logic for DELETE: Clear dates when schedule is removed
  ELSIF (TG_OP = 'DELETE') THEN
    -- 1. Clear dates & reset status in form_submissions
    UPDATE form_submissions
    SET 
      start_date = NULL,
      end_date = NULL,
      submission_status = 'scheduling',
      updated_at = NOW()
    WHERE id = OLD.form_submission_id;

    -- 2. Clear publish dates in survey_pages
    UPDATE survey_pages
    SET 
      publish_start_date = NULL,
      publish_end_date = NULL,
      updated_at = NOW()
    WHERE submission_id = OLD.form_submission_id;

    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger (now also fires on DELETE)
DROP TRIGGER IF EXISTS on_scheduled_ad_change ON scheduled_ads;

CREATE TRIGGER on_scheduled_ad_change
AFTER INSERT OR UPDATE OR DELETE ON scheduled_ads
FOR EACH ROW
EXECUTE FUNCTION handle_scheduled_ad_sync();
