// The composed "target row": one row = one company, everything we know plus
// everything we already did. ALL SQL for the target list lives here.
//
// ---------------------------------------------------------------------------
// SCORING (0-100)
// ---------------------------------------------------------------------------
// No formula was specified, so this is the documented default:
//   data completeness (30) + benchmark gap (25) + content gap (15)
//   + engagement (20) + reach (10)
// Every component yields 0..1 and is defined ONCE in SCORE_COMPONENTS with both
// its SQL expression (so `sort=score` works in the database) and its TypeScript
// implementation (so `score_breakdown` is explainable and unit-testable).
// Change the weights in SCORE_COMPONENTS - nowhere else.
// ---------------------------------------------------------------------------

import { getDb, sql, DbRequest } from "../lib/db";
import { TABLE as MEMBERS_TABLE } from "./members";
import {
  COMPANY_LATEST_CTE,
  parseFollowers,
  parseSizeBucket,
} from "./companies";
import {
  TECH_COLUMNS,
  TECH_LATEST_CTE,
  TechColumn,
  techSummary,
} from "./technologies";
import { BENCHMARK_LATEST_CTE } from "./benchmarks";
import {
  EMPLOYEE_COUNT_CTE,
  Contact,
  topContactsForMembers,
} from "./employees";
import { LEADS_BY_DOMAIN_CTE, LEADS_BY_EMAIL_CTE } from "./leads";
import { EMAILS_BY_DOMAIN_CTE, EMAILS_BY_EMAIL_CTE } from "./emails";
import { STATE_CODE_EXPR, IS_GERMANY_EXPR, stateName } from "./regions";
import type { CrmFlagKey } from "./crm-flags";

// --- row shape -------------------------------------------------------------

export type MatchConfidence = "email" | "domain" | "none";

export type TargetRow = {
  // identity / firmographics
  vdma_member_id: number;
  company_name: string | null;
  vdma_title: string | null;
  vdma_name: string | null;
  website: string | null;
  linkedin_url: string | null;
  industry: string | null;
  company_size_approx: string | null;
  linkedin_followers_count: string | null;
  linkedin_followers_numeric: number | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  headquarters: string | null;
  state_code: string | null;
  state: string | null;
  is_in_blacklist: boolean | null;

  // technologies
  tech_url: string | null;
  traffic_rank: number | null;
  tech_status: number | null;
  has_tech_data: boolean;
  tech_summary?: string;

  // people
  employee_count: number;
  has_employee_data: boolean;
  has_email_contact: boolean;
  email_source: string | null;
  company_email: string | null;
  company_domain: string | null;
  top_contacts?: Contact[];

  // benchmark
  benchmark_url: string | null;
  benchmark_product_url: string | null;
  benchmark_company: string | null;
  benchmark_match_strategy: string | null;
  benchmark_home_performance_score: number | null;
  benchmark_home_accessibility_score: number | null;
  benchmark_home_seo_score: number | null;
  benchmark_home_best_practices_score: number | null;
  benchmark_home_words_total: number | null;
  benchmark_home_modules_count: number | null;
  benchmark_sitewide_sitewide_has_blog: boolean | null;
  benchmark_sitewide_sitewide_has_whitepapers: boolean | null;
  benchmark_sitewide_sitewide_has_case_studies: boolean | null;
  benchmark_sitewide_sitewide_has_downloads: boolean | null;
  has_benchmark: boolean;

  // outreach / contact status
  contacted_before: boolean;
  lead_status: string | null;
  added_to_smartlead_at: string | Date | null;
  is_email_opened: boolean;
  is_email_link_clicked: boolean;
  is_study_downloaded: boolean;
  email_sent: boolean;
  emails_sent: number;
  replies: number;
  has_replied: boolean;
  last_sent_at: string | Date | null;
  last_received_at: string | Date | null;
  reply_category: string | null;
  is_hot_lead: boolean;
  is_unsubscribed: boolean;
  outreach_match: MatchConfidence;

  // scoring
  score: number;
  score_breakdown?: ScoreBreakdown;
} & { [K in TechColumn as `tech_${K}`]: string | null };

