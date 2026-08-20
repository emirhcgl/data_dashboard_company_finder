// Twenty CRM lookup. EVERY provider-specific quirk lives in this file.
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
//  - every lookup hits the CRM live: there is no cache, so the dashboard always
//    reflects the current state of Twenty.

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
/** Twenty caps `limit` at 200 (verified against the instance). */
const RECORDS_PER_PAGE = 200;
/** Kept well under RECORDS_PER_PAGE so one batch never needs a second page. */
const IDS_PER_REQUEST = 50;
const CONCURRENCY = 2;
const MAX_CONTACTS_PER_MEMBER = 5;
const MAX_PAGES_PER_BATCH = 20;
/** ~9.3k people at 200/page, plus headroom. */
const MAX_PAGES_PER_SCAN = 200;
const MAX_RETRIES = 4;
const RETRY_BASE_MS = 800;

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

// --- transport --------------------------------------------------------------
//
// Twenty rate-limits (~100 requests/minute). A 429 used to be reported as "no
// CRM record", which silently turned a throttled member into "flag = false" and
// dropped it from every CRM-filtered result. So: cap concurrency, and retry a
// 429/5xx with backoff. A request that still fails returns null, and the caller
// MUST propagate that as an error rather than as an empty answer.

type TwentyBody = {
  data?: { people?: TwentyRecord[] } | TwentyRecord[];
  totalCount?: number;
  pageInfo?: { hasNextPage?: boolean; endCursor?: string };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let active = 0;
const waiting: (() => void)[] = [];

/** Lets at most CONCURRENCY requests be in flight across the whole process. */
async function gate<T>(run: () => Promise<T>): Promise<T> {
  if (active >= CONCURRENCY) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }

  active++;

  try {
    return await run();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

async function requestJson(url: string): Promise<TwentyBody | null> {
  for (let attempt = 0; ; attempt++) {
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

      if (response.status === 429 || response.status >= 500) {
        if (attempt >= MAX_RETRIES) {
          console.error(`TWENTY GAVE UP status=${response.status} url=${url}`);
          return null;
        }

        const header = Number(response.headers.get("retry-after"));
        const wait =
          Number.isFinite(header) && header > 0
            ? header * 1000
            : RETRY_BASE_MS * 2 ** attempt;

        await sleep(wait);
        continue;
      }

      if (!response.ok) {
        console.error(`TWENTY REQUEST FAILED status=${response.status}`);
        return null;
      }

      return (await response.json()) as TwentyBody;
    } catch (error) {
      if (attempt >= MAX_RETRIES) {
        console.error("TWENTY REQUEST ERROR", error);
        return null;
      }

      await sleep(RETRY_BASE_MS * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function recordsOf(body: TwentyBody): TwentyRecord[] {
  return Array.isArray(body.data) ? body.data : (body.data?.people ?? []);
}

function peopleUrl(filter: string | null, cursor: string | null): string {
  const baseUrl = env.TWENTY_API_URL!.replace(/\/+$/, "");

  return (
    `${baseUrl}/rest/people?limit=${RECORDS_PER_PAGE}&depth=0` +
    (filter ? `&filter=${encodeURIComponent(filter)}` : "") +
    (cursor ? `&starting_after=${encodeURIComponent(cursor)}` : "")
  );
}

/**
 * Every VDMA member id carried by a person matching `filter` (null = all people).
 * This is how a CRM filter becomes a SQL `IN (...)`: one small scan here replaces
 * enriching the whole company table. `ok: false` means the scan was incomplete —
 * callers must surface that instead of treating the set as authoritative.
 */
export async function memberIdsMatching(
  filter: string | null,
): Promise<{ ids: Set<number>; ok: boolean }> {
  const ids = new Set<number>();

  if (!isTwentyConfigured()) return { ids, ok: false };

  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES_PER_SCAN; page++) {
    const body = await gate(() => requestJson(peopleUrl(filter, cursor)));

    if (!body) return { ids, ok: false };

    for (const record of recordsOf(body)) {
      const memberId = Number(asString(record["vdmamemberid"]));
      if (Number.isInteger(memberId) && memberId > 0) ids.add(memberId);
    }

    if (!body.pageInfo?.hasNextPage || !body.pageInfo.endCursor) break;

    cursor = body.pageInfo.endCursor;
  }

  return { ids, ok: true };
}

/**
 * One request per batch of member ids (Twenty's `[in]` filter), following the
 * cursor while the batch has more pages. Returns null on any failure.
 */
async function fetchBatch(ids: number[]): Promise<TwentyRecord[] | null> {
  const filter = `vdmamemberid[in]:[${ids.join(",")}]`;
  const records: TwentyRecord[] = [];

  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES_PER_BATCH; page++) {
    const body = await gate(() => requestJson(peopleUrl(filter, cursor)));

    if (!body) return null;

    records.push(...recordsOf(body));

    if (!body.pageInfo?.hasNextPage || !body.pageInfo.endCursor) break;

    cursor = body.pageInfo.endCursor;
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

  const baseUrl = recordBaseUrl();
  const batches: number[][] = [];

  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) {
    batches.push(ids.slice(i, i + IDS_PER_REQUEST));
  }

  let errors = 0;

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
      // back empty are kept too: "not in CRM" is a real answer.
      const grouped = new Map<number, TwentyRecord[]>(batch.map((id) => [id, []]));

      for (const record of records) {
        const memberId = Number(asString(record["vdmamemberid"]));
        if (!Number.isInteger(memberId)) continue;

        grouped.get(memberId)?.push(record);
      }

      for (const [id, group] of grouped) {
        byMemberId.set(id, aggregate(group, baseUrl));
      }
    }
  }

  return { available: true, byMemberId, errors };
}
