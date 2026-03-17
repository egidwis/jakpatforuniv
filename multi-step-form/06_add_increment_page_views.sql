CREATE OR REPLACE FUNCTION increment_page_view(page_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE survey_pages
  SET views_count = COALESCE(views_count, 0) + 1
  WHERE id = page_id;
END;
$$;
