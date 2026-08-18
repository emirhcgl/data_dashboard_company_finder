// City/postal-code -> state (Bundesland) mapping.
//
// The data and the resolution logic live in SQL (see
// migrations/*-create-region-tables.sql and *-seed-region-cities.sql) so `state`
// can be filtered, sorted and paginated by the database. This module owns the
// canonical state list for UI labels and the SQL expression the target query uses.

import { getDb, sql } from "../lib/db";

export const STATES = [
  { code: "BW", name: "Baden-Württemberg" },
  { code: "BY", name: "Bayern" },
  { code: "BE", name: "Berlin" },
  { code: "BB", name: "Brandenburg" },
  { code: "HB", name: "Bremen" },
  { code: "HH", name: "Hamburg" },
  { code: "HE", name: "Hessen" },
  { code: "MV", name: "Mecklenburg-Vorpommern" },
  { code: "NI", name: "Niedersachsen" },
  { code: "NW", name: "Nordrhein-Westfalen" },
  { code: "RP", name: "Rheinland-Pfalz" },
  { code: "SL", name: "Saarland" },
  { code: "SN", name: "Sachsen" },
  { code: "ST", name: "Sachsen-Anhalt" },
  { code: "SH", name: "Schleswig-Holstein" },
  { code: "TH", name: "Thüringen" },
] as const;

export type StateCode = (typeof STATES)[number]["code"];

export const STATE_CODES = STATES.map((s) => s.code) as readonly string[];

export const UNKNOWN_STATE_LABEL = "Unknown";

export function stateName(code: string | null | undefined): string {
  if (!code) return UNKNOWN_STATE_LABEL;

  return STATES.find((s) => s.code === code)?.name ?? code;
}

export function isStateCode(value: string): value is StateCode {
  return STATE_CODES.includes(value);
}

// Resolved against the member alias `m` and the company alias `c` of the target
// query: city + postal code from vdma_members, headquarters from LinkedIn.
export const STATE_CODE_EXPR = `public.resolve_state_code(
  m."Country", m."City", m."PostalCode", c.headquarters
)`;

// Country of Germany check, used to decide whether the state filter applies.
export const IS_GERMANY_EXPR = `public.region_is_germany(m."Country")`;

export async function resolveState(
  country: string | null,
  city: string | null,
  postalCode: string | null,
  headquarters: string | null = null,
): Promise<{ code: string | null; name: string }> {
  const pool = await getDb();

  const result = await pool
    .request()
    .input("country", sql.NVarChar, country)
    .input("city", sql.NVarChar, city)
    .input("postal", sql.NVarChar, postalCode)
    .input("hq", sql.NVarChar, headquarters)
    .query<{ code: string | null }>(
      `SELECT public.resolve_state_code(@country, @city, @postal, @hq) AS code;`,
    );

  const code = result.recordset[0]?.code ?? null;

  return { code, name: stateName(code) };
}
