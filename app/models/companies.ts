// company_linkedin_profiles - READ ONLY (LinkedIn enrichment pipeline).

import { getDb, sql } from "../lib/db";
import { env } from "../lib/env";

export const TABLE = env.DB_COMPANIES_TABLE ?? "company_linkedin_profiles";

export type CompanyRow = {
  company_profile_id: number;
  vdma_company_id: number | null;
  linkedin_company_name: string | null;
  linkedin_followers_count: string | null;
  linkedin_url: string | null;
  vdma_name: string | null;
  industry: string | null;
  website: string | null;
  company_size_approx: string | null;
  headquarters: string | null;
};

export const COMPANY_SELECT = `
  c."Id"                     AS company_profile_id,
  c.vdma_company_id          AS vdma_company_id,
  c.linkedin_company_name    AS linkedin_company_name,
  c.linkedin_followers_count AS linkedin_followers_count,
  c.linkedin_url             AS linkedin_url,
  c.vdma_name                AS vdma_name,
  c.industry                 AS industry,
  c.website                  AS website,
  c.company_size_approx      AS company_size_approx,
  c.headquarters             AS headquarters
`;

// One profile per member: newest row wins.
export const COMPANY_LATEST_CTE = `
  SELECT DISTINCT ON (c.vdma_company_id) ${COMPANY_SELECT}
    FROM ${TABLE} c
   WHERE c.vdma_company_id IS NOT NULL
   ORDER BY c.vdma_company_id, c."Id" DESC
`;

// LinkedIn size buckets, in ascending order. Used for the `size` filter and to
// map a bucket string onto a numeric range.
export const SIZE_BUCKETS = [
  { value: "0-1", min: 0, max: 1 },
  { value: "2-10", min: 2, max: 10 },
  { value: "11-50", min: 11, max: 50 },
  { value: "51-200", min: 51, max: 200 },
  { value: "201-500", min: 201, max: 500 },
  { value: "501-1,000", min: 501, max: 1000 },
  { value: "1,001-5,000", min: 1001, max: 5000 },
  { value: "5,001-10,000", min: 5001, max: 10000 },
  { value: "10,001+", min: 10001, max: null },
] as const;

export type SizeBucket = (typeof SIZE_BUCKETS)[number]["value"];

export function parseSizeBucket(
  raw: string | null | undefined,
): { min: number; max: number | null } | null {
  if (!raw) return null;

  const normalized = raw.trim();
  const known = SIZE_BUCKETS.find((b) => b.value === normalized);

  if (known) return { min: known.min, max: known.max };

  // "51-200 employees" / "10,001+ employees" and similar free text
  const digits = normalized.replace(/,/g, "");
  const range = digits.match(/(\d+)\s*[-–]\s*(\d+)/);

  if (range) return { min: Number(range[1]), max: Number(range[2]) };

  const open = digits.match(/(\d+)\s*\+/);

  if (open) return { min: Number(open[1]), max: null };

  return null;
}

export function parseFollowers(raw: string | null | undefined): number | null {
  if (!raw) return null;

  const digits = String(raw).replace(/[^\d]/g, "");

  return digits === "" ? null : Number(digits);
}

export async function distinctIndustries(): Promise<string[]> {
  const pool = await getDb();

  const result = await pool.request().query<{ value: string }>(
    `SELECT DISTINCT btrim(c.industry) AS value
       FROM ${TABLE} c
      WHERE c.industry IS NOT NULL AND btrim(c.industry) <> ''
      ORDER BY 1;`,
  );

  return result.recordset.map((r) => r.value);
}

export async function distinctSizes(): Promise<string[]> {
  const pool = await getDb();

  const result = await pool.request().query<{ value: string }>(
    `SELECT DISTINCT btrim(c.company_size_approx) AS value
       FROM ${TABLE} c
      WHERE c.company_size_approx IS NOT NULL
        AND btrim(c.company_size_approx) <> ''
      ORDER BY 1;`,
  );

  return result.recordset.map((r) => r.value);
}

export async function findByMemberId(id: number): Promise<CompanyRow | null> {
  const pool = await getDb();

  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .query<CompanyRow>(
      `SELECT ${COMPANY_SELECT}
         FROM ${TABLE} c
        WHERE c.vdma_company_id = @id
        ORDER BY c."Id" DESC
        LIMIT 1;`,
    );

  return result.recordset[0] ?? null;
}
