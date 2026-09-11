"use client";

import { useState } from "react";
import { Field } from "@/components/ui";
import { apiMutation } from "@/components/use-api";
import type { FleetData } from "@/lib/domain/fleet";
import { decimalValue } from "@/lib/domain/number-input";
import { competencyLabel, formatMoney, moneyInputToCents } from "@/lib/format";

export function formatFleetRate(cents: number | null) {
  return cents === null
    ? "Sem dados na Base"
    : `${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 6 })} R$/km`;
}

const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function FleetParametersPanel({ fleet, onSaved }: { fleet: FleetData; onSaved: (message: string) => void }) {
  const { parameters } = fleet;
  const [vehicleId, setVehicleId] = useState(fleet.vehicles[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const vehicle = fleet.vehicles.find((item) => item.id === vehicleId);

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
          <p>Esses parâmetros são independentes da Base de custo por placa.</p>
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

    <section className="panel table-panel">
      <header className="fleet-panel-header">
        <div>
          <span className="eyebrow">Base</span>
          <h2>Dados da Base por placa</h2>
          <p>Consulta dos dados já cadastrados. O rateio usa somente esta Base.</p>
        </div>
      </header>
      <div className="responsive-table"><table>
        <thead><tr><th>Placa</th><th>Meses na Base</th><th>Custo médio por km</th><th>Base</th></tr></thead>
        <tbody>
          {fleet.vehicles.map((item) => <tr key={item.id}>
            <td data-label="Placa"><strong>{item.plate}</strong></td>
            <td data-label="Meses na Base">{item.costs.length}</td>
            <td data-label="Custo médio por km"><strong>{formatFleetRate(item.averageCostPerKmCents)}</strong></td>
            <td data-label="Base"><button type="button" className="button secondary compact-button" onClick={() => setVehicleId(item.id)}>Ver dados</button></td>
          </tr>)}
          {!fleet.vehicles.length && <tr><td colSpan={4} className="empty-cell">Nenhum veículo cadastrado.</td></tr>}
        </tbody>
      </table></div>
    </section>

    {vehicle && <section className="panel fleet-settings-panel">
      <header>
        <div>
          <span className="eyebrow">Base</span>
          <h2>{vehicle.plate}</h2>
          <p>Dados mensais usados para formar o custo médio por km da placa.</p>
        </div>
      </header>
      <Field label="Veículo"><select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>{fleet.vehicles.map((item) => <option key={item.id} value={item.id}>{item.plate}</option>)}</select></Field>
      <div className="responsive-table"><table>
        <thead><tr><th>Mês</th><th>KM no mês</th><th>Custo do mês</th><th>Custo/km</th><th>Na média</th></tr></thead>
        <tbody>
          {vehicle.costs.map((cost) => <tr key={cost.id}>
            <td data-label="Mês">{competencyLabel(cost.competency)}</td>
            <td data-label="KM no mês">{(cost.distanceMeters / 1000).toLocaleString("pt-BR")}</td>
            <td data-label="Custo do mês">{formatMoney(cost.monthlyCostCents)}</td>
            <td data-label="Custo/km">{formatFleetRate(cost.costPerKmCents)}</td>
            <td data-label="Na média">{cost.includeInRateAverage ? "Sim" : "Não"}</td>
          </tr>)}
          {!vehicle.costs.length && <tr><td colSpan={5} className="empty-cell">Sem dados da Base para esta placa.</td></tr>}
        </tbody>
      </table></div>
    </section>}

    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
