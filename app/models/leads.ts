// leads - shared write surface owned by data_dashboard. v1 of this app READS ONLY.

import { getDb, sql } from "../lib/db";
import { env } from "../lib/env";

export const TABLE = env.DB_LEADS_TABLE ?? "leads";

export type LeadRow = {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  current_title: string | null;
  linkedin_url: string | null;
  smartlead_campaign_id: string | null;
  smartlead_lead_id: string | null;
  added_to_smartlead_at: string | Date | null;
  status: string;
  is_email_opened: boolean | null;
  is_email_link_clicked: boolean | null;
  is_study_downloaded: boolean | null;
  created_at: string | Date;
  updated_at: string | Date;
};

export const LEAD_COLUMNS = [
  "id",
  "email",
  "first_name",
  "last_name",
  "company_name",
  "current_title",
  "linkedin_url",
  "smartlead_campaign_id",
  "smartlead_lead_id",
  "added_to_smartlead_at",
  "status",
  "is_email_opened",
  "is_email_link_clicked",
  "is_study_downloaded",
  "created_at",
  "updated_at",
] as const;

export type LeadColumn = (typeof LEAD_COLUMNS)[number];

export type LeadAggregate = {
  lead_count: number;
  lead_status: string | null;
  added_to_smartlead_at: string | Date | null;
  is_email_opened: boolean | null;
  is_email_link_clicked: boolean | null;
  is_study_downloaded: boolean | null;
  lead_emails: string[] | null;
};

// Pre-aggregated lead state. `keyExpr` is either the exact e-mail or the domain,
// so the target query can prefer an exact match and fall back to the domain.
function leadAggregateCte(keyExpr: string): string {
  return `
  SELECT ${keyExpr} AS match_key,
         COUNT(*)::int                                       AS lead_count,
         (array_agg(l.status ORDER BY l.updated_at DESC NULLS LAST))[1] AS lead_status,
         MAX(l.added_to_smartlead_at)                        AS added_to_smartlead_at,
         COALESCE(bool_or(l.is_email_opened), false)         AS is_email_opened,
         COALESCE(bool_or(l.is_email_link_clicked), false)    AS is_email_link_clicked,
         COALESCE(bool_or(l.is_study_downloaded), false)      AS is_study_downloaded,
         array_agg(DISTINCT lower(btrim(l.email)))            AS lead_emails
    FROM ${TABLE} l
   WHERE ${keyExpr} IS NOT NULL
   GROUP BY ${keyExpr}
  `;
}

export const LEADS_BY_EMAIL_CTE = leadAggregateCte("lower(btrim(l.email))");
export const LEADS_BY_DOMAIN_CTE = leadAggregateCte("public.norm_domain(l.email)");

export async function distinctStatuses(): Promise<string[]> {
  const pool = await getDb();

  const result = await pool.request().query<{ value: string }>(
    `SELECT DISTINCT btrim(l.status) AS value
       FROM ${TABLE} l
      WHERE l.status IS NOT NULL AND btrim(l.status) <> ''
      ORDER BY 1;`,
  );

  return result.recordset.map((r) => r.value);
}

export async function findByEmails(emails: string[]): Promise<LeadRow[]> {
  if (emails.length === 0) return [];

  const pool = await getDb();
  const request = pool.request();

  const placeholders = emails
    .map((email, i) => {
      request.input(`email${i}`, sql.NVarChar, email.toLowerCase());
      return `@email${i}`;
    })
    .join(", ");

  const result = await request.query<LeadRow>(
    `SELECT ${LEAD_COLUMNS.join(", ")}
       FROM ${TABLE} l
      WHERE lower(btrim(l.email)) IN (${placeholders});`,
  );

  return result.recordset;
}
