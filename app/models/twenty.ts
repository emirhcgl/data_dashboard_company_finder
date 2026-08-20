// Twenty CRM lookup + cache. EVERY provider-specific quirk lives in this file.
// The CRM schema this file assumes is documented in docs/TWENTY_SCHEMA.md.
//
// Contract with the rest of the app:
//  - the match key is the VDMA member id: the CRM's `people` object carries a
//    `vdmamemberid` field, which is an exact join key, so no domain guessing,
//  - one CRM record is a *contact*, so a member can have many. The enrichment we
//    expose is the aggregate: contact count, OR-ed engagement flags, top contacts,
//  - nothing here ever throws: on a missing config, HTTP error or timeout the
//    enrichment is simply absent and `available` is false, so the target list
//    still renders,
//  - results are cached in `crm_person_cache` for TWENTY_CACHE_TTL_HOURS.

import { getDb, sql } from "../lib/db";
import { env, isTwentyConfigured } from "../lib/env";
import {
  CRM_FLAGS,
  type CrmContact,
  type CrmEnrichment,
  type CrmFlags,
} from "./crm-flags";

export {
  CRM_FLAGS,
  EMPTY_CRM_FLAGS,
  type CrmFlagKey,
  type CrmFlags,
  type CrmContact,
  type CrmEnrichment,
} from "./crm-flags";
export type CrmLookupResult = {
  available: boolean;
  byMemberId: Map<number, CrmEnrichment>;
  errors: number;
};

const REQUEST_TIMEOUT_MS = 12000;
/** Twenty caps `limit` at 60, and the same cap applies to an `[in]` filter. */
const IDS_PER_REQUEST = 50;
const RECORDS_PER_PAGE = 60;
const CONCURRENCY = 3;
const MAX_CONTACTS_PER_MEMBER = 5;
const MAX_PAGES_PER_BATCH = 20;


// --- cache -----------------------------------------------------------------

async function readCache(
  ids: number[],
  maxAgeHours: number,
): Promise<Map<number, CrmEnrichment>> {
  const map = new Map<number, CrmEnrichment>();

  if (ids.length === 0) return map;

  const pool = await getDb();
  const request = pool.request().input("maxAge", sql.Float, maxAgeHours);

  const placeholders = ids
    .map((id, i) => {
      request.input(`m${i}`, sql.Int, id);
      return `@m${i}`;
    })
    .join(", ");

  const result = await request.query<{
    vdma_member_id: number;
    crm_payload: CrmEnrichment | null;
  }>(
    `SELECT vdma_member_id, crm_payload
       FROM public.crm_person_cache
      WHERE vdma_member_id IN (${placeholders})
        AND fetched_at > now() - (@maxAge || ' hours')::interval;`,
  );

  for (const row of result.recordset) {
    if (row.crm_payload) map.set(Number(row.vdma_member_id), row.crm_payload);
  }

  return map;
}

async function writeCache(
  entries: { id: number; payload: CrmEnrichment }[],
): Promise<void> {
  if (entries.length === 0) return;

  const pool = await getDb();

  for (const entry of entries) {
    await pool
      .request()
      .input("id", sql.Int, entry.id)
      .input("payload", sql.NVarChar, JSON.stringify(entry.payload))
      .query(
        `INSERT INTO public.crm_person_cache (vdma_member_id, crm_payload, fetched_at)
         VALUES (@id, @payload::jsonb, now())
         ON CONFLICT (vdma_member_id) DO UPDATE
            SET crm_payload = EXCLUDED.crm_payload,
                fetched_at  = EXCLUDED.fetched_at;`,
      );
  }
}

// --- provider --------------------------------------------------------------

type TwentyRecord = Record<string, unknown>;

/** Twenty stores several of these columns as free text ("True", "FALSE", ""). */
function asBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes";
  }

  return false;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    // The importer wrote literal "NULL" strings into several text columns.
    if (trimmed === "" || trimmed.toUpperCase() === "NULL") return null;
    return trimmed;
  }

  if (typeof value === "number") return String(value);

  return null;
}

