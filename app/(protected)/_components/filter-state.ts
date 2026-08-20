// UI-side mirror of app/lib/target-filters.ts. The shapes must stay in sync:
// every key here is a query-string parameter parseTargetFilters() understands.

import type { TargetRow } from "@/app/models/targets";
import {
  CRM_FLAGS,
  type CrmEnrichment,
  type CrmFlagKey,
} from "@/app/models/crm-flags";

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
  hasEmployeeEmail: TriValue;
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
} & Record<CrmFlagParam, TriValue>;

/** `crm_is_contacted`, `crm_is_meeting_booked`, ... */
export type CrmFlagParam = `crm_${CrmFlagKey}`;

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
  hasEmployeeEmail: "",
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
  ...(Object.fromEntries(
    CRM_FLAGS.map((f) => [`crm_${f.key}`, ""]),
  ) as Record<CrmFlagParam, TriValue>),
};

export type FilterOptions = {
  countries: string[];
  cities: string[];
  industries: string[];
  sizes: string[];
  states: { code: string; name: string }[];
  crmAvailable: boolean;
  crmFlags: { key: CrmFlagKey; label: string }[];
  scoreComponents: { key: string; label: string; weight: number }[];
};

export type ApiTargetRow = TargetRow & {
  crm_available: boolean;
  in_crm: boolean | null;
  crm: CrmEnrichment | null;
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
