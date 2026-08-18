// vdma_members - READ ONLY (owned by the scraping pipeline).

import { getDb, sql } from "../lib/db";
import { env } from "../lib/env";

export const TABLE = env.DB_TABLE ?? "vdma_members";

export type MemberRow = {
  vdma_member_id: number;
  title: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  created_at: string | Date | null;
  is_in_blacklist: number | null;
};

// snake_case aliases for the PascalCase source columns.
export const MEMBER_SELECT = `
  m."VdmaMemberId"   AS vdma_member_id,
  m."Title"          AS title,
  m."Name"           AS name,
  m."Email"          AS email,
  m."Phone"          AS phone,
  m."Website"        AS website,
  m."Address"        AS address,
  m."PostalCode"     AS postal_code,
  m."City"           AS city,
  m."Country"        AS country,
  m."CreatedAt"      AS created_at,
  COALESCE(m.is_in_blacklist, 0) AS is_in_blacklist
`;

export const MEMBER_SORTABLE_COLUMNS = [
  "vdma_member_id",
  "title",
  "name",
  "email",
  "city",
  "country",
  "postal_code",
  "created_at",
] as const;

export type MemberSortableColumn = (typeof MEMBER_SORTABLE_COLUMNS)[number];

export async function findById(id: number): Promise<MemberRow | null> {
  const pool = await getDb();

  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .query<MemberRow>(
      `SELECT ${MEMBER_SELECT} FROM ${TABLE} m WHERE m."VdmaMemberId" = @id LIMIT 1;`,
    );

  return result.recordset[0] ?? null;
}

export async function distinctCountries(): Promise<string[]> {
  const pool = await getDb();

  const result = await pool.request().query<{ value: string }>(
    `SELECT DISTINCT btrim(m."Country") AS value
       FROM ${TABLE} m
      WHERE m."Country" IS NOT NULL AND btrim(m."Country") <> ''
      ORDER BY 1;`,
  );

  return result.recordset.map((r) => r.value);
}

export async function distinctCities(limit = 2000): Promise<string[]> {
  const pool = await getDb();

  const result = await pool
    .request()
    .input("limit", sql.Int, limit)
    .query<{ value: string }>(
      `SELECT DISTINCT btrim(m."City") AS value
         FROM ${TABLE} m
        WHERE m."City" IS NOT NULL AND btrim(m."City") <> ''
        ORDER BY 1
        LIMIT @limit;`,
    );

  return result.recordset.map((r) => r.value);
}
