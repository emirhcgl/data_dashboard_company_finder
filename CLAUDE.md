# Company Targeting App — Build Instructions

Hand this file to the coding agent as the new project's `CLAUDE.md` (or
`AGENTS.md`). It is the spec for a **new** application that reuses the existing
`data_dashboard` PostgreSQL database (same tables, same columns) for a narrower,
specialized purpose.

Companion reference: `data_dashboard/CLAUDE.md` in the sibling project documents the
full database model. Copy that file into the new repo as `docs/DATA_MODEL.md` and
treat it as the schema source of truth. Everything below overrides it where they
disagree.

---

## 1. What we are building

**A one-page target-list builder.**

The user opens a single page, sets criteria, sees the matching companies in a table,
optionally enriches them against **Twenty CRM**, and downloads the result as Excel.

That is the whole product. No per-entity browsing sections, no detail pages for every
table, no dashboard home. One list page + one export + the API routes that serve them.

Flow:

```
1. User sets filters (size, region/state, sub-industry, data availability, outreach status)
2. Postgres query  -> base rows (company + employees + technologies + benchmark + scoring)
3. Twenty CRM call -> enrichment (already in CRM? contacted? email sent? stage? owner?)
4. Merged rows rendered in the table
5. "Download Excel" exports exactly the currently filtered/merged list
```

### Why it is not the old dashboard
The old app is a generic data browser. This one answers one question: *"which
companies should we contact next, and what do we already know / already did?"*
Optimize every decision for that question.

---

## 2. Non-negotiable carry-overs from `data_dashboard`

Keep these exactly as they are in the existing app — same stack, same patterns, so
both apps stay maintainable by the same people.

- **Next.js 16 App Router + React 19 + TypeScript**, Tailwind CSS v4
  (`@tailwindcss/postcss`).
- **PostgreSQL via `pg`** connection pool, connection string from
  `DB_CONNECTION_STRING`.
- **`node-pg-migrate`** with plain `.sql` files in `migrations/`; scripts
  `migrate`, `migrate:up`, `migrate:down` exactly as in the old `package.json`.
- **Auth:** single admin from env (`ADMIN_EMAIL` + bcrypt `ADMIN_PASSWORD_HASH`),
  `POST /api/auth/login` issues an 8h HS256 JWT (`jose`) into an httpOnly `session`
  cookie. `(protected)/layout.tsx` redirects to `/auth/login` when there is no
  session.
- **API key for machines:** `proxy.ts` with `matcher: ["/api/:path*"]`, public
  allowlist `["/api/auth/login"]`, authorizing either the `session` cookie **or**
  `Authorization: Bearer <EXTERNAL_API_KEY>` compared with the constant-time helper
  from `app/lib/api-auth.ts`. Copy that file as-is.
- **Excel export via `exceljs`**: bold + grey frozen header row, `autoFilter`,
  explicit column widths, `Content-Disposition: attachment; filename="...<YYYY-MM-DD>.xlsx"`,
  `Cache-Control: no-store`. Copy the shape of
  `data_dashboard/app/api/companies/export/route.ts`.
- **Containerization:** copy `Dockerfile` (multi-stage `base → deps → migrator →
  builder → runner`, `node:22-alpine`, non-root `nextjs` user, Next standalone
  output), `Dockerfile.dev`, `.dockerignore`, and `docker-compose.yml` with the
  `db` (postgres:17, healthcheck) → `migrate` (runs `npm run migrate:up`, waits for
  healthy db) → `app` (waits for migrate to complete successfully) chain.
  `next.config.ts` must set `output: "standalone"` for the runner stage to work.
- **Query safety:** every value parameterized; every sortable/filterable column
  resolved against an exported whitelist before it touches SQL; `pageSize` capped
  at 100.

---

## 3. Architecture change: a model layer, not one big `db.ts`

The old app crammed table names, row types and column whitelists into a single
`app/lib/db.ts`. **Do not repeat that.** Split it:

```
app/
  lib/
    db.ts            # ONLY: pg Pool + getDb() + the DbRequest/@param shim + sql type consts
    env.ts           # typed, validated env access (throws at startup if missing)
  models/
    members.ts       # vdma_members
    companies.ts     # company_linkedin_profiles
    employees.ts     # employee_linkedin_data
    technologies.ts  # company_technologies (+ TECH_COLUMNS)
    benchmarks.ts    # company_benchmarking_scores
    leads.ts         # leads
    emails.ts        # email_conversations
    targets.ts       # the composed "target row" used by the page (joins the above)
    regions.ts       # city/postal-code -> state (Bundesland) mapping
    twenty.ts        # Twenty CRM client + CRM enrichment types
```

