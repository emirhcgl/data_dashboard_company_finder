@AGENTS.md

# Data Dashboard — Project & Data Model Guide

> Portable reference. This file describes the software and the **shared PostgreSQL
> data model**. A new application that reuses the same database (same tables, same
> columns) for a different purpose can copy this file as its own `CLAUDE.md` and only
> replace the "What this app does" section.
>
> The schema below is derived from the application code (`app/lib/db.ts`, the API
> routes and `migrations/`), **not** from an introspection of a live database. Treat
> column lists as authoritative for what the app reads/writes; verify exact SQL types
> against the real database before writing migrations.

## 1. What this app does

A single-tenant internal B2B data dashboard for the VDMA (German machinery
association) member dataset and the outbound sales pipeline built on top of it.

Two consumers, one codebase:

1. **Dashboard UI** — server-rendered tables with search, filtering, whitelisted
   sorting, pagination, detail pages and Excel export, for exploring members,
   companies, employees, website technologies, website benchmarks, leads and email
   conversations.
2. **External API** — the same `/api/*` routes are callable by other services
   (n8n / Smartlead automations) with a Bearer API key, so external workflows can
   read data and write back leads and email replies.

The database is the integration point: enrichment pipelines fill the data tables,
this app reads them and maintains the `leads` / `email_conversations` tables.

## 2. Stack

- Next.js 16 (App Router, React 19, Server Components) + TypeScript
- Tailwind CSS v4 (`@tailwindcss/postcss`)
- PostgreSQL 17 via `pg` connection pool
- `node-pg-migrate` for schema migrations (plain `.sql` files in `migrations/`)
- `jose` (JWT session cookie) + `bcryptjs` (password hash)
- `exceljs` for `.xlsx` exports
- Docker Compose: `db` → `migrate` → `app`

Scripts: `npm run dev | build | start | lint | migrate:up | migrate:down`.

## 3. Layout

```
app/
  (protected)/            # auth-gated UI; layout redirects to /auth/login without session
    page.tsx              # dashboard home
    members/ apis/ companies/ employees/ technologies/ benchmarks/ leads/ emails/
      page.tsx            # list view
      [id]/page.tsx       # detail view
  auth/login/page.tsx     # public login form
  api/
    auth/login/route.ts   # POST -> sets `session` cookie
    <entity>/route.ts     # list (GET) + write (POST/PATCH) endpoints
    <entity>/export/route.ts   # .xlsx export, same filters as list
    members/[id]/related/route.ts  # one member + all related rows
    emails/reply/route.ts # inbound reply webhook (Smartlead)
    query/route.ts        # generic read-only SQL endpoint (SELECT only)
  lib/
    db.ts                 # pool, table names, row types, sortable-column whitelists
    session.ts auth.ts    # JWT create/verify, cookie read
    api-auth.ts           # Bearer key OR session cookie
  _components/            # shared client components
proxy.ts                  # matcher /api/:path* -> 401 unless authorized
migrations/               # node-pg-migrate SQL files
```

## 4. Conventions that matter (keep these in a new app)

- **`app/lib/db.ts` is the single source of truth.** Table names come from env vars
  with defaults; row shapes and *sortable column whitelists* are exported consts.
  Never interpolate a user-supplied column name into SQL — resolve it against the
  whitelist first (`SORT_COLUMNS.includes(raw) ? raw : "id"`).
- **mssql-compatible shim.** Routes use `pool.request().input("name", sql.NVarChar, v).query("... @name ...")`
  and read `result.recordset`. `DbRequest` rewrites `@name` to `$1, $2 …` for `pg`.
  Keep this style for consistency, or drop it deliberately across all routes at once.
- **List endpoint contract** (all entities): query params
  `q, sort, dir(asc|desc), page(1+), pageSize(1–100, default 15)` plus entity-specific
  filters; response `{ data, total, page, pageSize, sort, dir }`. Search uses
  Postgres `ILIKE` with `%term%`.
- **Mixed column casing.** Some tables use PascalCase identifiers (`"VdmaMemberId"`,
  `"Id"`, `"URL"`, `firstName`) and others snake_case. PascalCase/camelCase columns
  **must be double-quoted** in SQL. Aliases normalise them in responses (`"Id" AS id`).
- **Auth.** Single admin user from env (`ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH`,
  bcrypt). Login issues an 8h HS256 JWT in an httpOnly `session` cookie.
  `proxy.ts` guards every `/api/*` path except `/api/auth/login`, accepting either
  the cookie or `Authorization: Bearer <EXTERNAL_API_KEY>`.
- **Writes are column-whitelisted** and upsert-friendly: `leads` POST does
  `ON CONFLICT (email) DO UPDATE` on the provided columns only; PATCH matches on
  `email` and always bumps `updated_at`.