// --- scoring ---------------------------------------------------------------

export type ScoreComponentKey =
  | "data_completeness"
  | "benchmark_gap"
  | "content_gap"
  | "engagement"
  | "reach";

export type ScoreComponent = {
  key: ScoreComponentKey;
  label: string;
  weight: number;
  /** 0..1 expression over the outer query alias `t`. */
  sql: string;
  /** 0..1 value for one already-fetched row. */
  value: (row: TargetRow) => number;
};

const bool = (value: unknown) => (value ? 1 : 0);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const SCORE_COMPONENTS: ScoreComponent[] = [
  {
    key: "data_completeness",
    label: "Data completeness",
    weight: 30,
    sql: `(
      (CASE WHEN t.has_employee_data THEN 1 ELSE 0 END)
    + (CASE WHEN t.has_email_contact THEN 1 ELSE 0 END)
    + (CASE WHEN t.has_tech_data THEN 1 ELSE 0 END)
    + (CASE WHEN t.has_benchmark THEN 1 ELSE 0 END)
    ) / 4.0`,
    value: (row) =>
      (bool(row.has_employee_data) +
        bool(row.has_email_contact) +
        bool(row.has_tech_data) +
        bool(row.has_benchmark)) /
      4,
  },
  {
    key: "benchmark_gap",
    label: "Benchmark gap (opportunity)",
    weight: 25,
    // Low Lighthouse scores = big improvement opportunity = better target.
    // Unknown scores are neutral (0.5) rather than penalised.
    sql: `CASE
      WHEN t.benchmark_home_performance_score IS NULL
       AND t.benchmark_home_seo_score IS NULL THEN 0.5
      ELSE GREATEST(0, LEAST(1, 1 - ((
        COALESCE(t.benchmark_home_performance_score, t.benchmark_home_seo_score)
      + COALESCE(t.benchmark_home_seo_score, t.benchmark_home_performance_score)
      ) / 2.0) / 100.0))
    END`,
    value: (row) => {
      const perf = row.benchmark_home_performance_score;
      const seo = row.benchmark_home_seo_score;

      if (perf === null && seo === null) return 0.5;

      const a = perf ?? seo ?? 0;
      const b = seo ?? perf ?? 0;

      return clamp01(1 - (a + b) / 2 / 100);
    },
  },
  {
    key: "content_gap",
    label: "Missing content assets",
    weight: 15,
    sql: `CASE WHEN NOT t.has_benchmark THEN 0.5 ELSE (
      (CASE WHEN COALESCE(t.benchmark_sitewide_sitewide_has_blog, false) = false THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(t.benchmark_sitewide_sitewide_has_whitepapers, false) = false THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(t.benchmark_sitewide_sitewide_has_case_studies, false) = false THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(t.benchmark_sitewide_sitewide_has_downloads, false) = false THEN 1 ELSE 0 END)
    ) / 4.0 END`,
    value: (row) => {
      if (!row.has_benchmark) return 0.5;

      const missing = [
        row.benchmark_sitewide_sitewide_has_blog,
        row.benchmark_sitewide_sitewide_has_whitepapers,
        row.benchmark_sitewide_sitewide_has_case_studies,
        row.benchmark_sitewide_sitewide_has_downloads,
      ].filter((v) => !v).length;

      return missing / 4;
    },
  },
  {
    key: "engagement",
    label: "Engagement so far",
    weight: 20,
    sql: `(
      (CASE WHEN t.is_email_opened THEN 1 ELSE 0 END)
    + (CASE WHEN t.is_email_link_clicked THEN 1 ELSE 0 END)
    + (CASE WHEN t.is_study_downloaded THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(t.replies, 0) > 0 THEN 1 ELSE 0 END)
    + (CASE WHEN t.is_hot_lead THEN 1 ELSE 0 END)
    ) / 5.0`,
    value: (row) =>
      (bool(row.is_email_opened) +
        bool(row.is_email_link_clicked) +
        bool(row.is_study_downloaded) +
        bool((row.replies ?? 0) > 0) +
        bool(row.is_hot_lead)) /
      5,
  },
  {
    key: "reach",
    label: "Reach (people / followers)",
    weight: 10,
    sql: `GREATEST(
      LEAST(1, COALESCE(t.employee_count, 0) / 50.0),
      LEAST(1, COALESCE(t.linkedin_followers_numeric, 0) / 5000.0)
    )`,
    value: (row) =>
      Math.max(
        clamp01((row.employee_count ?? 0) / 50),
        clamp01((row.linkedin_followers_numeric ?? 0) / 5000),
      ),
  },
];