Each model file in `app/models/` owns, for its table:

1. `export const TABLE = env.DB_<X>_TABLE ?? "<default>"` — table name still
   env-overridable.
2. `export type <Entity>Row = { ... }` — the row shape.
3. `export const <ENTITY>_COLUMNS` / `SORTABLE_COLUMNS` — whitelists.
4. **All SQL for that table**, as exported functions (`list`, `findById`,
   `countBy`, …). No SQL string may live in a route handler or a component.
5. Any mapping/normalisation helpers (e.g. parsing `company_size_approx` buckets
   into a numeric range).

Route handlers become thin: parse and validate query params → call a model function
→ shape the JSON response. Same for the export route: it calls the *same* model
function as the list route with `limit: null`, so the Excel can never diverge from
what the table shows.

Keep the `pool.request().input(name, sql.NVarChar, value).query("... @name ...")`
shim in `db.ts` — the models use it, so knowledge transfers between the two apps.

---

## 4. The target row (output columns)

One row = one company. Assemble it in `app/models/targets.ts`. This is the "full
picture" view — everything we know, plus what we already did.

**Identity / firmographics**
- `vdma_member_id` (`vdma_members."VdmaMemberId"`) — the join key everywhere
- company name (prefer `company_linkedin_profiles.linkedin_company_name`, fall back
  to `vdma_members."Title"` / `vdma_name`)
- `website`, `linkedin_url`, `industry` (**sub-industry**), `company_size_approx`,
  `linkedin_followers_count`
- `city`, `postal_code`, `country`, `headquarters`
- **`state`** — derived, see §6
- `is_in_blacklist`

**Technologies** (`company_technologies`)
- `tech_url`, `traffic_rank`, `tech_status`
- the detected technology categories — import `TECH_COLUMNS` from
  `app/models/technologies.ts`, never hand-type the ~80 names. In the table show a
  compact summary (e.g. CMS / Analytics / CRM / Marketing_automation / Hosting);
  in the Excel export write every non-empty category as its own column.

**People** (`employee_linkedin_data`)
- `employee_count` — how many employee rows we hold for this member
- `has_employee_data` = `employee_count > 0`
- `has_email_contact` — do we have a usable address? `vdma_members."Email"` present
  **or** a matching `leads.email` exists. Report which source(s) matched.
- a short list of top contacts (`fullName`, `currentTitle`, `linkedinUrl`) — decision
  needed on ranking; default to seniority keywords in `currentTitle`, else newest
  `positionStartYear`.

**Benchmark** (`company_benchmarking_scores`) — *new requirement: expose the URL*
- **`benchmark_url`** and `benchmark_product_url` must both be first-class columns in
  the table and the export. This was missing before; it is explicitly required now.
- `benchmark_company`, `benchmark_match_strategy`
- Lighthouse scores: `benchmark_home_performance_score`,
  `benchmark_home_accessibility_score`, `benchmark_home_seo_score`,
  `benchmark_home_best_practices_score`
- content signals worth showing: `benchmark_home_words_total`,
  `benchmark_home_modules_count`, `benchmark_sitewide_sitewide_has_blog`,
  `..._has_whitepapers`, `..._has_case_studies`, `..._has_downloads`

**Scoring**
- a single `score` (0–100) computed in `targets.ts` from the signals above, plus
  `score_breakdown` so the number is explainable in the UI.
- Implement it as one pure, unit-testable function with the weights in a single
  exported object — the weights will change often. Do **not** invent a formula
  silently: if the weighting is not specified, implement a documented default
  (data completeness + benchmark gap + engagement) and surface the weights in the
  code with a comment block at the top.

**Outreach / contact status** (from our own DB, `leads` + `email_conversations`)
- `contacted_before` = a `leads` row or any `email_conversations` row exists for a
  matching email
- `lead_status` (`leads.status`), `added_to_smartlead_at`
- `is_email_opened`, `is_email_link_clicked`, `is_study_downloaded`
- from `email_conversations`: `emails_sent` (outbound count), `replies` (inbound
  count), `last_sent_at`, `last_received_at`, `reply_category`, `is_hot_lead`,
  `is_unsubscribed`
