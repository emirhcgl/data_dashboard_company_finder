-- Up Migration
-- Additive: cache for Twenty CRM *people* lookups.
--
-- The CRM's `people` object carries a `vdmamemberid` field, so contacts are matched
-- on the VDMA member id directly instead of on a fuzzy website domain. One cache row
-- per member holds the aggregated enrichment (contact count, OR-ed engagement flags
-- and the top contacts) that we built from the CRM response — never the raw payload.

CREATE TABLE IF NOT EXISTS public.crm_person_cache (
  vdma_member_id integer PRIMARY KEY,
  crm_payload    jsonb,
  fetched_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_person_cache_fetched_at_idx
  ON public.crm_person_cache (fetched_at);

-- Down Migration
DROP TABLE IF EXISTS public.crm_person_cache;
