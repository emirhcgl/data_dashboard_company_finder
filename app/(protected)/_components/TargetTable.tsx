"use client";

import { ApiTargetRow } from "./filter-state";

type Column = {
  key: string;
  label: string;
  sortable?: boolean;
  align?: "left" | "right";
  render: (row: ApiTargetRow) => React.ReactNode;
};

function Badge({
  on,
  label,
  tone = "blue",
}: {
  on: boolean;
  label: string;
  tone?: "blue" | "green" | "red" | "amber";
}) {
  if (!on) return null;

  const tones = {
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    green: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  };

  return (
    <span
      className={`mr-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${tones[tone]}`}
    >
      {label}
    </span>
  );
}

const num = (value: number | null | undefined) =>
  value === null || value === undefined ? "-" : Number(value).toLocaleString();

const COLUMNS: Column[] = [
  {
    key: "score",
    label: "Score",
    sortable: true,
    align: "right",
    render: (row) => (
      <span
        title={(row.score_breakdown?.components ?? [])
          .map((c) => `${c.label}: ${c.points} / ${c.weight}`)
          .join("\n")}
        className="font-semibold"
      >
        {row.score}
      </span>
    ),
  },
  {
    key: "company_name",
    label: "Company",
    sortable: true,
    render: (row) => (
      <div className="min-w-[14rem]">
        <span className="font-medium">{row.company_name ?? "-"}</span>

        {row.website && (
          <a
            href={row.website.startsWith("http") ? row.website : `https://${row.website}`}
            target="_blank"
            rel="noreferrer"
            className="ml-2 text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            {row.company_domain ?? "website"}
          </a>
        )}

        {row.is_in_blacklist ? (
          <Badge on label="blacklisted" tone="red" />
        ) : null}
      </div>
    ),
  },
  {
    key: "industry",
    label: "Industry",
    sortable: true,
    render: (row) => (
      <span className="block max-w-[12rem] truncate" title={row.industry ?? ""}>
        {row.industry ?? "-"}
      </span>
    ),
  },
  {
    key: "state_code",
    label: "State / city",
    sortable: true,
    render: (row) => (
      <span className="whitespace-nowrap">
        {row.state ?? "Unknown"}
        <span className="block text-xs text-zinc-400">{row.city ?? "-"}</span>
      </span>
    ),
  },
  {
    key: "company_size_approx",
    label: "LinkedIn size",
    sortable: true,
    render: (row) => (
      <span className="whitespace-nowrap">{row.company_size_approx ?? "-"}</span>
    ),
  },
  {
    key: "employee_count",
    label: "People",
    sortable: true,
    align: "right",
    render: (row) => num(row.employee_count),
  },
  {
    key: "linkedin_followers_numeric",
    label: "Followers",
    sortable: true,
    align: "right",
    render: (row) => num(row.linkedin_followers_numeric),
  },
  {
    key: "benchmark_home_performance_score",
    label: "Perf / SEO",
    sortable: true,
    align: "right",
    render: (row) =>
      row.has_benchmark
        ? `${num(row.benchmark_home_performance_score)} / ${num(row.benchmark_home_seo_score)}`
        : "-",
  },
  {
    key: "contact_status",
    label: "Contact status",
    render: (row) => (
      <div className="min-w-[12rem]">
        {!row.contacted_before && (
          <span className="text-xs text-zinc-400">not contacted</span>
        )}

        <Badge on={row.email_sent} label={`sent ${row.emails_sent}`} />
        <Badge on={row.is_email_opened} label="opened" tone="amber" />
        <Badge on={row.is_email_link_clicked} label="clicked" tone="amber" />
        <Badge on={row.is_study_downloaded} label="study" tone="amber" />
        <Badge on={row.has_replied} label={`replies ${row.replies}`} tone="green" />
        <Badge on={row.is_hot_lead} label="hot" tone="green" />
        <Badge on={row.is_unsubscribed} label="unsubscribed" tone="red" />

        {row.lead_status && (
          <span className="block text-[10px] text-zinc-400">
            lead: {row.lead_status} ({row.outreach_match} match)
          </span>
        )}
      </div>
    ),
  },
  {
    key: "crm",
    label: "CRM",
    render: (row) => {
      if (!row.crm_available)
        return <span className="text-xs text-zinc-400">n/a</span>;

      if (!row.in_crm)
        return <span className="text-xs text-zinc-400">not in CRM</span>;

      return (
        <span className="text-xs">
          {row.crm?.crm_url ? (
            <a
              href={row.crm.crm_url}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              {row.crm.crm_name ?? "open"}
            </a>
          ) : (
            (row.crm?.crm_name ?? "in CRM")
          )}

          {row.crm?.crm_stage && (
            <span className="block text-[10px] text-zinc-400">
              {row.crm.crm_stage}
            </span>
          )}
        </span>
      );
    },
  },
  {
    key: "top_contacts",
    label: "Top contacts",
    render: (row) => (
      <div className="min-w-[14rem] text-xs">
        {(row.top_contacts ?? []).length === 0 && (
          <span className="text-zinc-400">-</span>
        )}

        {(row.top_contacts ?? []).map((contact, i) => (
          <span key={i} className="block truncate">
            {contact.linkedin_url ? (
              <a
                href={contact.linkedin_url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                {contact.full_name}
              </a>
            ) : (
              contact.full_name
            )}

            {contact.current_title ? ` - ${contact.current_title}` : ""}
          </span>
        ))}
      </div>
    ),
  },
];

export default function TargetTable({
  rows,
  loading,
  sort,
  dir,
  onSort,
  onSelect,
}: {
  rows: ApiTargetRow[];
  loading: boolean;
  sort: string;
  dir: string;
  onSort: (key: string) => void;
  onSelect: (row: ApiTargetRow) => void;
}) {
  return (
    <div className="relative overflow-x-auto">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/60 pt-10 dark:bg-zinc-950/60">
          <span className="text-sm text-zinc-500">Loading...</span>
        </div>
      )}

      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-900">
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                className={`border-b border-zinc-200 px-3 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:border-zinc-800 ${
                  column.align === "right" ? "text-right" : "text-left"
                } ${column.sortable ? "cursor-pointer select-none" : ""}`}
                onClick={column.sortable ? () => onSort(column.key) : undefined}
              >
                {column.label}

                {sort === column.key && (
                  <span className="ml-1">{dir === "desc" ? "▼" : "▲"}</span>
                )}
              </th>
            ))}

            <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800" />
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 && !loading && (
            <tr>
              <td
                colSpan={COLUMNS.length + 1}
                className="px-3 py-10 text-center text-sm text-zinc-400"
              >
                No companies match these filters.
              </td>
            </tr>
          )}

          {rows.map((row) => (
            <tr
              key={row.vdma_member_id}
              className="border-b border-zinc-100 align-top hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900/60"
            >
              {COLUMNS.map((column) => (
                <td
                  key={column.key}
                  className={`px-3 py-2 ${column.align === "right" ? "text-right" : ""}`}
                >
                  {column.render(row)}
                </td>
              ))}

              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  onClick={() => onSelect(row)}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Details
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
