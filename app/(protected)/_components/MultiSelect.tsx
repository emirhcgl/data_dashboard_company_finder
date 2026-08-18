"use client";

import { useMemo, useRef, useState, useEffect } from "react";

export type Option = { value: string; label: string };

export default function MultiSelect({
  label,
  options,
  selected,
  onChange,
  searchable = true,
  placeholder = "Any",
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
  searchable?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);

    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = needle
      ? options.filter((o) => o.label.toLowerCase().includes(needle))
      : options;

    return filtered.slice(0, 300);
  }, [options, query]);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  return (
    <div className="relative" ref={containerRef}>
      <span className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </span>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-left text-sm text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
      >
        <span className="truncate">
          {selected.length === 0
            ? placeholder
            : selected.length === 1
              ? (options.find((o) => o.value === selected[0])?.label ??
                selected[0])
              : `${selected.length} selected`}
        </span>

        <span className="ml-2 text-zinc-400">▾</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {searchable && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full border-b border-zinc-200 bg-transparent px-2 py-1.5 text-sm outline-none dark:border-zinc-700"
            />
          )}

          <div className="max-h-56 overflow-y-auto py-1">
            {visible.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-zinc-400">No options</p>
            )}

            {visible.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={() => toggle(option.value)}
                />

                <span className="truncate">{option.label}</span>
              </label>
            ))}
          </div>

          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full border-t border-zinc-200 px-2 py-1.5 text-left text-xs text-blue-600 dark:border-zinc-700 dark:text-blue-400"
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}
