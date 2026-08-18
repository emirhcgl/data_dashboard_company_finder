// email_conversations - shared write surface owned by data_dashboard.
// v1 of this app READS ONLY.

import { getDb, sql } from "../lib/db";
import { env } from "../lib/env";

export const TABLE = env.DB_EMAILS_TABLE ?? "email_conversations";

export type EmailRow = {
  id: number;
  email: string;
  subject: string | null;
  direction: string | null;
  status: string | null;
  reply_category: string | null;
  is_hot_lead: boolean | null;
  is_unsubscribed: boolean | null;
  received_at: string | Date | null;
  created_at: string | Date | null;
};

export type EmailAggregate = {
  emails_sent: number;
  replies: number;
  last_sent_at: string | Date | null;
  last_received_at: string | Date | null;
  reply_category: string | null;
  is_hot_lead: boolean | null;
  is_unsubscribed: boolean | null;
};

// Pre-aggregated conversation state. Same key strategy as leads: exact e-mail
// first, domain as the lower-confidence fallback.
function emailAggregateCte(keyExpr: string): string {
  return `
  SELECT ${keyExpr} AS match_key,
         COUNT(*) FILTER (WHERE lower(coalesce(c.direction, '')) = 'outbound')::int AS emails_sent,
         COUNT(*) FILTER (WHERE lower(coalesce(c.direction, '')) = 'inbound')::int  AS replies,
         MAX(COALESCE(c.received_at, c.created_at))
           FILTER (WHERE lower(coalesce(c.direction, '')) = 'outbound')             AS last_sent_at,
         MAX(COALESCE(c.received_at, c.created_at))
           FILTER (WHERE lower(coalesce(c.direction, '')) = 'inbound')              AS last_received_at,
         (array_agg(c.reply_category ORDER BY COALESCE(c.received_at, c.created_at) DESC NULLS LAST)
            FILTER (WHERE c.reply_category IS NOT NULL))[1]                         AS reply_category,
         COALESCE(bool_or(c.is_hot_lead), false)                                    AS is_hot_lead,
         COALESCE(bool_or(c.is_unsubscribed), false)                                AS is_unsubscribed
    FROM ${TABLE} c
   WHERE ${keyExpr} IS NOT NULL
   GROUP BY ${keyExpr}
  `;
}

export const EMAILS_BY_EMAIL_CTE = emailAggregateCte("lower(btrim(c.email))");
export const EMAILS_BY_DOMAIN_CTE = emailAggregateCte("public.norm_domain(c.email)");

export async function distinctReplyCategories(): Promise<string[]> {
  const pool = await getDb();

  const result = await pool.request().query<{ value: string }>(
    `SELECT DISTINCT btrim(c.reply_category) AS value
       FROM ${TABLE} c
      WHERE c.reply_category IS NOT NULL AND btrim(c.reply_category) <> ''
      ORDER BY 1;`,
  );

  return result.recordset.map((r) => r.value);
}

export async function listByEmails(
  emails: string[],
  limit = 50,
): Promise<EmailRow[]> {
  if (emails.length === 0) return [];

  const pool = await getDb();
  const request = pool.request();

  const placeholders = emails
    .map((email, i) => {
      request.input(`email${i}`, sql.NVarChar, email.toLowerCase());
      return `@email${i}`;
    })
    .join(", ");

  request.input("limit", sql.Int, limit);

  const result = await request.query<EmailRow>(
    `SELECT c.id, c.email, c.subject, c.direction, c.status, c.reply_category,
            c.is_hot_lead, c.is_unsubscribed, c.received_at, c.created_at
       FROM ${TABLE} c
      WHERE lower(btrim(c.email)) IN (${placeholders})
      ORDER BY COALESCE(c.received_at, c.created_at) DESC NULLS LAST
      LIMIT @limit;`,
  );

  return result.recordset;
}