export const SCORE_WEIGHT_TOTAL = SCORE_COMPONENTS.reduce(
  (sum, c) => sum + c.weight,
  0,
);

export type ScoreBreakdown = {
  total: number;
  components: {
    key: ScoreComponentKey;
    label: string;
    weight: number;
    value: number;
    points: number;
  }[];
};

/** Pure, unit-testable scoring. Mirrors SCORE_SQL_EXPRESSION exactly. */
export function computeScore(row: TargetRow): ScoreBreakdown {
  const components = SCORE_COMPONENTS.map((c) => {
    const value = clamp01(c.value(row));

    return {
      key: c.key,
      label: c.label,
      weight: c.weight,
      value: Number(value.toFixed(4)),
      points: Number(((value * c.weight) / SCORE_WEIGHT_TOTAL * 100).toFixed(2)),
    };
  });

  const total = Math.round(
    components.reduce((sum, c) => sum + c.value * c.weight, 0) /
      SCORE_WEIGHT_TOTAL *
      100,
  );

  return { total, components };
}

export const SCORE_SQL_EXPRESSION = `ROUND((
${SCORE_COMPONENTS.map((c) => `  (${c.weight} * (${c.sql}))`).join("\n+")}
) / ${SCORE_WEIGHT_TOTAL}.0 * 100)::int`;

// --- filters ---------------------------------------------------------------

export type TriState = boolean | null;

export type TargetFilters = {
  q: string;
  empMin: number | null;
  empMax: number | null;
  sizes: string[];
  countries: string[];
  states: string[]; // state codes; "unknown" buckets NULL
  cities: string[];
  industries: string[];
  hasEmployees: TriState;
  hasEmail: TriState;
  contacted: TriState;
  emailSent: TriState;
  opened: TriState;
  clicked: TriState;
  studyDownloaded: TriState;
  replied: TriState;
  hotLead: TriState;
  unsubscribed: TriState;
  hasBenchmark: TriState;
  minPerf: number | null;
  minSeo: number | null;
  includeBlacklisted: boolean;
  // CRM filters are applied after enrichment, in the route - not in SQL.
  inCrm: TriState;
  /** Only the CRM engagement flags the caller actually asked about. */
  crmFlags: Partial<Record<CrmFlagKey, boolean>>;
  refreshCrm: boolean;
  sort: TargetSortColumn;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
};

export const TARGET_SORTABLE_COLUMNS = [
  "score",
  "vdma_member_id",
  "company_name",
  "industry",
  "city",
  "state_code",
  "country",
  "company_size_approx",
  "employee_count",
  "linkedin_followers_numeric",
  "traffic_rank",
  "benchmark_home_performance_score",
  "benchmark_home_seo_score",
  "emails_sent",
  "replies",
  "last_sent_at",
  "lead_status",
] as const;

export type TargetSortColumn = (typeof TARGET_SORTABLE_COLUMNS)[number];

export const DEFAULT_SORT: TargetSortColumn = "score";
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

export function isTargetSortColumn(value: string): value is TargetSortColumn {
  return (TARGET_SORTABLE_COLUMNS as readonly string[]).includes(value);
}