- Matching rule: `leads`/`email_conversations` have **no** member id — they key on
  `email`. Match by exact email when we have one, otherwise by email domain against
  the company `website` domain. Implement domain extraction in one helper and reuse
  it; note in the UI when a match was domain-based (lower confidence).

**Twenty CRM enrichment** — see §7. Prefix every CRM field `crm_`.

---

## 5. Filters (the page's whole UI)

All filters combine with `AND`, all are optional, all live in the URL query string so
a filtered list is shareable and the export route can reuse the exact same params.

| Filter | Param | Behaviour |
|---|---|---|
| Number of employees | `empMin`, `empMax` | On our own employee-row count (`has_employee_data` pool). Also allow filtering on the LinkedIn bucket `size` (repeatable / `\|`-joined, `IN (...)`) — keep both, label them clearly ("employees we know" vs "LinkedIn size"). |
| Location — country | `country` | exact, multi |
| Location — **state** | `state` | multi; derived server-side, see §6 |
| Location — city | `city` | multi, exact (case-insensitive) |
| Sub-industry | `industry` | multi, exact on `company_linkedin_profiles.industry`; provide a distinct-values endpoint to populate the picker |
| Do we have employee data? | `hasEmployees=1\|0` | |
| Do we have email info? | `hasEmail=1\|0` | |
| Contacted before? | `contacted=1\|0` | |
| Email sent | `emailSent=1\|0` | |
| Opened / clicked / study downloaded | `opened`, `clicked`, `studyDownloaded` | `1\|0`, treat NULL as false |
| Replied / hot lead / unsubscribed | `replied`, `hotLead`, `unsubscribed` | `1\|0` |
| In Twenty CRM? | `inCrm=1\|0` | requires enrichment; see §7 |
| CRM stage / owner | `crmStage`, `crmOwner` | multi, exact |
| Has benchmark data | `hasBenchmark=1\|0` | |
| Min Lighthouse scores | `minPerf`, `minSeo` | numeric |
| Free-text | `q` | `ILIKE '%q%'` across name, website, industry, city |
| Blacklist | default **excludes** `is_in_blacklist = 1`; `includeBlacklisted=1` to opt in |
| Sort / page | `sort`, `dir`, `page`, `pageSize` | whitelist `sort`; `pageSize` ≤ 100, default 25 |

UI notes: filters in a left rail or a collapsible bar above the table; show the active
filter count and a "reset" action; show `total` matched rows next to the download
button so the user knows how big the export will be. Boolean filters should be
tri-state (any / yes / no), not checkboxes.

---

## 6. Region logic (city → state)

New requirement: **each city belongs to a state** (München → Bayern), and the list
must be filterable by state.

- Build `app/models/regions.ts` with a **static, committed mapping** — no runtime
  geocoding API.
- Resolution order for a company:
  1. normalized city name lookup (lowercase, trim, strip `bei/am/an der ...`
     suffixes, handle `ü/ö/ä/ß` and the `ue/oe/ae/ss` spellings, and the
     `Frankfurt am Main` vs `Frankfurt (Oder)` ambiguity — for ambiguous names the
     postal code decides).
  2. **German postal-code prefix ranges** (`vdma_members."PostalCode"`), which cover
     every German address and are the reliable fallback.
  3. `headquarters` string parsing as a last resort.
  4. otherwise `state = null` → bucket the row under "Unknown" (must still be
     visible and filterable, never silently dropped).
- Non-German countries: `state = null`, and the state filter is only offered when
  `country` is Germany (or unset). Keep the module shaped so other countries can be
  added later (`resolveState(country, city, postalCode)`).
- The 16 Bundesländer with their canonical names and short codes belong in one
  exported const; the UI labels come from there.
- **Performance:** resolve state in SQL, not in JS, so it can be filtered and
  paginated. Preferred implementation: a migration that creates a lookup table
  (`region_postal_ranges` and/or `region_cities`) plus a SQL function or a `LEFT JOIN`
  the query can use. This is an **additive** migration — it adds new tables, it must
  not touch `vdma_members`. Seed it from the committed data in a migration so the
  container's `migrate` step populates it.
- If you instead need a derived column, add a nullable `state` column to a **new**
  side table keyed on `vdma_member_id` — never to `vdma_members`.

---

## 7. Twenty CRM integration

Purpose: after we pull candidates from Postgres, ask Twenty CRM what it already knows
so the user does not target someone already in flight.

**Client** (`app/models/twenty.ts` — the only file that talks to Twenty):

