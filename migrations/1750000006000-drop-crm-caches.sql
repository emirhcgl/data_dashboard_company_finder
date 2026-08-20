-- Up Migration
-- The Twenty CRM cache is gone: `models/twenty.ts` now hits the CRM live on every
-- lookup, so an edit made in Twenty shows up on the next page load. Both cache
-- tables are unreferenced by the app and dropped here.
--
-- `IF EXISTS` keeps this idempotent for environments where the tables were already
-- dropped by hand. Migrations 1750000003000 and 1750000005000 are left in place:
-- applied history is never edited, we only move forward.

DROP TABLE IF EXISTS public.crm_person_cache;
DROP TABLE IF EXISTS public.crm_company_cache;

-- Down Migration
CREATE TABLE IF NOT EXISTS public.crm_person_cache (
  vdma_member_id integer PRIMARY KEY,
  crm_payload    jsonb,
  fetched_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_person_cache_fetched_at_idx
  ON public.crm_person_cache (fetched_at);

CREATE TABLE IF NOT EXISTS public.crm_company_cache (
  domain      text PRIMARY KEY,
  crm_payload jsonb,
  fetched_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_company_cache_fetched_at_idx
  ON public.crm_company_cache (fetched_at);
