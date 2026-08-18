// CRM enrichment applied on top of target rows.
//
// The CRM lives behind an HTTP API, so `in_crm` / stage / owner CANNOT be part of
// the SQL query. They are attached after the rows come back, which means CRM
// filters are applied in JavaScript: when one is active the route fetches up to
// CRM_FILTER_SCAN_LIMIT matching rows, enriches them, filters, and then paginates.

import { TargetRow, TargetFilters } from "../models/targets";
import { CrmCompany, lookupByDomains } from "../models/twenty";
import { normalizeDomain } from "./domain";

export const CRM_FILTER_SCAN_LIMIT = 2000;

export type CrmFields = {
  crm_available: boolean;
  in_crm: boolean | null;
  crm: CrmCompany | null;
};

export type EnrichedTargetRow = TargetRow & CrmFields;

export async function enrichRowsWithCrm(
  rows: TargetRow[],
  options: { refresh?: boolean } = {},
): Promise<{ rows: EnrichedTargetRow[]; available: boolean; errors: number }> {
  const lookup = await lookupByDomains(
    rows.map((row) => row.company_domain ?? row.website),
    options,
  );

  const enriched = rows.map((row) => {
    const domain = normalizeDomain(row.company_domain ?? row.website);
    const hit = domain ? lookup.byDomain.get(domain) : undefined;

    return {
      ...row,
      crm_available: lookup.available,
      in_crm: lookup.available && hit ? hit.in_crm : null,
      crm: hit?.company ?? null,
    } satisfies EnrichedTargetRow;
  });

  return { rows: enriched, available: lookup.available, errors: lookup.errors };
}

export function applyCrmFilters(
  rows: EnrichedTargetRow[],
  filters: TargetFilters,
): EnrichedTargetRow[] {
  return rows.filter((row) => {
    if (filters.inCrm !== null && row.in_crm !== filters.inCrm) return false;

    if (filters.crmStages.length) {
      const stage = row.crm?.crm_stage ?? "";
      if (!filters.crmStages.some((s) => s.toLowerCase() === stage.toLowerCase()))
        return false;
    }

    if (filters.crmOwners.length) {
      const owner = row.crm?.crm_owner ?? "";
      if (!filters.crmOwners.some((o) => o.toLowerCase() === owner.toLowerCase()))
        return false;
    }

    return true;
  });
}
