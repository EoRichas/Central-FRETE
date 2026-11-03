"use client";

import { useId } from "react";
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

export function FleetFinancialFilter({ value, onChange }: {
  value: FinancialStatus[];
  onChange: (value: FinancialStatus[]) => void;
}) {
  const labelId = useId();
  const all = value.length === 0;
  const selectedLabel = all ? "Todas" : value.map(status => FLEET_FINANCIAL_STATUS_LABELS[status]).join(", ");
  return <div className="fleet-financial-filter field">
    <span id={labelId}>Situação financeira</span>
    <details>
      <summary title={selectedLabel} aria-labelledby={labelId + " " + labelId + "-value"}>
        <span id={labelId + "-value"}>{selectedLabel}</span>
      </summary>
      <div className="fleet-financial-options" role="group" aria-labelledby={labelId}>
        <label><input type="checkbox" checked={all} onChange={() => onChange([])} /> Todas</label>
        {FLEET_FINANCIAL_STATUSES.map(status => <label key={status}>
          <input type="checkbox" checked={value.includes(status)} onChange={event => onChange(
            event.target.checked ? [...value, status] : value.filter(item => item !== status),
          )} /> {FLEET_FINANCIAL_STATUS_LABELS[status]}
        </label>)}
      </div>
    </details>
  </div>;
}
