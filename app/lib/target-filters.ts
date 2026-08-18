// ONE parser for the target-list query string, shared by /api/targets,
// /api/targets/export and the UI's link building. Add a filter here and both the
// table and the export get it.

import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  MAX_PAGE_SIZE,
  TargetFilters,
  TriState,
  isTargetSortColumn,
} from "../models/targets";

function list(params: URLSearchParams, name: string): string[] {
  return params
    .getAll(name)
    .flatMap((value) => value.split("|"))
    .map((value) => value.trim())
    .filter(Boolean);
}

function tri(params: URLSearchParams, name: string): TriState {
  const raw = (params.get(name) ?? "").trim().toLowerCase();

  if (raw === "" || raw === "any" || raw === "all") return null;
  if (["1", "true", "yes", "y"].includes(raw)) return true;
  if (["0", "false", "no", "n"].includes(raw)) return false;

  return null;
}

function int(params: URLSearchParams, name: string): number | null {
  const raw = (params.get(name) ?? "").trim();

  if (raw === "") return null;

  const parsed = Number.parseInt(raw, 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function float(params: URLSearchParams, name: string): number | null {
  const raw = (params.get(name) ?? "").trim();

  if (raw === "") return null;

  const parsed = Number.parseFloat(raw);

  return Number.isFinite(parsed) ? parsed : null;
}

function flag(params: URLSearchParams, name: string): boolean {
  return tri(params, name) === true;
}

export function parseTargetFilters(params: URLSearchParams): TargetFilters {
  const sortRaw = (params.get("sort") ?? DEFAULT_SORT).trim();
  const sort = isTargetSortColumn(sortRaw) ? sortRaw : DEFAULT_SORT;

  const dir =
    (params.get("dir") ?? (sort === "score" ? "desc" : "asc")).toLowerCase() ===
    "desc"
      ? "desc"
      : "asc";

  const page = Math.max(1, int(params, "page") ?? 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, int(params, "pageSize") ?? DEFAULT_PAGE_SIZE),
  );

  return {
    q: (params.get("q") ?? "").trim(),
    empMin: int(params, "empMin"),
    empMax: int(params, "empMax"),
    sizes: list(params, "size"),
    countries: list(params, "country"),
    states: list(params, "state"),
    cities: list(params, "city"),
    industries: list(params, "industry"),
    hasEmployees: tri(params, "hasEmployees"),
    hasEmail: tri(params, "hasEmail"),
    contacted: tri(params, "contacted"),
    emailSent: tri(params, "emailSent"),
    opened: tri(params, "opened"),
    clicked: tri(params, "clicked"),
    studyDownloaded: tri(params, "studyDownloaded"),
    replied: tri(params, "replied"),
    hotLead: tri(params, "hotLead"),
    unsubscribed: tri(params, "unsubscribed"),
    hasBenchmark: tri(params, "hasBenchmark"),
    minPerf: float(params, "minPerf"),
    minSeo: float(params, "minSeo"),
    includeBlacklisted: flag(params, "includeBlacklisted"),
    inCrm: tri(params, "inCrm"),
    crmStages: list(params, "crmStage"),
    crmOwners: list(params, "crmOwner"),
    refreshCrm: flag(params, "refreshCrm"),
    sort,
    dir,
    page,
    pageSize,
  };
}

/** Human-readable filter summary, used on the export's "Filters" sheet. */
export function describeFilters(filters: TargetFilters): [string, string][] {
  const rows: [string, string][] = [];

  const push = (label: string, value: unknown) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value) && value.length === 0) return;
    if (value === "" || value === false) return;

    rows.push([label, Array.isArray(value) ? value.join(", ") : String(value)]);
  };

  push("Search", filters.q);
  push("Employees min", filters.empMin);
  push("Employees max", filters.empMax);
  push("LinkedIn size", filters.sizes);
  push("Country", filters.countries);
  push("State", filters.states);
  push("City", filters.cities);
  push("Industry", filters.industries);
  push("Has employee data", filters.hasEmployees);
  push("Has e-mail contact", filters.hasEmail);
  push("Contacted before", filters.contacted);
  push("E-mail sent", filters.emailSent);
  push("Opened", filters.opened);
  push("Clicked", filters.clicked);
  push("Study downloaded", filters.studyDownloaded);
  push("Replied", filters.replied);
  push("Hot lead", filters.hotLead);
  push("Unsubscribed", filters.unsubscribed);
  push("Has benchmark", filters.hasBenchmark);
  push("Min performance score", filters.minPerf);
  push("Min SEO score", filters.minSeo);
  push("Include blacklisted", filters.includeBlacklisted);
  push("In CRM", filters.inCrm);
  push("CRM stage", filters.crmStages);
  push("CRM owner", filters.crmOwners);
  push("Sort", `${filters.sort} ${filters.dir}`);

  return rows;
}
