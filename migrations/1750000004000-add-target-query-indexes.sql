-- Up Migration
-- Additive only: indexes on the join columns the composed target query uses.
-- No column is added, changed or removed on the shared tables. Every statement is
-- IF NOT EXISTS so it is a no-op when the other app already created an index.

CREATE INDEX IF NOT EXISTS cf_company_profiles_vdma_company_id_idx
  ON public.company_linkedin_profiles (vdma_company_id);

CREATE INDEX IF NOT EXISTS cf_company_technologies_vdma_member_id_idx
  ON public.company_technologies (vdma_member_id);

CREATE INDEX IF NOT EXISTS cf_benchmarking_vdma_company_id_idx
  ON public.company_benchmarking_scores (vdma_company_id);

CREATE INDEX IF NOT EXISTS cf_employees_vdma_member_id_idx
  ON public.employee_linkedin_data (vdma_member_id);

CREATE INDEX IF NOT EXISTS cf_leads_email_lower_idx
  ON public.leads (lower(btrim(email)));

CREATE INDEX IF NOT EXISTS cf_leads_email_domain_idx
  ON public.leads (public.norm_domain(email));

CREATE INDEX IF NOT EXISTS cf_email_conversations_email_lower_idx
  ON public.email_conversations (lower(btrim(email)));

CREATE INDEX IF NOT EXISTS cf_email_conversations_email_domain_idx
  ON public.email_conversations (public.norm_domain(email));

-- Down Migration
DROP INDEX IF EXISTS public.cf_email_conversations_email_domain_idx;
DROP INDEX IF EXISTS public.cf_email_conversations_email_lower_idx;
DROP INDEX IF EXISTS public.cf_leads_email_domain_idx;
DROP INDEX IF EXISTS public.cf_leads_email_lower_idx;
DROP INDEX IF EXISTS public.cf_employees_vdma_member_id_idx;
DROP INDEX IF EXISTS public.cf_benchmarking_vdma_company_id_idx;
DROP INDEX IF EXISTS public.cf_company_technologies_vdma_member_id_idx;
DROP INDEX IF EXISTS public.cf_company_profiles_vdma_company_id_idx;