- Config from env: `TWENTY_API_URL` (cloud `https://api.twenty.com`, or the
  self-hosted base URL) and `TWENTY_API_KEY`. Auth header
  `Authorization: Bearer <TWENTY_API_KEY>`.
- Twenty's schema is **per workspace and schema-generated**, so there is no static
  public API reference. Before writing field names, verify the real workspace schema
  via *Settings → API & Webhooks* (playground) or the metadata API, and record the
  confirmed field list in `docs/TWENTY_SCHEMA.md`. Do not guess custom field names.
- Known-good baseline (verify against the workspace):
  - REST: `GET /rest/companies?filter[domainName][eq]=example.com`,
    `POST /rest/companies`
  - GraphQL: `POST /graphql` with
    `companies(filter: { domainName: { eq: "example.com" } }) { edges { node { id name domainName } } }`
  - GraphQL is preferred when we need companies **plus** their related people /
    activities in one round trip.
- **Limits:** ~100 requests/minute, and batch operations cap at ~60 records per
  request. Therefore: batch domain lookups, add a token-bucket limiter + retry with
  exponential backoff on 429/5xx, and never fan out one request per row of a
  100-row page without the limiter.
- Match key: **website domain** (normalize: strip scheme, `www.`, path, lowercase).
  Fall back to normalized company name only when there is no website, and mark such
  matches `crm_match: "name"` so the UI can show lower confidence.
- Everything the client returns is typed; the raw payload is never leaked into
  components.

**Enrichment fields** added to the target row (all `crm_`-prefixed, all nullable):
`crm_id`, `crm_url` (deep link to the record), `crm_name`, `crm_domain`,
`crm_stage`, `crm_owner`, `crm_created_at`, `crm_last_activity_at`,
`crm_contacted` (bool), `crm_email_sent` (bool / count), `crm_people_count`,
`crm_match` (`domain` | `name` | `none`).

**How the merge works**
- The Postgres query is always the source of the candidate set; CRM data only
  decorates it. A CRM failure must degrade gracefully: return the rows with
  `crm_* = null` and an `enrichment: { ok: false, error }` field in the response,
  and show a non-blocking warning in the UI. **Never** fail the whole page because
  the CRM is down.
- Enrich only the rows being displayed/exported, after filtering and pagination —
  except when a `crm*` filter is active, in which case enrichment must run before
  the CRM filter is applied. Document that ordering in the route.
- **Cache** CRM responses in a new table (additive migration), e.g.
  `crm_company_cache(domain PK, crm_payload jsonb, fetched_at timestamptz)`, with a
  TTL (default 24h, env `TWENTY_CACHE_TTL_HOURS`) and a `refresh=1` param to bypass
  it. This keeps the export path inside the rate limit.
- Direction: **read-only from Twenty for v1.** Writing back to the CRM (creating
  companies, logging that we exported a list) is a later phase — design the client
  so a `createCompany` / `updatePerson` can be added, but do not wire any write into
  the UI now.

---

## 8. API surface