- **Env vars:** `DB_CONNECTION_STRING`, `SESSION_SECRET`, `ADMIN_EMAIL`,
  `ADMIN_PASSWORD_HASH`, `EXTERNAL_API_KEY`, optional `DB_*_TABLE` overrides.
  Never commit real values; `.env.local` / `.env.docker` stay local.

## 5. Database model

Postgres, schema `public`. There are **no declared foreign keys**; relations are by
convention on `vdma_member_id` / `vdma_company_id`, both pointing at
`vdma_members."VdmaMemberId"`. The `leads` / `email_conversations` pair relates by
`email` (natural key), not by member id.

```
vdma_members ("VdmaMemberId")
   │ 1─N  company_linkedin_profiles.vdma_company_id
   │ 1─N  company_technologies.vdma_member_id
   │ 1─N  company_benchmarking_scores.vdma_company_id
   │ 1─N  employee_linkedin_data.vdma_member_id
   
leads.email  1─N  email_conversations.email
```

### 5.1 `vdma_members` (env `DB_TABLE`) — the master entity
Association member companies scraped from the VDMA directory.

| column | type | notes |
|---|---|---|
| `VdmaMemberId` | int | PK, referenced by every enrichment table |
| `Title` | text | member/company display title |
| `Name` | text | contact/company name |
| `Email`, `Phone`, `Website` | text | |
| `Address`, `PostalCode`, `City`, `Country` | text | |
| `CreatedAt` | timestamp | |
| `is_in_blacklist` | int (0/1) | exclude from outreach |

Sortable: `VdmaMemberId, Title, Name, Email, City, Country, PostalCode, CreatedAt`.

### 5.2 `company_linkedin_profiles` (env `DB_COMPANIES_TABLE`)
LinkedIn company enrichment, one or more rows per member.

`Id` (PK, exposed as `id`), `vdma_company_id` (→ member), `linkedin_company_name`,
`linkedin_followers_count` (text), `linkedin_url`, `vdma_name`, `industry`,
`website`, `company_size_approx` (bucket string, multi-select filter),
`headquarters`.

Filters: `q`, `industry` (exact), `headquarters` (exact), `size` (repeatable or
`|`-joined, `IN (...)`).

### 5.3 `company_technologies` (env `DB_TECH_TABLE`)
Wappalyzer-style website technology fingerprint — **very wide table**: one text
column per technology category, value = detected product name(s).

Meta columns: `id` (PK), `vdma_member_id` (→ member), `URL`, `Status` (int HTTP/scan
status), `Message`, `Traffic_rank` (int).

~80 category columns, all `text | null`, enumerated in `TECH_COLUMNS` in
`app/lib/db.ts` — e.g. `Analytics`, `CMS`, `CRM`, `CDN`, `Ecommerce`, `Email`,
`Hosting`, `JavaScript_frameworks`, `Marketing_automation`, `Payment_processors`,
`Programming_languages`, `Operating_systems`, `Live_chat`. **Always import
`TECH_COLUMNS`; never hand-type this list.** Column names contain `_` where the
source category had spaces/slashes.

Sortable: `id, vdma_member_id, URL, Status, Traffic_rank`.

### 5.4 `company_benchmarking_scores` (env `DB_BENCHMARKS_TABLE`)
Website/marketing benchmark of a member against a matched competitor. `Id` (PK),
`vdma_company_id` (→ member), `vdma_name`, `benchmark_company`, `benchmark_url`,
`benchmark_match_strategy` (how the competitor was matched).

Three metric families (all numeric; the `*_present` / `*_has_*` ones are 0/1 flags):

- **Homepage** `benchmark_home_*`: `words_total`, `modules_count`, `video_blocks`,
  `prominent_cta_present`, `newsletter_present`, `blog_present`,
  `resources_present`, `case_study_blocks`, `article_blocks_home`,
  `pdf_downloads_present`, and Lighthouse scores `performance_score`,
  `accessibility_score`, `seo_score`, `best_practices_score`.
- **Product page** `benchmark_product_*`: `url`, `words_total`, `video_blocks`,
  `product_case_blocks`, `product_has_video`, `product_has_case_teaser`,
  `product_has_download`.
- **Sitewide** `benchmark_sitewide_sitewide_has_*` (note the doubled prefix):
  `blog`, `whitepapers`, `webinars`, `case_studies`, `downloads`.

Filters: `q`, `strategy`, `minPerf`, `minSeo`.

### 5.5 `employee_linkedin_data` (env `DB_EMPLOYEES_TABLE`)
Employees/contacts found for a member — the pool leads are drawn from.
camelCase columns, quote them.

