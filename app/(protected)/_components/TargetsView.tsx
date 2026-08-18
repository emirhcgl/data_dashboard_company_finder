"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FilterRail from "./FilterRail";
import TargetTable from "./TargetTable";
import TargetDetail from "./TargetDetail";
import {
  ApiTargetRow,
  EMPTY_FILTERS,
  FilterOptions,
  FilterState,
  TargetsResponse,
  countActiveFilters,
  toSearchParams,
} from "./filter-state";

const DEBOUNCE_MS = 350;

export default function TargetsView() {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [rows, setRows] = useState<ApiTargetRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState("score");
  const [dir, setDir] = useState("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  const requestId = useRef(0);

  useEffect(() => {
    fetch("/api/filters")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(setOptions)
      .catch(() => setOptions(null));
  }, []);

  const query = useMemo(
    () =>
      toSearchParams(filters, { page, pageSize, sort, dir }).toString(),
    [filters, page, pageSize, sort, dir],
  );

  useEffect(() => {
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      setLoading(true);

      fetch(`/api/targets?${query}`)
        .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
        .then((body: TargetsResponse) => {
          if (id !== requestId.current) return;

          setRows(body.data);
          setTotal(body.total);
          setError("");
          setNotice(
            body.crm_filter_applied_in_memory && body.scan_truncated
              ? "CRM filter applied to the first 2000 matching rows only - narrow the other filters for exact counts."
              : "",
          );
        })
        .catch(() => {
          if (id !== requestId.current) return;
          setError("Could not load targets.");
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  const patch = useCallback((next: Partial<FilterState>) => {
    setFilters((current) => ({ ...current, ...next }));
    setPage(1);
  }, []);

  const onSort = (key: string) => {
    if (key === sort) {
      setDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSort(key);
      setDir(key === "score" ? "desc" : "asc");
    }

    setPage(1);
  };

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const activeFilters = countActiveFilters(filters);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-zinc-200 px-4 dark:border-zinc-800">
        <div>
          <h1 className="text-base font-semibold">Company Targeting</h1>

          <p className="text-xs text-zinc-500">
            {loading ? "Loading..." : `${total.toLocaleString()} companies match`}
            {activeFilters > 0 && ` - ${activeFilters} filter(s) active`}
          </p>
        </div>

        <a
          href={`/api/targets/export?${toSearchParams(filters, { sort, dir }).toString()}`}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Download list (.xlsx)
        </a>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        <FilterRail
          filters={filters}
          options={options}
          onChange={patch}
          onReset={() => {
            setFilters(EMPTY_FILTERS);
            setPage(1);
          }}
        />

        <main className="min-w-0 flex-1">
          {error && (
            <p className="m-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          )}

          {notice && (
            <p className="m-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              {notice}
            </p>
          )}

          <TargetTable
            rows={rows}
            loading={loading}
            sort={sort}
            dir={dir}
            onSort={onSort}
            onSelect={(row) => setSelected(row.vdma_member_id)}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">Rows per page</span>

              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800"
              >
                {[25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-zinc-300 px-2 py-1 disabled:opacity-40 dark:border-zinc-700"
              >
                Previous
              </button>

              <span className="text-zinc-500">
                Page {page} of {pages}
              </span>

              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                className="rounded-md border border-zinc-300 px-2 py-1 disabled:opacity-40 dark:border-zinc-700"
              >
                Next
              </button>
            </div>
          </div>
        </main>
      </div>

      {selected !== null && (
        <TargetDetail memberId={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