Small on purpose:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/login` | session cookie (only public route) |
| `GET` | `/api/targets` | the list: all §5 params → `{ data, total, page, pageSize, sort, dir, enrichment }` |
| `GET` | `/api/targets/export` | same params, no pagination → `.xlsx` |
| `GET` | `/api/filters` | distinct values for the pickers (industries, countries, states, cities, sizes, CRM stages/owners) — cache it |
| `GET` | `/api/targets/[id]` | optional: full detail for one company (drawer/modal, not a separate page) |

Rules: response envelope identical to the old app's list contract; the export route
must call the same model function as the list route; both routes share one
`parseTargetFilters(searchParams)` helper so they can never drift.

---

## 9. Environment variables

```
DB_CONNECTION_STRING=
DB_TABLE=                  # optional overrides, same defaults as data_dashboard
DB_COMPANIES_TABLE=
DB_TECH_TABLE=
DB_BENCHMARKS_TABLE=
DB_EMPLOYEES_TABLE=
DB_EMAILS_TABLE=
DB_LEADS_TABLE=
SESSION_SECRET=
ADMIN_EMAIL=
ADMIN_PASSWORD_HASH=       # bcrypt
EXTERNAL_API_KEY=
TWENTY_API_URL=
TWENTY_API_KEY=
TWENTY_CACHE_TTL_HOURS=24
```

Validate them in `app/lib/env.ts` and fail fast at startup with a clear message.
Ship `.env.example` with **names only and empty values**. Never commit real secrets;
`.env.local` and `.env.docker` stay untracked (see the old `.gitignore` /
`.dockerignore`).

---

## 10. Rules for touching the shared database

The old app and external pipelines (n8n, Smartlead sync) use this database at the
same time.

1. **Read-only** on `vdma_members`, `company_linkedin_profiles`,
   `company_technologies`, `company_benchmarking_scores`, `employee_linkedin_data`.
   This app must not write to or restructure them.
2. `leads` and `email_conversations` are shared write surfaces owned by the other
   app. **v1 of this app does not write to them.** If a write becomes necessary,
   upsert on the natural key (`leads.email`), never renumber ids, never assume we
   own a row.
3. **Add, never repurpose.** New state goes in a new table (keyed on
   `vdma_member_id` or `email`) or a new nullable column, via a migration in
   `migrations/`, following the style of the two existing files. Never change the
   type or meaning of an existing column.
4. Respect `is_in_blacklist` and `is_unsubscribed` in anything that leads to
   outreach — exclude by default.
5. Mind the mixed identifier casing: PascalCase/camelCase columns
   (`"VdmaMemberId"`, `"Id"`, `"URL"`, `"firstName"`) **must** be double-quoted in
   SQL; alias them to snake_case in the model layer so the rest of the app sees one
   convention.
6. The composed target query touches five tables — verify indexes exist on the join
   columns (`vdma_company_id`, `vdma_member_id`, `leads.email`,
   `email_conversations.email`) before adding them. Adding an index is additive and
   allowed; run `EXPLAIN ANALYZE` on the target query and keep the aggregate parts
   (employee count, email counts) as pre-aggregated subqueries or a materialized
   view rather than row-by-row correlated subqueries.

---

## 11. Build order

1. Scaffold: Next.js 16 + TS + Tailwind v4, copy `Dockerfile`, `Dockerfile.dev`,
   `.dockerignore`, `docker-compose.yml`, `next.config.ts` (`output: "standalone"`),
   `package.json` scripts, `.env.example`.
2. Auth: `session.ts`, `api-auth.ts`, `proxy.ts`, `/api/auth/login`,
   `/auth/login` page, `(protected)/layout.tsx`. Verify a logged-out request to any
   `/api/*` route returns 401 and that a Bearer key request succeeds.
3. `lib/db.ts` (pool + shim only) and `lib/env.ts`.
4. Model files for the read-only tables, with their column whitelists and typed row
   shapes.
5. `models/regions.ts` + the region migration; verify München→Bayern, Hamburg
   (city-state), an ambiguous city name, a non-German row, and a missing postal code.
6. `models/targets.ts`: the composed query, filters, scoring function, and the
   contact-status derivation. Get this correct and fast **before** any UI.
7. `/api/targets` + `/api/filters`, then the single page with filters, table,
   sorting, pagination.
8. `/api/targets/export` (`exceljs`) — confirm the exported row count equals the
   page's reported `total` and that column order matches the table.
9. `models/twenty.ts`: verified schema, rate-limited client, cache table migration,
   merge into `/api/targets`, `crm*` filters, graceful degradation.
10. `docker compose up` end to end: migrations run, app boots, login works, list
    loads, export downloads.

## 12. Definition of done

- One page produces a filtered, sorted, paginated company list with every column in
  §4, including `benchmark_url` and a `state` value.
- Every filter in §5 works and round-trips through the URL.
- Excel download matches the on-screen filtered list exactly (same rows, same order).
- CRM enrichment populates `crm_*` fields, respects the rate limit, and the page
  still renders when Twenty is unreachable.
- All `/api/*` routes require the session cookie or the Bearer key.
- `npm run lint` and `npm run build` pass; `docker compose up` brings up db →
  migrations → app with no manual steps.
- No SQL outside `app/models/`; no secret values in any committed file.

## 13. When to stop and ask

Do not guess on these — they change the output and are cheap to confirm:

- The **scoring weights** (§4) if a specific formula is expected.
- Twenty CRM **custom field names**, workspace URL, and whether "contacted" /
  "email sent" live on the company, the person, or an activity/timeline object.
- Whether "number of employees" means our own employee-row count or the LinkedIn
  size bucket when the two disagree (the spec keeps both — confirm which one the
  primary filter should be).
- The list of **sub-industries** that matter, if only a subset should be selectable.
- Whether domain-based lead matching (§4) is acceptable or matching must be
  exact-email only.
