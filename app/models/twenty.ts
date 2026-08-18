// Twenty CRM lookup + cache. EVERY provider-specific quirk lives in this file.
// The assumed CRM schema is documented in docs/TWENTY_SCHEMA.md.
//
// Contract with the rest of the app:
//  - the match key is the normalized website domain (app/lib/domain.ts),
//  - nothing here ever throws: on a missing config, HTTP error or timeout the
//    enrichment is simply absent and `available` is false, so the target list
//    still renders,
//  - results are cached in `crm_company_cache` for TWENTY_CACHE_TTL_HOURS.

import { getDb, sql } from "../lib/db";
import { env, isTwentyConfigured } from "../lib/env";
import { normalizeDomain } from "../lib/domain";

export type CrmCompany = {
  crm_id: string | null;
  crm_name: string | null;
  crm_domain: string | null;
  crm_stage: string | null;
  crm_owner: string | null;
  crm_created_at: string | null;
  crm_last_activity_at: string | null;
  crm_url: string | null;
};

export type CrmEnrichment = {
  in_crm: boolean;
  company: CrmCompany | null;
  fetched_at: string;
};

export type CrmLookupResult = {
  available: boolean;
  byDomain: Map<string, CrmEnrichment>;
  errors: number;
};

const REQUEST_TIMEOUT_MS = 8000;
const CONCURRENCY = 5;

// --- cache -----------------------------------------------------------------

async function readCache(
  domains: string[],
  maxAgeHours: number,
): Promise<Map<string, CrmEnrichment>> {
  const map = new Map<string, CrmEnrichment>();

  if (domains.length === 0) return map;

  const pool = await getDb();
  const request = pool.request().input("maxAge", sql.Float, maxAgeHours);

  const placeholders = domains
    .map((domain, i) => {
      request.input(`d${i}`, sql.NVarChar, domain);
      return `@d${i}`;
    })
    .join(", ");

  const result = await request.query<{
    domain: string;
    crm_payload: CrmEnrichment | null;
    fetched_at: Date;
  }>(
    `SELECT domain, crm_payload, fetched_at
       FROM public.crm_company_cache
      WHERE domain IN (${placeholders})
        AND fetched_at > now() - (@maxAge || ' hours')::interval;`,
  );

  for (const row of result.recordset) {
    if (row.crm_payload) map.set(row.domain, row.crm_payload);
  }

  return map;
}

async function writeCache(
  entries: { domain: string; payload: CrmEnrichment }[],
): Promise<void> {
  if (entries.length === 0) return;

  const pool = await getDb();

  for (const entry of entries) {
    await pool
      .request()
      .input("domain", sql.NVarChar, entry.domain)
      .input("payload", sql.NVarChar, JSON.stringify(entry.payload))
      .query(
        `INSERT INTO public.crm_company_cache (domain, crm_payload, fetched_at)
         VALUES (@domain, @payload::jsonb, now())
         ON CONFLICT (domain) DO UPDATE
            SET crm_payload = EXCLUDED.crm_payload,
                fetched_at  = EXCLUDED.fetched_at;`,
      );
  }
}

// --- provider --------------------------------------------------------------

type TwentyRecord = Record<string, unknown>;

function pickString(record: TwentyRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim() !== "") return value;

    // Twenty composite fields: { primaryLinkUrl }, { name }, { label }
    if (value && typeof value === "object") {
      const nested = value as TwentyRecord;

      for (const nestedKey of ["primaryLinkUrl", "name", "label", "value"]) {
        const nestedValue = nested[nestedKey];
        if (typeof nestedValue === "string" && nestedValue.trim() !== "")
          return nestedValue;
      }

      // { firstName, lastName } (account owner)
      const first = nested["firstName"];
      const last = nested["lastName"];

      if (typeof first === "string" || typeof last === "string") {
        const full = [first, last].filter(Boolean).join(" ").trim();
        if (full !== "") return full;
      }
    }
  }

  return null;
}

