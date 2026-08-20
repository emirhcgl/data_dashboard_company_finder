"use client";

import MultiSelect from "./MultiSelect";
import { CRM_FLAGS } from "@/app/models/crm-flags";
import TriStateSelect from "./TriStateSelect";
import { FilterOptions, FilterState } from "./filter-state";

export default function FilterRail({
  filters,
  options,
  onChange,
  onReset,
}: {
  filters: FilterState;
  options: FilterOptions | null;
  onChange: (patch: Partial<FilterState>) => void;
  onReset: () => void;
}) {
  const opts = (values: string[]) =>
    values.map((value) => ({ value, label: value }));

  return (
    <aside className="w-full shrink-0 space-y-5 overflow-y-auto border-b border-zinc-200 bg-zinc-50 p-4 lg:h-[calc(100vh-4rem)] lg:w-80 lg:border-r lg:border-b-0 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          Filters
        </h2>

        <button
          type="button"
          onClick={onReset}
          className="text-xs text-blue-600 hover:underline dark:text-blue-400"
        >
          Reset
        </button>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Search (company, website, industry, city)
        </span>

        <input
          value={filters.q}
          onChange={(e) => onChange({ q: e.target.value })}
          placeholder="e.g. Maschinenbau"
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
        />
      </label>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
          Firmographics
        </h3>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Employees min
            </span>

            <input
              type="number"
              min={0}
              value={filters.empMin}
              onChange={(e) => onChange({ empMin: e.target.value })}
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Employees max
            </span>

            <input
              type="number"
              min={0}
              value={filters.empMax}
              onChange={(e) => onChange({ empMax: e.target.value })}
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
            />
          </label>
        </div>

        <MultiSelect
          label="LinkedIn size bucket"
          options={opts(options?.sizes ?? [])}
          selected={filters.size}
          onChange={(size) => onChange({ size })}
        />

        <MultiSelect
          label="Industry"
          options={opts(options?.industries ?? [])}
          selected={filters.industry}
          onChange={(industry) => onChange({ industry })}
        />

        <MultiSelect
          label="State (Bundesland)"
          options={(options?.states ?? []).map((s) => ({
            value: s.code,
            label: s.name,
          }))}
          selected={filters.state}
          onChange={(state) => onChange({ state })}
        />

        <MultiSelect
          label="City"
          options={opts(options?.cities ?? [])}
          selected={filters.city}
          onChange={(city) => onChange({ city })}
        />

        <MultiSelect
          label="Country"
          options={opts(options?.countries ?? [])}
          selected={filters.country}
          onChange={(country) => onChange({ country })}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
          Data availability
        </h3>

        <TriStateSelect
          label="Employee data scraped"
          value={filters.hasEmployees}
          onChange={(hasEmployees) => onChange({ hasEmployees })}
        />

        <TriStateSelect
          label="Company e-mail contact known"
          value={filters.hasEmail}
          onChange={(hasEmail) => onChange({ hasEmail })}
        />

        <TriStateSelect
          label="Employee contact known"
          value={filters.hasEmployeeEmail}
          onChange={(hasEmployeeEmail) => onChange({ hasEmployeeEmail })}
        />

        <TriStateSelect
          label="Website benchmarked"
          value={filters.hasBenchmark}
          onChange={(hasBenchmark) => onChange({ hasBenchmark })}
        />

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Min performance
            </span>

            <input
              type="number"
              min={0}
              max={100}
              value={filters.minPerf}
              onChange={(e) => onChange({ minPerf: e.target.value })}
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Min SEO
            </span>

            <input
              type="number"
              min={0}
              max={100}
              value={filters.minSeo}
              onChange={(e) => onChange({ minSeo: e.target.value })}
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
            />
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
          Contact status
        </h3>

        <TriStateSelect
          label="Contacted before"
          value={filters.contacted}
          onChange={(contacted) => onChange({ contacted })}
        />

        <TriStateSelect
          label="E-mail sent"
          value={filters.emailSent}
          onChange={(emailSent) => onChange({ emailSent })}
        />

        <TriStateSelect
          label="Opened"
          value={filters.opened}
          onChange={(opened) => onChange({ opened })}
        />

        <TriStateSelect
          label="Clicked"
          value={filters.clicked}
          onChange={(clicked) => onChange({ clicked })}
        />

        <TriStateSelect
          label="Study downloaded"
          value={filters.studyDownloaded}
          onChange={(studyDownloaded) => onChange({ studyDownloaded })}
        />

        <TriStateSelect
          label="Replied"
          value={filters.replied}
          onChange={(replied) => onChange({ replied })}
        />

        <TriStateSelect
          label="Hot lead"
          value={filters.hotLead}
          onChange={(hotLead) => onChange({ hotLead })}
        />

        <TriStateSelect
          label="Unsubscribed"
          value={filters.unsubscribed}
          onChange={(unsubscribed) => onChange({ unsubscribed })}
        />

        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={filters.includeBlacklisted}
            onChange={(e) =>
              onChange({ includeBlacklisted: e.target.checked })
            }
          />
          Include blacklisted companies
        </label>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
          CRM (Twenty)
        </h3>

        {options && !options.crmAvailable ? (
          <p className="text-xs text-zinc-400">
            CRM not configured - set TWENTY_API_URL and TWENTY_API_KEY to enable.
          </p>
        ) : (
          <>
            <TriStateSelect
              label="Already in CRM"
              value={filters.inCrm}
              onChange={(inCrm) => onChange({ inCrm })}
            />

            {CRM_FLAGS.map((flag) => (
              <TriStateSelect
                key={flag.key}
                label={`CRM: ${flag.label}`}
                value={filters[`crm_${flag.key}`]}
                onChange={(value) => onChange({ [`crm_${flag.key}`]: value })}
              />
            ))}

            <p className="text-[11px] leading-snug text-zinc-400">
              CRM contacts are matched on the VDMA member id. A CRM filter is
              resolved against the CRM first and then applied inside the query,
              so counts are exact — widely used flags take a few seconds longer.
            </p>
          </>
        )}
      </section>
    </aside>
  );
}
