"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  FLEET_FINANCIAL_STATUSES,
  FLEET_FINANCIAL_STATUS_LABELS,
} from "@/lib/domain/fleet";

export type FinancialStatus = (typeof FLEET_FINANCIAL_STATUSES)[number];
type ProviderLink = { providerId: string; providerName: string };

export function FleetProviderFilter({ freights, value, onChange }: {
  freights: readonly { providerServices?: readonly ProviderLink[] }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const providers = new Map<string, string>();
  for (const freight of freights) {
    for (const provider of freight.providerServices ?? []) {
      providers.set(provider.providerId, provider.providerName);
    }
  }
  const options = [...providers].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));

  return <label>
    <span>Prestador</span>
    <select value={value} onChange={event => onChange(event.target.value)}>
      <option value="">Todos</option>
      {value && !providers.has(value) && <option value={value}>Sem fretes no período</option>}
      {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </select>
  </label>;
}

function FleetFilterDropdown({ label, summary, children }: {
  label: string;
  summary: string;
  children: ReactNode;
}) {
  const labelId = useId();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (menu.current?.open && event.target instanceof Node && !menu.current.contains(event.target)) {
        menu.current.open = false;
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  return <div className="fleet-financial-filter field">
    <span id={labelId}>{label}</span>
    <details ref={menu} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
    }} onKeyDown={event => {
      if (event.key === "Escape" && event.currentTarget.open) {
        event.preventDefault();
        event.currentTarget.open = false;
        event.currentTarget.querySelector("summary")?.focus();
      }
    }}>
      <summary title={summary} aria-labelledby={labelId + " " + labelId + "-value"}>
        <span id={labelId + "-value"}>{summary}</span>
      </summary>
      <div className="fleet-financial-options" role="group" aria-labelledby={labelId}>{children}</div>
    </details>
  </div>;
}

export function FleetOperationalFilter({ value, onChange, options }: {
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return <FleetFilterDropdown label="Status" summary={options.find(option => option.value === value)?.label ?? "Todos"}>
    {[{ value: "", label: "Todos" }, ...options].map(option =>
      <button type="button" key={option.value} aria-pressed={value === option.value} onClick={event => {
        onChange(option.value);
        const details = event.currentTarget.closest("details");
        if (details) {
          details.open = false;
          details.querySelector("summary")?.focus();
        }
      }}>{option.label}</button>,
    )}
  </FleetFilterDropdown>;
}

export function FleetFinancialFilter({ value, onChange }: {
  value: FinancialStatus[];
  onChange: (value: FinancialStatus[]) => void;
}) {
  const all = value.length === 0;
  const selectedLabel = all ? "Todas" : value.map(status => FLEET_FINANCIAL_STATUS_LABELS[status]).join(", ");
  return <FleetFilterDropdown label="Situação financeira" summary={selectedLabel}>
    <label><input type="checkbox" checked={all} onChange={() => onChange([])} /> Todas</label>
    {FLEET_FINANCIAL_STATUSES.map(status => <label key={status}>
      <input type="checkbox" checked={value.includes(status)} onChange={event => onChange(
        event.target.checked ? [...value, status] : value.filter(item => item !== status),
      )} /> {FLEET_FINANCIAL_STATUS_LABELS[status]}
    </label>)}
  </FleetFilterDropdown>;
}