function toCrmCompany(record: TwentyRecord, baseUrl: string): CrmCompany {
  const id = pickString(record, "id");

  return {
    crm_id: id,
    crm_name: pickString(record, "name"),
    crm_domain: normalizeDomain(pickString(record, "domainName", "website")),
    crm_stage: pickString(record, "stage", "status", "lifecycleStage"),
    crm_owner: pickString(record, "accountOwner", "owner", "assignee"),
    crm_created_at: pickString(record, "createdAt"),
    crm_last_activity_at: pickString(
      record,
      "lastActivityAt",
      "updatedAt",
      "lastVisitedAt",
    ),
    crm_url: id ? `${baseUrl.replace(/\/+$/, "")}/object/company/${id}` : null,
  };
}

async function fetchDomain(domain: string): Promise<CrmEnrichment | null> {
  const baseUrl = env.TWENTY_API_URL!.replace(/\/+$/, "");
  const url =
    `${baseUrl}/rest/companies` +
    `?filter=domainName.primaryLinkUrl[ilike]:%25${encodeURIComponent(domain)}%25` +
    `&limit=1`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.TWENTY_API_KEY}`,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(
        `TWENTY LOOKUP FAILED domain=${domain} status=${response.status}`,
      );
      return null;
    }

    const body = (await response.json()) as {
      data?: { companies?: TwentyRecord[] } | TwentyRecord[];
    };

    const records = Array.isArray(body.data)
      ? body.data
      : (body.data?.companies ?? []);

    const record = records[0];

    return {
      in_crm: Boolean(record),
      company: record ? toCrmCompany(record, baseUrl) : null,
      fetched_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`TWENTY LOOKUP ERROR domain=${domain}`, error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// --- public API ------------------------------------------------------------

export async function lookupByDomains(
  rawDomains: (string | null | undefined)[],
  options: { refresh?: boolean } = {},
): Promise<CrmLookupResult> {
  const byDomain = new Map<string, CrmEnrichment>();

  if (!isTwentyConfigured()) {
    return { available: false, byDomain, errors: 0 };
  }

  const domains = Array.from(
    new Set(
      rawDomains
        .map((d) => normalizeDomain(d))
        .filter((d): d is string => d !== null),
    ),
  );

  if (domains.length === 0) {
    return { available: true, byDomain, errors: 0 };
  }

  let missing = domains;

  if (!options.refresh) {
    try {
      const cached = await readCache(domains, env.TWENTY_CACHE_TTL_HOURS);
      cached.forEach((value, key) => byDomain.set(key, value));
      missing = domains.filter((d) => !byDomain.has(d));
    } catch (error) {
      console.error("TWENTY CACHE READ ERROR", error);
    }
  }

  let errors = 0;
  const fresh: { domain: string; payload: CrmEnrichment }[] = [];

  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const batch = missing.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      batch.map(async (domain) => ({
        domain,
        payload: await fetchDomain(domain),
      })),
    );

    for (const { domain, payload } of results) {
      if (!payload) {
        errors += 1;
        continue;
      }

      byDomain.set(domain, payload);
      fresh.push({ domain, payload });
    }
  }

  try {
    await writeCache(fresh);
  } catch (error) {
    console.error("TWENTY CACHE WRITE ERROR", error);
  }

  return { available: true, byDomain, errors };
}

/** Stage / owner values seen in the cache, for the CRM filter dropdowns. */
export async function cachedFacets(): Promise<{
  stages: string[];
  owners: string[];
}> {
  if (!isTwentyConfigured()) return { stages: [], owners: [] };

  try {
    const pool = await getDb();

    const result = await pool.request().query<{
      stages: string[] | null;
      owners: string[] | null;
    }>(
      `SELECT array_agg(DISTINCT stage) FILTER (WHERE stage IS NOT NULL) AS stages,
              array_agg(DISTINCT owner) FILTER (WHERE owner IS NOT NULL) AS owners
         FROM (
           SELECT NULLIF(btrim(crm_payload -> 'company' ->> 'crm_stage'), '') AS stage,
                  NULLIF(btrim(crm_payload -> 'company' ->> 'crm_owner'), '') AS owner
             FROM public.crm_company_cache
         ) s;`,
    );

    const row = result.recordset[0];

    return {
      stages: (row?.stages ?? []).sort(),
      owners: (row?.owners ?? []).sort(),
    };
  } catch (error) {
    console.error("TWENTY FACETS ERROR", error);
    return { stages: [], owners: [] };
  }
}
