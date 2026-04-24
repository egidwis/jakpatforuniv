-- Allow users to update their own form submissions (for reschedule and editing)
DROP POLICY IF EXISTS "Users Update Own Submissions" ON public.form_submissions;
CREATE POLICY "Users Update Own Submissions" ON public.form_submissions
FOR UPDATE TO authenticated
USING ((auth.jwt() ->> 'email') = email)
WITH CHECK ((auth.jwt() ->> 'email') = email);

-- Protect sensitive columns from being manipulated by the user
CREATE OR REPLACE FUNCTION protect_form_submissions()
RETURNS TRIGGER AS $$
BEGIN
  -- If the role is service_role (backend/webhook) or postgres (admin), allow all updates
  IF (current_setting('role', true) = 'service_role' OR current_setting('role', true) = 'postgres') THEN
    RETURN NEW;
  END IF;

  -- Admin user can do anything
  IF (current_setting('request.jwt.claims', true)::json->>'email') = 'product@jakpat.net' THEN
    RETURN NEW;
  END IF;

  -- Block normal users from marking their own payment as paid
  IF NEW.payment_status = 'paid' AND OLD.payment_status != 'paid' THEN
    RAISE EXCEPTION 'Not allowed to mark payment as paid manually. Webhook will do this automatically.';
  END IF;

  -- Block normal users from marking submission status as paid, live, or completed
  IF NEW.submission_status IN ('paid', 'live', 'completed') AND OLD.submission_status NOT IN ('paid', 'live', 'completed') THEN
    RAISE EXCEPTION 'Not allowed to change submission status to % manually', NEW.submission_status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_sensitive_columns_trigger ON public.form_submissions;
CREATE TRIGGER protect_sensitive_columns_trigger
BEFORE UPDATE ON public.form_submissions
FOR EACH ROW
EXECUTE FUNCTION protect_form_submissions();