/** Twenty composite fields: { primaryLinkUrl }, { primaryEmail }, { firstName } */
function fromComposite(record: TwentyRecord, key: string): string | null {
  const value = record[key];

  if (typeof value === "string") return asString(value);

  if (value && typeof value === "object") {
    const nested = value as TwentyRecord;

    for (const nestedKey of [
      "primaryEmail",
      "primaryLinkUrl",
      "primaryPhoneNumber",
      "name",
      "label",
      "value",
    ]) {
      const found = asString(nested[nestedKey]);
      if (found) return found;
    }

    const full = [asString(nested["firstName"]), asString(nested["lastName"])]
      .filter(Boolean)
      .join(" ")
      .trim();

    if (full !== "") return full;
  }

  return null;
}

/** The UI host records are linked to (see env.TWENTY_APP_URL). */
function recordBaseUrl(): string {
  const explicit = env.TWENTY_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  return env
    .TWENTY_API_URL!.replace(/\/+$/, "")
    .replace(/:\/\/api\./, "://app.");
}

function toContact(record: TwentyRecord, baseUrl: string): CrmContact {
  const id = asString(record["id"]);

  const fullName =
    fromComposite(record, "name") ??
    [asString(record["firstname"]), asString(record["lastname"])]
      .filter(Boolean)
      .join(" ")
      .trim() ??
    null;

  const flags = Object.fromEntries(
    CRM_FLAGS.map((f) => [f.key, asBool(record[f.field])]),
  ) as CrmFlags;

  return {
    crm_id: id,
    crm_url: id ? `${baseUrl}/object/person/${id}` : null,
    full_name: fullName === "" ? null : fullName,
    current_title:
      asString(record["currenttitle"]) ?? asString(record["jobTitle"]),
    current_company: asString(record["currentcompany"]),
    email: fromComposite(record, "emails") ?? asString(record["email"]),
    linkedin_url:
      asString(record["linkedinurl"]) ??
      fromComposite(record, "linkedinLink"),
    location: asString(record["location"]) ?? asString(record["city"]),
    is_right_contact: record["isrightcontact"] === undefined
      ? null
      : asBool(record["isrightcontact"]),
    created_at: asString(record["createdAt"]),
    updated_at: asString(record["updatedAt"]),
    ...flags,
  };
}

/** Engaged contacts first, then the ones flagged as the right contact. */
function contactRank(contact: CrmContact): number {
  const engagement = CRM_FLAGS.reduce(
    (sum, f) => sum + (contact[f.key] ? 1 : 0),
    0,
  );

  return engagement * 2 + (contact.is_right_contact ? 1 : 0);
}

function aggregate(records: TwentyRecord[], baseUrl: string): CrmEnrichment {
  const contacts = records
    .map((record) => toContact(record, baseUrl))
    .sort((a, b) => contactRank(b) - contactRank(a));

  const flags = Object.fromEntries(
    CRM_FLAGS.map((f) => [f.key, contacts.some((c) => c[f.key])]),
  ) as CrmFlags;

  const updates = contacts
    .map((c) => c.updated_at)
    .filter((v): v is string => Boolean(v))
    .sort();

  return {
    in_crm: contacts.length > 0,
    contact_count: contacts.length,
    flags,
    contacts: contacts.slice(0, MAX_CONTACTS_PER_MEMBER),
    vdma_company_name:
      records.map((r) => asString(r["vdmacompanyname"])).find(Boolean) ?? null,
    last_update: updates.length ? updates[updates.length - 1] : null,
    fetched_at: new Date().toISOString(),
  };
}

/**
 * One request per batch of member ids (Twenty's `[in]` filter), following the
 * cursor while the batch has more pages. Returns null on any failure.
 */
