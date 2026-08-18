"use client";

export type TriState = "" | "1" | "0";

export default function TriStateSelect({
  label,
  value,
  onChange,
  yesLabel = "Yes",
  noLabel = "No",
}: {
  label: string;
  value: TriState;
  onChange: (value: TriState) => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </span>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TriState)}
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
      >
        <option value="">Any</option>
        <option value="1">{yesLabel}</option>
        <option value="0">{noLabel}</option>
      </select>
    </label>
  );
}
