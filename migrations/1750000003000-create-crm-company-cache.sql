-- Up Migration
-- Additive: cache for Twenty CRM lookups. Keyed on the normalized website domain
-- (the CRM match key). `crm_payload` holds the typed enrichment object we built
-- from the CRM response, never the raw provider payload verbatim.

CREATE TABLE IF NOT EXISTS public.crm_company_cache (
  domain      text PRIMARY KEY,
  crm_payload jsonb,
  fetched_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_company_cache_fetched_at_idx
  ON public.crm_company_cache (fetched_at);

-- Down Migration
DROP TABLE IF EXISTS public.crm_company_cache;