`Id` (PK), `vdma_member_id` (→ member), `linkedin_id`, `linkedinUrl`, `firstName`,
`lastName`, `fullName`, `location`, `currentCompany`, `currentTitle`,
`currentCompanyLinkedinUrl`, `currentCompanyId`, `positionStartMonth`,
`positionStartYear`, `tenureAtPositionYears/Months`, `tenureAtCompanyYears/Months`,
`openProfile`, `premium` (loosely typed bool/int/text), `pictureUrl`, `summary`,
`allCurrentPositions` (serialized list).

### 5.6 `leads` (env `DB_LEADS_TABLE`) — outbound pipeline
`email` is the **unique natural key** (`ON CONFLICT (email)`); `id` is the surrogate
PK. `status`, `created_at`, `updated_at` are `NOT NULL` **without DB defaults**, so
inserts must supply them (routes default `status='new'` and `CURRENT_TIMESTAMP`).

`id`, `email`, `first_name`, `last_name`, `company_name`, `current_title`,
`linkedin_url`, `ai_subject`, `ai_body` (AI-generated first-touch copy),
`smartlead_campaign_id`, `smartlead_lead_id`, `added_to_smartlead_at`, `status`,
`is_email_opened`, `is_email_link_clicked`, `is_study_downloaded` (all boolean,
nullable — added by the migrations in `migrations/`), `created_at`, `updated_at`.

Code contracts in `db.ts`: `LEAD_COLUMNS` (all), `LEAD_SORTABLE_COLUMNS`,
`LEAD_IMMUTABLE_COLUMNS` (`id, created_at, updated_at` — never settable from a
payload), `LEAD_BOOLEAN_COLUMNS` (coerced from `1/0/"true"/"yes"…`).

### 5.7 `email_conversations` (env `DB_EMAILS_TABLE`)
Every inbound/outbound message, synced from Smartlead and classified by AI.
Joined to `leads` on `email`.

- Identity/content: `id`, `email` (the lead), `subject`, `body`, `direction`
  (`inbound|outbound`), `status`, `workflow_step`, `thread_id`.
- AI classification: `reply_category`, `reply_confidence` (numeric 0–100),
  `reply_reasoning`.
- Flags: `is_hot_lead`, `is_unsubscribed`, `is_auto_reply` (boolean).
- Scheduling/time: `next_send_date`, `received_at`, `created_at`, `updated_at`.
- Smartlead: `smartlead_campaign_id`, `smartlead_lead_id`,
  `smartlead_email_account_id`, `smartlead_sequence_step`, `smartlead_message_id`,
  `smartlead_webhook_event`, `smartlead_raw_payload` (full JSON as text).
- Participants: `sender_email`, `sender_name`, `recipient_email`, `recipient_name`,
  `cc_recipients`, `bcc_recipients`.
- Engagement: `email_opened_count`, `email_clicked_count`, `last_opened_at`,
  `last_clicked_at`.
- Ops: `tags`, `notes`, `processing_status`, `processing_error`, `processed_at`.

Filters: `q`, `direction`, `status`, `replyCategory`, `hotLead`, `unsubscribed`.

## 6. Typical queries

```sql
-- Full profile of one member
SELECT * FROM vdma_members WHERE "VdmaMemberId" = $1;
SELECT * FROM company_linkedin_profiles     WHERE vdma_company_id = $1;
SELECT * FROM company_technologies          WHERE vdma_member_id  = $1;
SELECT * FROM company_benchmarking_scores   WHERE vdma_company_id = $1;
SELECT * FROM employee_linkedin_data        WHERE vdma_member_id  = $1;

-- Lead with its whole conversation
SELECT l.*, c.*
FROM leads l
LEFT JOIN email_conversations c ON c.email = l.email
WHERE l.email = $1
ORDER BY c.received_at NULLS LAST;

-- Members that are contactable
SELECT * FROM vdma_members
WHERE COALESCE(is_in_blacklist, 0) = 0 AND "Email" IS NOT NULL;
```

## 7. Rules for a new app on this database

1. **Read-mostly on the enrichment tables.** `vdma_members`,
   `company_linkedin_profiles`, `company_technologies`,
   `company_benchmarking_scores`, `employee_linkedin_data` are produced by external
   pipelines — do not write to or restructure them.
2. `leads` and `email_conversations` are shared *write* surfaces. Another service
   (Smartlead sync, n8n) writes to them concurrently: upsert on the natural key
   (`leads.email`), never assume you own a row, and don't renumber ids.
3. **Add, never repurpose.** Need new state? Add a nullable column via a migration in
   `migrations/` (see the two existing files for the style) or a new table keyed on
   `vdma_member_id` / `email`. Never change the meaning or type of an existing
   column — the other app still reads it.
4. Respect `is_in_blacklist` and `is_unsubscribed` in anything outbound.
5. Copy the safety patterns: whitelisted sort columns, parameterized values,
   `pageSize` cap, `/api/query` restricted to `SELECT`, `proxy.ts` guarding all API
   routes.
6. Keep table names env-configurable so the new app can point at a copy of the
   database without code changes.
