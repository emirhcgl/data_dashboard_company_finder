
// employee_linkedin_data - READ ONLY (LinkedIn people scraper).

import { getDb, sql } from "../lib/db";
import { env } from "../lib/env";

export const TABLE = env.DB_EMPLOYEES_TABLE ?? "employee_linkedin_data";

export type EmployeeRow = {
  employee_id: number;
  vdma_member_id: number | null;
  linkedin_url: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  location: string | null;
  current_company: string | null;
  current_title: string | null;
  position_start_year: number | null;
};

export type Contact = {
  full_name: string | null;
  current_title: string | null;
  linkedin_url: string | null;
};

/** One exported employee row: everything the Excel "Employees" sheet needs. */
export type EmployeeExportRow = {
  vdma_member_id: number;
  full_name: string | null;
  current_title: string | null;
  email: string | null;
  is_right_contact: boolean | null;
  linkedin_url: string | null;
  location: string | null;
  current_company: string | null;
  position_start_year: number | null;
  seniority_tier: number;
};

export const EMPLOYEE_SELECT = `
  e."Id"                AS employee_id,
  e.vdma_member_id      AS vdma_member_id,
  e."linkedinUrl"       AS linkedin_url,
  e."fullName"          AS full_name,
  e."firstName"         AS first_name,
  e."lastName"          AS last_name,
  e."location"          AS location,
  e."currentCompany"    AS current_company,
  e."currentTitle"      AS current_title,
  e."positionStartYear" AS position_start_year
`;

// Pre-aggregated employee counts, one row per member (never a correlated subquery).
export const EMPLOYEE_COUNT_CTE = `
  SELECT e.vdma_member_id AS vdma_member_id,
         COUNT(*)::int    AS employee_count,
         COUNT(*) FILTER (
           WHERE NULLIF(btrim(e.email), '') IS NOT NULL
         )::int           AS employee_email_count
    FROM ${TABLE} e
   WHERE e.vdma_member_id IS NOT NULL
   GROUP BY e.vdma_member_id
`;

// Contact ranking: seniority keywords in currentTitle first, then recency.
const SENIORITY_TIERS: { tier: number; keywords: string[] }[] = [
  {
    tier: 1,
    keywords: [
      "ceo",
      "geschäftsführ",
      "geschaeftsfuehr",
      "founder",
      "inhaber",
      "vorstand",
      "owner",
      "managing director",
    ],
  },
  {
    tier: 2,
    keywords: [
      "cto",
      "cmo",
      "cfo",
      "coo",
      "chief",
      "vp ",
      "vice president",
      "prokurist",
    ],
  },
  {
    tier: 3,
    keywords: ["head of", "leiter", "leitung", "director", "direktor"],
  },
  {
    tier: 4,
    keywords: [
      "manager",
      "management",
      "prozessverantwortlich",
      "teamlead",
      "team lead",
    ],
  },
  { tier: 5, keywords: ["marketing", "sales", "vertrieb", "digital"] },
];

const SENIORITY_SQL = `CASE\n${SENIORITY_TIERS.map(
  (t) =>
    `    WHEN ${t.keywords
      .map((k) => `lower(coalesce(e."currentTitle", '')) LIKE '%${k}%'`)
      .join(" OR ")} THEN ${t.tier}`,
).join("\n")}\n    ELSE 99\n  END`;

export function seniorityTier(title: string | null | undefined): number {
  const value = (title ?? "").toLowerCase();

  for (const { tier, keywords } of SENIORITY_TIERS) {
    if (keywords.some((k) => value.includes(k))) return tier;
  }

  return 99;
}

// Top contacts for a set of members, ranked as documented above.
export async function topContactsForMembers(
  memberIds: number[],
  perMember = 3,
): Promise<Map<number, Contact[]>> {
  const map = new Map<number, Contact[]>();

  if (memberIds.length === 0) return map;

  const pool = await getDb();
  const request = pool.request();

  const placeholders = memberIds
    .map((id, i) => {
      request.input(`id${i}`, sql.Int, id);
      return `@id${i}`;
    })
    .join(", ");

  request.input("perMember", sql.Int, perMember);

  const result = await request.query<{
    vdma_member_id: number;
    full_name: string | null;
    current_title: string | null;
    linkedin_url: string | null;
  }>(
    `SELECT vdma_member_id, full_name, current_title, linkedin_url
       FROM (
         SELECT e.vdma_member_id                AS vdma_member_id,
                e."fullName"                    AS full_name,
                e."currentTitle"                AS current_title,
                e."linkedinUrl"                 AS linkedin_url,
                ROW_NUMBER() OVER (
                  PARTITION BY e.vdma_member_id
                  ORDER BY ${SENIORITY_SQL} ASC,
                           e."positionStartYear" DESC NULLS LAST,
                           e."Id" DESC
                ) AS rank
           FROM ${TABLE} e
          WHERE e.vdma_member_id IN (${placeholders})
       ) ranked
      WHERE rank <= @perMember
      ORDER BY vdma_member_id, rank;`,
  );

  for (const row of result.recordset) {
    const list = map.get(row.vdma_member_id) ?? [];
    list.push({
      full_name: row.full_name,
      current_title: row.current_title,
      linkedin_url: row.linkedin_url,
    });
    map.set(row.vdma_member_id, list);
  }

  return map;
}

export async function listByMemberId(
  id: number,
  limit = 50,
): Promise<EmployeeRow[]> {
  const pool = await getDb();

  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .input("limit", sql.Int, limit)
    .query<EmployeeRow>(
      `SELECT ${EMPLOYEE_SELECT}
         FROM ${TABLE} e
        WHERE e.vdma_member_id = @id
        ORDER BY ${SENIORITY_SQL} ASC, e."positionStartYear" DESC NULLS LAST
        LIMIT @limit;`,
    );

  return result.recordset;
}

/**
 * EVERY scraped employee of the given members - not just the top contacts - with
 * the e-mail address when the scraper found one. Used by the export.
 */
export async function employeesForMembers(
  memberIds: number[],
): Promise<EmployeeExportRow[]> {
  if (memberIds.length === 0) return [];

  const pool = await getDb();
  const request = pool.request();

  const placeholders = memberIds
    .map((id, i) => {
      request.input(`id${i}`, sql.Int, id);
      return `@id${i}`;
    })
    .join(", ");

  const result = await request.query<EmployeeExportRow>(
    `SELECT e.vdma_member_id           AS vdma_member_id,
            e."fullName"               AS full_name,
            e."currentTitle"           AS current_title,
            NULLIF(btrim(e.email), '') AS email,
            e."isRightContact"         AS is_right_contact,
            e."linkedinUrl"            AS linkedin_url,
            e."location"               AS location,
            e."currentCompany"         AS current_company,
            e."positionStartYear"      AS position_start_year,
            ${SENIORITY_SQL}           AS seniority_tier
       FROM ${TABLE} e
      WHERE e.vdma_member_id IN (${placeholders})
      ORDER BY e.vdma_member_id,
               ${SENIORITY_SQL} ASC,
               e."positionStartYear" DESC NULLS LAST,
               e."Id" DESC;`,
  );

  return result.recordset;
}
