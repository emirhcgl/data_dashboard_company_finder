# Data Availability

This page explains the filters in the Data availability section:

- Employee data scraped
- Company e-mail contact known
- Employee contact known
- Website benchmarked

The app does not scrape this data during filtering. It reads already-collected data from the shared PostgreSQL database and turns it into boolean flags in `app/models/targets.ts`.

## Employee data scraped

UI label: `Employee data scraped`

Filter param: `hasEmployees`

Target row field: `has_employee_data`

Source table: `employee_linkedin_data`

How it is calculated:

```sql
has_employee_data = employee_count > 0
```

`employee_count` is calculated in `EMPLOYEE_COUNT_CTE` in `app/models/employees.ts`.
The app groups rows from `employee_linkedin_data` by `vdma_member_id`.

If at least one employee row exists for the VDMA member, the company is treated as having scraped employee data.

## Company e-mail contact known

UI label: `Company e-mail contact known`

Filter param: `hasEmail`

Target row field: `has_email_contact`

Source tables:

- `vdma_members`
- `employee_linkedin_data`

How it is calculated:

```sql
has_email_contact = company_email IS NOT NULL OR employee_email_count > 0
```

`company_email` comes from `vdma_members."Email"` after trimming and normalizing.

`employee_email_count` comes from `employee_linkedin_data.email`. It counts employee rows for the same `vdma_member_id` where `email` is present and not blank.

The field `email_source` explains where the contact came from:

- `member`: e-mail exists on the VDMA member row
- `employee`: at least one scraped employee e-mail exists
- `member+employee`: both sources exist

## Employee contact known

UI label: `Employee contact known`

Filter param: `hasEmployeeEmail`

Target row field: `has_employee_email_contact`

Source table: `employee_linkedin_data`

How it is calculated:

```sql
has_employee_email_contact = employee_email_count > 0
```

`employee_email_count` counts employee rows for the same `vdma_member_id` where `email` is present and not blank.

This is different from `Employee data scraped`: a company can have scraped employee profiles but no employee e-mail addresses.

## Website benchmarked

UI label: `Website benchmarked`

Filter param: `hasBenchmark`

Target row field: `has_benchmark`

Source table: `company_benchmarking_scores`

How it is calculated:

```sql
has_benchmark = benchmark_id IS NOT NULL
```

The app uses `BENCHMARK_LATEST_CTE` in `app/models/benchmarks.ts` to select the newest benchmark row per `vdma_company_id`.

If a benchmark row exists for the company, the target row exposes benchmark fields such as:

- `benchmark_url`
- `benchmark_product_url`
- `benchmark_home_performance_score`
- `benchmark_home_seo_score`
- `benchmark_home_accessibility_score`
- `benchmark_home_best_practices_score`

## Filter behavior

Each filter is tri-state:

- `Any`: do not add a SQL condition
- `Yes`: require the flag to be true
- `No`: require the flag to be false

In SQL this is applied in `buildWhere()` in `app/models/targets.ts`.

Examples:

```sql
hasEmployees=1       -> t.has_employee_data
hasEmployees=0       -> NOT (t.has_employee_data)
hasBenchmark=1       -> t.has_benchmark
hasBenchmark=0       -> NOT (t.has_benchmark)
```

All active filters are combined with `AND`.