export function hasCrmFilter(filters: TargetFilters): boolean {
  return (
    filters.inCrm !== null || Object.keys(filters.crmFlags).length > 0
  );
}

// --- the composed query ----------------------------------------------------

const EMAIL_KEY = `NULLIF(lower(btrim(m."Email")), '')`;
const DOMAIN_KEY = `COALESCE(
  public.norm_domain(c.website),
  public.norm_domain(m."Website"),
  public.norm_domain(m."Email")
)`;

const TECH_PASSTHROUGH = TECH_COLUMNS.map(
  (col) => `    t."tech_${col}" AS "tech_${col}"`,
).join(",\n");

const BASE_CTE = `
WITH company AS (${COMPANY_LATEST_CTE}),
     tech AS (${TECH_LATEST_CTE}),
     bench AS (${BENCHMARK_LATEST_CTE}),
     emp AS (${EMPLOYEE_COUNT_CTE}),
     lead_email AS (${LEADS_BY_EMAIL_CTE}),
     lead_domain AS (${LEADS_BY_DOMAIN_CTE}),
     conv_email AS (${EMAILS_BY_EMAIL_CTE}),
     conv_domain AS (${EMAILS_BY_DOMAIN_CTE}),
base AS (
  SELECT
    m."VdmaMemberId" AS vdma_member_id,
    -- Some source rows carry a leading BOM; strip it so names sort and display cleanly.
    btrim(COALESCE(NULLIF(btrim(c.linkedin_company_name), ''),
             NULLIF(btrim(m."Title"), ''),
             NULLIF(btrim(c.vdma_name), ''),
             NULLIF(btrim(m."Name"), '')), chr(65279) || ' ') AS company_name,
    m."Title"      AS vdma_title,
    c.vdma_name    AS vdma_name,
    COALESCE(NULLIF(btrim(c.website), ''), NULLIF(btrim(m."Website"), '')) AS website,
    c.linkedin_url AS linkedin_url,
    c.industry     AS industry,
    c.company_size_approx AS company_size_approx,
    c.linkedin_followers_count AS linkedin_followers_count,
    NULLIF(regexp_replace(COALESCE(c.linkedin_followers_count, ''), '\\D', '', 'g'), '')::numeric
      AS linkedin_followers_numeric,
    m."City"       AS city,
    m."PostalCode" AS postal_code,
    m."Country"    AS country,
    c.headquarters AS headquarters,
    ${STATE_CODE_EXPR} AS state_code,
    ${IS_GERMANY_EXPR} AS is_germany,
    COALESCE(m.is_in_blacklist, false) AS is_in_blacklist,
    ${EMAIL_KEY}  AS company_email,
    ${DOMAIN_KEY} AS company_domain,

    t.tech_url      AS tech_url,
    t.traffic_rank  AS traffic_rank,
    t.tech_status   AS tech_status,
    (t.technology_id IS NOT NULL) AS has_tech_data,
${TECH_PASSTHROUGH},

    COALESCE(emp.employee_count, 0) AS employee_count,

    b.benchmark_url            AS benchmark_url,
    b.benchmark_product_url    AS benchmark_product_url,
    b.benchmark_company        AS benchmark_company,
    b.benchmark_match_strategy AS benchmark_match_strategy,
    b.benchmark_home_performance_score    AS benchmark_home_performance_score,
    b.benchmark_home_accessibility_score  AS benchmark_home_accessibility_score,
    b.benchmark_home_seo_score            AS benchmark_home_seo_score,
    b.benchmark_home_best_practices_score AS benchmark_home_best_practices_score,
    b.benchmark_home_words_total          AS benchmark_home_words_total,
    b.benchmark_home_modules_count        AS benchmark_home_modules_count,
    b.benchmark_sitewide_sitewide_has_blog        AS benchmark_sitewide_sitewide_has_blog,
    b.benchmark_sitewide_sitewide_has_whitepapers AS benchmark_sitewide_sitewide_has_whitepapers,
    b.benchmark_sitewide_sitewide_has_case_studies AS benchmark_sitewide_sitewide_has_case_studies,
    b.benchmark_sitewide_sitewide_has_downloads    AS benchmark_sitewide_sitewide_has_downloads,
    (b.benchmark_id IS NOT NULL) AS has_benchmark,

    -- outreach: exact e-mail match wins, domain match is the fallback
    (le.match_key IS NOT NULL OR ce.match_key IS NOT NULL) AS outreach_email_match,
    (ld.match_key IS NOT NULL OR cd.match_key IS NOT NULL) AS outreach_domain_match,
    COALESCE(le.lead_count, ld.lead_count, 0)              AS lead_count,
    COALESCE(le.lead_status, ld.lead_status)               AS lead_status,
    COALESCE(le.added_to_smartlead_at, ld.added_to_smartlead_at) AS added_to_smartlead_at,
    COALESCE(le.is_email_opened, ld.is_email_opened, false)       AS is_email_opened,
    COALESCE(le.is_email_link_clicked, ld.is_email_link_clicked, false) AS is_email_link_clicked,
    COALESCE(le.is_study_downloaded, ld.is_study_downloaded, false) AS is_study_downloaded,
    COALESCE(ce.emails_sent, cd.emails_sent, 0)            AS emails_sent,
    COALESCE(ce.replies, cd.replies, 0)                    AS replies,
    COALESCE(ce.last_sent_at, cd.last_sent_at)             AS last_sent_at,
    COALESCE(ce.last_received_at, cd.last_received_at)     AS last_received_at,
    COALESCE(ce.reply_category, cd.reply_category)         AS reply_category,
    COALESCE(ce.is_hot_lead, cd.is_hot_lead, false)        AS is_hot_lead,
    COALESCE(ce.is_unsubscribed, cd.is_unsubscribed, false) AS is_unsubscribed
  FROM ${MEMBERS_TABLE} m
  LEFT JOIN company c ON c.vdma_company_id = m."VdmaMemberId"
  LEFT JOIN tech t    ON t.vdma_member_id  = m."VdmaMemberId"
  LEFT JOIN bench b   ON b.vdma_company_id = m."VdmaMemberId"
  LEFT JOIN emp       ON emp.vdma_member_id = m."VdmaMemberId"
  LEFT JOIN lead_email le ON le.match_key = ${EMAIL_KEY}
  LEFT JOIN lead_domain ld ON ld.match_key = ${DOMAIN_KEY}
  LEFT JOIN conv_email ce ON ce.match_key = ${EMAIL_KEY}
  LEFT JOIN conv_domain cd ON cd.match_key = ${DOMAIN_KEY}
),
enriched AS (
  SELECT base.*,
         (base.employee_count > 0) AS has_employee_data,
         (base.company_email IS NOT NULL OR base.lead_count > 0) AS has_email_contact,
         CASE
           WHEN base.company_email IS NOT NULL AND base.lead_count > 0 THEN 'member+lead'
           WHEN base.company_email IS NOT NULL THEN 'member'
           WHEN base.lead_count > 0 THEN 'lead'
           ELSE NULL
         END AS email_source,
         (base.lead_count > 0 OR base.emails_sent > 0 OR base.replies > 0) AS contacted_before,
         (base.emails_sent > 0 OR base.added_to_smartlead_at IS NOT NULL) AS email_sent,
         (base.replies > 0) AS has_replied,
         CASE
           WHEN base.outreach_email_match THEN 'email'
           WHEN base.outreach_domain_match THEN 'domain'
           ELSE 'none'
         END AS outreach_match
    FROM base
)
`;

