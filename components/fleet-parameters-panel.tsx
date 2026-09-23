"use client";

import { useState } from "react";
import { Field } from "@/components/ui";
import { apiMutation } from "@/components/use-api";
import type { FleetData } from "@/lib/domain/fleet";
import { decimalValue } from "@/lib/domain/number-input";
import { moneyInputToCents } from "@/lib/format";

const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function FleetParametersPanel({ fleet, onSaved }: { fleet: FleetData; onSaved: (message: string) => void }) {
  const { parameters } = fleet;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function saveParameters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await apiMutation("/api/fleet/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...parameters,
          fuelPriceCents: moneyInputToCents(form.get("fuelPrice")),
          averageConsumptionMilliKmPerLiter: Math.round(
            decimalValue(form.get("consumption"), "Consumo médio") * 1000,
          ),
          matchWindowDays: decimalValue(form.get("matchWindowDays"), "Janela de encaixe"),
        }),
      });
      onSaved("Parâmetros atualizados.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar parâmetros.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="fleet-stack">
    <section className="panel fleet-settings-panel">
      <header>
        <div>
          <span className="eyebrow">Parâmetros operacionais</span>
          <h2>Combustível e operação</h2>
          <p>Usados somente para estimar diesel de fretes avulsos que ainda não possuem o custo realizado.</p>
        </div>
      </header>
      <form className="form-stack" onSubmit={saveParameters}>
        <div className="form-grid three">
          <Field label="Combustível (R$/litro)"><input name="fuelPrice" defaultValue={centsToInput(parameters.fuelPriceCents)} inputMode="decimal" disabled={!fleet.canManage || busy} required /></Field>
          <Field label="Consumo médio (km/l)"><input name="consumption" defaultValue={String(parameters.averageConsumptionMilliKmPerLiter / 1000).replace(".", ",")} inputMode="decimal" disabled={!fleet.canManage || busy} required /></Field>
          <Field label="Janela de encaixe (dias)"><input name="matchWindowDays" type="number" min="0" max="90" defaultValue={parameters.matchWindowDays} disabled={!fleet.canManage || busy} required /></Field>
        </div>
        {fleet.canManage && <div className="fleet-settings-actions"><button className="button primary" disabled={busy}>Salvar parâmetros</button></div>}
      </form>
    </section>

    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
