// UI-side mirror of app/lib/target-filters.ts. The shapes must stay in sync:
// every key here is a query-string parameter parseTargetFilters() understands.

import type { TargetRow } from "@/app/models/targets";
import type { CrmCompany } from "@/app/models/twenty";

export type TriValue = "" | "1" | "0";

export type FilterState = {
  q: string;
  empMin: string;
  empMax: string;
  size: string[];
  country: string[];
  state: string[];
  city: string[];
  industry: string[];
  hasEmployees: TriValue;
  hasEmail: TriValue;
  contacted: TriValue;
  emailSent: TriValue;
  opened: TriValue;
  clicked: TriValue;
  studyDownloaded: TriValue;
  replied: TriValue;
  hotLead: TriValue;
  unsubscribed: TriValue;
  hasBenchmark: TriValue;
  minPerf: string;
  minSeo: string;
  includeBlacklisted: boolean;
  inCrm: TriValue;
  crmStage: string[];
  crmOwner: string[];
};

export const EMPTY_FILTERS: FilterState = {
  q: "",
  empMin: "",
  empMax: "",
  size: [],
  country: [],
  state: [],
  city: [],
  industry: [],
  hasEmployees: "",
  hasEmail: "",
  contacted: "",
  emailSent: "",
  opened: "",
  clicked: "",
  studyDownloaded: "",
  replied: "",
  hotLead: "",
  unsubscribed: "",
  hasBenchmark: "",
  minPerf: "",
  minSeo: "",
  includeBlacklisted: false,
  inCrm: "",
  crmStage: [],
  crmOwner: [],
};

export type FilterOptions = {
  countries: string[];
  cities: string[];
  industries: string[];
  sizes: string[];
  states: { code: string; name: string }[];
  crmAvailable: boolean;
  crmStages: string[];
  crmOwners: string[];
  scoreComponents: { key: string; label: string; weight: number }[];
};

export type ApiTargetRow = TargetRow & {
  crm_available: boolean;
  in_crm: boolean | null;
  crm: CrmCompany | null;
};

export type TargetsResponse = {
  data: ApiTargetRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  dir: string;
  crm_available: boolean;
  crm_errors: number;
  crm_filter_applied_in_memory: boolean;
  scan_truncated?: boolean;
};

export function toSearchParams(
  filters: FilterState,
  extra: Record<string, string | number | undefined> = {},
): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join("|"));
    } else if (typeof value === "boolean") {
      if (value) params.set(key, "1");
    } else if (value !== "") {
      params.set(key, value);
    }
  }

  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }

  return params;
}

export function countActiveFilters(filters: FilterState): number {
  return Object.entries(filters).filter(([, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "boolean") return value;
    return value !== "";
  }).length;
}