type FilterBinding = { where: string[]; bind: (r: DbRequest) => void };

function buildWhere(filters: TargetFilters): FilterBinding {
  const where: string[] = [];
  const binders: ((r: DbRequest) => void)[] = [];

  const multi = (
    values: string[],
    name: string,
    expr: (placeholders: string) => string,
    transform: (v: string) => string = (v) => v,
  ) => {
    if (!values.length) return;

    const placeholders = values.map((_, i) => `@${name}${i}`).join(", ");
    where.push(expr(placeholders));
    binders.push((r) =>
      values.forEach((v, i) => r.input(`${name}${i}`, sql.NVarChar, transform(v))),
    );
  };

  const tri = (value: TriState, expr: string) => {
    if (value === null) return;
    where.push(value ? expr : `NOT (${expr})`);
  };

  if (filters.q) {
    where.push(
      `(t.company_name ILIKE @q OR t.website ILIKE @q OR t.industry ILIKE @q OR t.city ILIKE @q)`,
    );
    binders.push((r) => r.input("q", sql.NVarChar, `%${filters.q}%`));
  }

  if (filters.empMin !== null) {
    where.push(`t.employee_count >= @empMin`);
    binders.push((r) => r.input("empMin", sql.Int, filters.empMin));
  }

  if (filters.empMax !== null) {
    where.push(`t.employee_count <= @empMax`);
    binders.push((r) => r.input("empMax", sql.Int, filters.empMax));
  }

  multi(filters.sizes, "size", (p) => `t.company_size_approx IN (${p})`);

  multi(
    filters.countries,
    "country",
    (p) => `lower(btrim(t.country)) IN (${p})`,
    (v) => v.trim().toLowerCase(),
  );

  multi(
    filters.cities,
    "city",
    (p) => `lower(btrim(t.city)) IN (${p})`,
    (v) => v.trim().toLowerCase(),
  );

  multi(filters.industries, "industry", (p) => `btrim(t.industry) IN (${p})`);

  // "unknown" keeps NULL-state rows visible and filterable.
  const stateCodes = filters.states.filter(
    (s) => s.toLowerCase() !== "unknown",
  );
  const wantsUnknown = filters.states.some(
    (s) => s.toLowerCase() === "unknown",
  );

  if (stateCodes.length || wantsUnknown) {
    const parts: string[] = [];

    if (stateCodes.length) {
      const placeholders = stateCodes.map((_, i) => `@state${i}`).join(", ");
      parts.push(`t.state_code IN (${placeholders})`);
      binders.push((r) =>
        stateCodes.forEach((v, i) => r.input(`state${i}`, sql.NVarChar, v)),
      );
    }

    if (wantsUnknown) parts.push(`t.state_code IS NULL`);

    where.push(`(${parts.join(" OR ")})`);
  }

  tri(filters.hasEmployees, `t.has_employee_data`);
  tri(filters.hasEmail, `t.has_email_contact`);
  tri(filters.contacted, `t.contacted_before`);
  tri(filters.emailSent, `t.email_sent`);
  tri(filters.opened, `t.is_email_opened`);
  tri(filters.clicked, `t.is_email_link_clicked`);
  tri(filters.studyDownloaded, `t.is_study_downloaded`);
  tri(filters.replied, `t.has_replied`);
  tri(filters.hotLead, `t.is_hot_lead`);
  tri(filters.unsubscribed, `t.is_unsubscribed`);
  tri(filters.hasBenchmark, `t.has_benchmark`);

  if (filters.minPerf !== null) {
    where.push(`t.benchmark_home_performance_score >= @minPerf`);
    binders.push((r) => r.input("minPerf", sql.Float, filters.minPerf));
  }

  if (filters.minSeo !== null) {
    where.push(`t.benchmark_home_seo_score >= @minSeo`);
    binders.push((r) => r.input("minSeo", sql.Float, filters.minSeo));
  }

  if (!filters.includeBlacklisted) {
    where.push(`COALESCE(t.is_in_blacklist, false) = false`);
  }

  return {
    where,
    bind: (r: DbRequest) => binders.forEach((b) => b(r)),
  };
}

