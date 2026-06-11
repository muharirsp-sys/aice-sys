"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { input } from "@/lib/ui";

export type ComboOption = { value: number; label: string; hint?: string };

// Combobox bisa diketik untuk memilih dari daftar panjang (mempercepat taking order).
// value 0 = belum dipilih.
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "— Pilih —",
  searchPlaceholder = "Ketik untuk mencari...",
  invalid = false,
  emptyText = "Tidak ada hasil.",
}: {
  options: ComboOption[];
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  invalid?: boolean;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(s) ||
        (o.hint ?? "").toLowerCase().includes(s)
    );
  }, [options, q]);

  // Tutup saat klik di luar.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQ("");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Fokus ke search saat dibuka.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function pick(v: number) {
    onChange(v);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${input} flex items-center justify-between gap-2 text-left ${
          invalid ? "border-critical" : ""
        } ${selected ? "" : "text-muted-foreground"}`}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          <div className="relative border-b">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-10 w-full bg-transparent pl-8 pr-3 text-sm outline-none"
            />
          </div>
          <ul role="listbox" id={listId} className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-center text-sm text-muted-foreground">
                {emptyText}
              </li>
            ) : (
              filtered.map((o) => {
                const active = o.value === value;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => pick(o.value)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${
                        active ? "bg-muted font-semibold" : ""
                      }`}
                    >
                      <span className="truncate">
                        {o.label}
                        {o.hint && (
                          <span className="ml-1 text-muted-foreground">{o.hint}</span>
                        )}
                      </span>
                      {active && <Check className="size-4 shrink-0 text-primary" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
