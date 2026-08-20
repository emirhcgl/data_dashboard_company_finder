// CRM enrichment applied on top of target rows.
//
// The CRM lives behind an HTTP API, so `in_crm` and the CRM engagement flags
// CANNOT be part of the SQL query. Two separate mechanisms handle that:
//
//  - DISPLAY: `enrichRowsWithCrm` attaches CRM data to the rows of one page,
//    which costs a single HTTP request.
//  - FILTERING: `resolveCrmMemberIds` asks the CRM which member ids match the
//    active CRM filters and hands them to SQL as an id restriction. Never filter
//    in JavaScript over enriched rows: a rate-limited (429) batch would look like
//    "not in the CRM" and silently drop real matches.
//
// Matching is exact: CRM contacts carry the VDMA member id (see models/twenty.ts),
// so a whole page of the table costs a single HTTP request.

import { TargetRow, TargetFilters } from "../models/targets";
import { lookupByMemberIds, memberIdsMatching } from "../models/twenty";
import { isTwentyConfigured } from "./env";
import { CRM_FLAGS, type CrmEnrichment } from "../models/crm-flags";

export type CrmFields = {
  crm_available: boolean;
  in_crm: boolean | null;
  crm: CrmEnrichment | null;
};

export type EnrichedTargetRow = TargetRow & CrmFields;

export async function enrichRowsWithCrm(
  rows: TargetRow[],
): Promise<{ rows: EnrichedTargetRow[]; available: boolean; errors: number }> {
  const lookup = await lookupByMemberIds(
    rows.map((row) => row.vdma_member_id),
  );

  const enriched = rows.map((row) => {
    const hit = lookup.byMemberId.get(row.vdma_member_id);

    return {
      ...row,
      crm_available: lookup.available,
      in_crm: lookup.available && hit ? hit.in_crm : null,
      crm: hit ?? null,
    } satisfies EnrichedTargetRow;
  });

  return { rows: enriched, available: lookup.available, errors: lookup.errors };
}

/**
 * The member ids the active CRM filters allow, ready for SQL.
 * `include: null` means "every member id" (only exclusions apply).
 * `ok: false` means at least one CRM scan failed — the caller MUST report that
 * instead of serving an incomplete result set.
 */
export type CrmIdRestriction = {
  include: number[] | null;
  exclude: number[];
  ok: boolean;
  /** The filters contradict each other, so no row can ever match. */
  impossible: boolean;
};

/**
 * Turns the CRM filters into an id restriction with one CRM scan per active
 * filter. A member with no CRM record has every flag false, so `flag=false`
 * means "not among the ids where the flag is true".
 */
export async function resolveCrmMemberIds(
  filters: TargetFilters,
): Promise<CrmIdRestriction> {
  const activeFlags = CRM_FLAGS.filter(
    (f) => filters.crmFlags[f.key] !== undefined,
  );

  if (filters.inCrm === null && !activeFlags.length) {
    return { include: null, exclude: [], ok: true, impossible: false };
  }

  if (!isTwentyConfigured()) {
    return { include: null, exclude: [], ok: false, impossible: false };
  }

  const includeSets: Set<number>[] = [];
  const exclude = new Set<number>();
  let ok = true;

  const scan = async (filter: string | null, wanted: boolean) => {
    const result = await memberIdsMatching(filter);

    if (!result.ok) {
      ok = false;
      return;
    }

    if (wanted) includeSets.push(result.ids);
    else for (const id of result.ids) exclude.add(id);
  };

  // Sequential on purpose: models/twenty.ts throttles the requests, and the
  // rare flags resolve in a single page anyway.
  if (filters.inCrm !== null) await scan(null, filters.inCrm);

  for (const flag of activeFlags) {
    await scan(`${flag.field}[eq]:true`, filters.crmFlags[flag.key] === true);
  }

  if (!ok) return { include: null, exclude: [], ok: false, impossible: false };

  let include: number[] | null = null;

  if (includeSets.length) {
    const [first, ...rest] = includeSets;
    const kept = [...first].filter(
      (id) => rest.every((set) => set.has(id)) && !exclude.has(id),
    );

    include = kept;
  }

  return {
    include,
    exclude: include ? [] : [...exclude],
    ok: true,
    impossible: include !== null && include.length === 0,
  };
}