export type TargetListResult = {
  rows: TargetRow[];
  total: number;
};

/**
 * The one query behind both /api/targets and /api/targets/export.
 * `limit: null` returns every matching row (used by the export).
 */
export async function list(
  filters: TargetFilters,
  options: { limit?: number | null; offset?: number } = {},
): Promise<TargetListResult> {
  const { where, bind } = buildWhere(filters);
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sort = isTargetSortColumn(filters.sort) ? filters.sort : DEFAULT_SORT;
  const dir = filters.dir === "desc" ? "DESC" : "ASC";

  const limit = options.limit === undefined ? filters.pageSize : options.limit;
  const offset = options.offset ?? 0;

  const pagination =
    limit === null ? "" : `LIMIT @limit OFFSET @offset`;

  const pool = await getDb();

  const dataRequest = pool.request();
  bind(dataRequest);

  if (limit !== null) {
    dataRequest.input("limit", sql.Int, limit);
    dataRequest.input("offset", sql.Int, offset);
  }

  const dataQuery = `
    ${BASE_CTE}
    SELECT t.*, ${SCORE_SQL_EXPRESSION} AS score
      FROM enriched t
      ${whereClause}
     ORDER BY ${sort === "score" ? "score" : `t."${sort}"`} ${dir} NULLS LAST,
              t.vdma_member_id ASC
     ${pagination};
  `;

  const countRequest = pool.request();
  bind(countRequest);

  const countQuery = `
    ${BASE_CTE}
    SELECT COUNT(*)::int AS total FROM enriched t ${whereClause};
  `;

  const [dataResult, countResult] = await Promise.all([
    dataRequest.query<TargetRow>(dataQuery),
    countRequest.query<{ total: number }>(countQuery),
  ]);

  const rows = dataResult.recordset.map(decorate);

  await attachContacts(rows);

  return {
    rows,
    total: Number(countResult.recordset[0]?.total ?? 0),
  };
}

