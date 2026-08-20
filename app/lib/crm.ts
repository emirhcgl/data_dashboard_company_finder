// CRM enrichment applied on top of target rows.
//
// The CRM lives behind an HTTP API, so `in_crm` and the CRM engagement flags
// CANNOT be part of the SQL query. They are attached after the rows come back,
// which means CRM filters are applied in JavaScript: when one is active the route
// fetches up to CRM_FILTER_SCAN_LIMIT matching rows, enriches them, filters, and
// then paginates.
//
// Matching is exact: CRM contacts carry the VDMA member id (see models/twenty.ts),
// so a whole page of the table costs a single HTTP request.

import { TargetRow, TargetFilters } from "../models/targets";
import { lookupByMemberIds } from "../models/twenty";
import {
  CRM_FLAGS,
  type CrmEnrichment,
  EMPTY_CRM_FLAGS,
} from "../models/crm-flags";

export const CRM_FILTER_SCAN_LIMIT = 2000;

export type CrmFields = {
  crm_available: boolean;
  in_crm: boolean | null;
  crm: CrmEnrichment | null;
};

export type EnrichedTargetRow = TargetRow & CrmFields;

export async function enrichRowsWithCrm(
  rows: TargetRow[],
  options: { refresh?: boolean } = {},
): Promise<{ rows: EnrichedTargetRow[]; available: boolean; errors: number }> {
  const lookup = await lookupByMemberIds(
    rows.map((row) => row.vdma_member_id),
    options,
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

export function applyCrmFilters(
  rows: EnrichedTargetRow[],
  filters: TargetFilters,
): EnrichedTargetRow[] {
  const activeFlags = CRM_FLAGS.filter(
    (f) => filters.crmFlags[f.key] !== undefined,
  );

  return rows.filter((row) => {
    if (filters.inCrm !== null && row.in_crm !== filters.inCrm) return false;

    if (activeFlags.length) {
      // A member with no CRM record has every flag false.
      const flags = row.crm?.flags ?? EMPTY_CRM_FLAGS;

      for (const flag of activeFlags) {
        if (flags[flag.key] !== filters.crmFlags[flag.key]) return false;
      }
    }

    return true;
  });
}
