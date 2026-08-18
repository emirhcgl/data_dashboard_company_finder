-- Up Migration
-- Additive: only creates new functions in the `public` schema. No existing table
-- is touched. `norm_domain` mirrors app/lib/domain.ts (normalizeDomain) and both
-- must stay in sync: it is the match key for leads / email_conversations / CRM.

CREATE OR REPLACE FUNCTION public.norm_domain(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;

  v := lower(btrim(raw));

  IF v = '' THEN
    RETURN NULL;
  END IF;

  -- e-mail address -> domain part
  IF position('@' in v) > 0 THEN
    v := split_part(v, '@', 2);
  END IF;

  v := regexp_replace(v, '^[a-z][a-z0-9+.-]*://', '');
  v := split_part(v, '/', 1);
  v := split_part(v, '?', 1);
  v := split_part(v, '#', 1);
  v := split_part(v, ':', 1);
  v := regexp_replace(v, '^(www2?|ww2|m)\.', '');
  v := regexp_replace(v, '\.$', '');

  IF position('.' in v) = 0 OR length(v) < 4 THEN
    RETURN NULL;
  END IF;

  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.region_normalize_city(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;

  v := lower(btrim(raw));

  IF v = '' THEN
    RETURN NULL;
  END IF;

  -- umlauts and their transliterations collapse to one spelling
  v := replace(v, 'ä', 'ae');
  v := replace(v, 'ö', 'oe');
  v := replace(v, 'ü', 'ue');
  v := replace(v, 'ß', 'ss');

  -- drop parenthesised and slash qualifiers: "frankfurt (oder)", "neustadt/aisch"
  v := regexp_replace(v, '\s*\(.*\)\s*', ' ', 'g');
  v := split_part(v, '/', 1);
  v := split_part(v, ',', 1);

  -- drop locality suffixes: "bergisch gladbach bei koeln", "neustadt an der aisch"
  v := regexp_replace(v, '\s+(bei|am|an|im|in|vor|auf|ob|unter|ueber)\s+.*$', '', 'g');
  v := regexp_replace(v, '[^a-z0-9 -]', '', 'g');
  v := regexp_replace(v, '\s+', ' ', 'g');

  RETURN nullif(btrim(v), '');
END;
$$;

CREATE OR REPLACE FUNCTION public.region_normalize_postal(raw text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits text;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;

  -- keep digits only; "D-80331" / "80331 Muenchen" both resolve
  digits := regexp_replace(btrim(raw), '\D', '', 'g');

  IF length(digits) < 4 OR length(digits) > 5 THEN
    RETURN NULL;
  END IF;

  RETURN digits::integer;
END;
$$;

-- Down Migration
DROP FUNCTION IF EXISTS public.region_normalize_postal(text);
DROP FUNCTION IF EXISTS public.region_normalize_city(text);
DROP FUNCTION IF EXISTS public.norm_domain(text);