async function fetchBatch(ids: number[]): Promise<TwentyRecord[] | null> {
  const baseUrl = env.TWENTY_API_URL!.replace(/\/+$/, "");
  const filter = `vdmamemberid[in]:[${ids.join(",")}]`;
  const records: TwentyRecord[] = [];

  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES_PER_BATCH; page++) {
    const url =
      `${baseUrl}/rest/people` +
      `?filter=${encodeURIComponent(filter)}` +
      `&limit=${RECORDS_PER_PAGE}&depth=0` +
      (cursor ? `&starting_after=${encodeURIComponent(cursor)}` : "");

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
          `TWENTY PEOPLE LOOKUP FAILED ids=${ids.length} status=${response.status}`,
        );
        return null;
      }

      const body = (await response.json()) as {
        data?: { people?: TwentyRecord[] } | TwentyRecord[];
        pageInfo?: { hasNextPage?: boolean; endCursor?: string };
      };

      const batch = Array.isArray(body.data)
        ? body.data
        : (body.data?.people ?? []);

      records.push(...batch);

      if (!body.pageInfo?.hasNextPage || !body.pageInfo.endCursor) break;

      cursor = body.pageInfo.endCursor;
    } catch (error) {
      console.error(`TWENTY PEOPLE LOOKUP ERROR ids=${ids.length}`, error);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  return records;
}

// --- public API ------------------------------------------------------------

/**
 * Aggregated CRM enrichment for the given VDMA member ids. Never throws; when the
 * CRM is not configured the result is `{ available: false }` and callers render
 * the target list unchanged.
 */
export async function lookupByMemberIds(
  rawIds: (number | null | undefined)[],
  options: { refresh?: boolean } = {},
): Promise<CrmLookupResult> {
  const byMemberId = new Map<number, CrmEnrichment>();

  if (!isTwentyConfigured()) {
    return { available: false, byMemberId, errors: 0 };
  }

  const ids = Array.from(
    new Set(
      rawIds
        .map((id) => Number(id))
        .filter((id): id is number => Number.isInteger(id) && id > 0),
    ),
  );

  if (ids.length === 0) {
    return { available: true, byMemberId, errors: 0 };
  }

  let missing = ids;

  if (!options.refresh) {
    try {
      const cached = await readCache(ids, env.TWENTY_CACHE_TTL_HOURS);
      cached.forEach((value, key) => byMemberId.set(key, value));
      missing = ids.filter((id) => !byMemberId.has(id));
    } catch (error) {
      console.error("TWENTY CACHE READ ERROR", error);
    }
  }

  const baseUrl = recordBaseUrl();
  const batches: number[][] = [];

  for (let i = 0; i < missing.length; i += IDS_PER_REQUEST) {
    batches.push(missing.slice(i, i + IDS_PER_REQUEST));
  }

  let errors = 0;
  const fresh: { id: number; payload: CrmEnrichment }[] = [];

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const slice = batches.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      slice.map(async (batch) => ({
        batch,
        records: await fetchBatch(batch),
      })),
    );

    for (const { batch, records } of results) {
      if (records === null) {
        errors += batch.length;
        continue;
      }

      // Group the contacts of the batch back onto their member id. Ids that came
      // back empty are cached too: "not in CRM" is a real, cacheable answer.
      const grouped = new Map<number, TwentyRecord[]>(batch.map((id) => [id, []]));

      for (const record of records) {
        const memberId = Number(asString(record["vdmamemberid"]));
        if (!Number.isInteger(memberId)) continue;

        grouped.get(memberId)?.push(record);
      }

      for (const [id, group] of grouped) {
        const payload = aggregate(group, baseUrl);
        byMemberId.set(id, payload);
        fresh.push({ id, payload });
      }
    }
  }

  try {
    await writeCache(fresh);
  } catch (error) {
    console.error("TWENTY CACHE WRITE ERROR", error);
  }

  return { available: true, byMemberId, errors };
}

/** How much of the CRM cache is populated — shown next to the CRM filters. */
export async function cacheStats(): Promise<{
  members_cached: number;
  members_in_crm: number;
}> {
  if (!isTwentyConfigured()) return { members_cached: 0, members_in_crm: 0 };

  try {
    const pool = await getDb();

    const result = await pool.request().query<{
      members_cached: number;
      members_in_crm: number;
    }>(
      `SELECT count(*)::int AS members_cached,
              count(*) FILTER (
                WHERE (crm_payload ->> 'in_crm')::boolean
              )::int AS members_in_crm
         FROM public.crm_person_cache;`,
    );

    const row = result.recordset[0];

    return {
      members_cached: Number(row?.members_cached ?? 0),
      members_in_crm: Number(row?.members_in_crm ?? 0),
    };
  } catch (error) {
    console.error("TWENTY CACHE STATS ERROR", error);
    return { members_cached: 0, members_in_crm: 0 };
  }
}