export async function findById(id: number): Promise<TargetRow | null> {
  const pool = await getDb();

  const request = pool.request().input("id", sql.Int, id);

  const result = await request.query<TargetRow>(`
    ${BASE_CTE}
    SELECT t.*, ${SCORE_SQL_EXPRESSION} AS score
      FROM enriched t
     WHERE t.vdma_member_id = @id
     LIMIT 1;
  `);

  const row = result.recordset[0];

  if (!row) return null;

  const decorated = decorate(row);

  await attachContacts([decorated]);

  return decorated;
}

// Row post-processing that is presentation-only (never a filter or a sort).
function decorate(row: TargetRow): TargetRow {
  const followers =
    row.linkedin_followers_numeric === null ||
    row.linkedin_followers_numeric === undefined
      ? parseFollowers(row.linkedin_followers_count)
      : Number(row.linkedin_followers_numeric);

  const decorated: TargetRow = {
    ...row,
    linkedin_followers_numeric: followers,
    state: stateName(row.state_code),
    tech_summary: techSummary(row),
    employee_count: Number(row.employee_count ?? 0),
    emails_sent: Number(row.emails_sent ?? 0),
    replies: Number(row.replies ?? 0),
    score: Number(row.score ?? 0),
  };

  decorated.score_breakdown = computeScore(decorated);

  return decorated;
}

async function attachContacts(rows: TargetRow[]): Promise<void> {
  const ids = rows
    .filter((r) => r.has_employee_data)
    .map((r) => r.vdma_member_id);

  if (ids.length === 0) return;

  const contacts = new Map<number, Contact[]>();

  // Chunked so an export of thousands of rows stays inside sane parameter counts.
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = await topContactsForMembers(ids.slice(i, i + 500));
    chunk.forEach((value, key) => contacts.set(key, value));
  }

  for (const row of rows) {
    row.top_contacts = contacts.get(row.vdma_member_id) ?? [];
  }
}

/** LinkedIn bucket -> numeric range, exposed for the "LinkedIn size" filter UI. */
export { parseSizeBucket };
