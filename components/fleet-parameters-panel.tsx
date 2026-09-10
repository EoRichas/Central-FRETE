"use client";

import { useState } from "react";
import { Field } from "@/components/ui";
import { apiMutation } from "@/components/use-api";
import { currentCompetency } from "@/lib/domain/dates";
import type { FleetData, FleetVehicleCost } from "@/lib/domain/fleet";
import { decimalValue, distanceInputToMeters, distanceToInput } from "@/lib/domain/number-input";
import { competencyLabel, formatMoney, moneyInputToCents } from "@/lib/format";

export function formatFleetRate(cents: number | null) {
  return cents === null ? "Base pendente" : `${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 6 })} R$/km`;
}

const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function FleetParametersPanel({ fleet, onSaved }: { fleet: FleetData; onSaved: (message: string) => void }) {
  const { parameters } = fleet;
  const [vehicleId, setVehicleId] = useState(fleet.vehicles[0]?.id ?? "");
  const [editing, setEditing] = useState<FleetVehicleCost | null>(null);
  const [competency, setCompetency] = useState(currentCompetency);
  const [distance, setDistance] = useState("");
  const [monthlyCost, setMonthlyCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const vehicle = fleet.vehicles.find((item) => item.id === vehicleId);

  function clearHistoryForm() {
    setEditing(null); setCompetency(currentCompetency()); setDistance(""); setMonthlyCost("");
  }
  function editHistory(cost: FleetVehicleCost) {
    setEditing(cost); setCompetency(cost.competency);
    setDistance(distanceToInput(cost.distanceMeters)); setMonthlyCost(centsToInput(cost.monthlyCostCents));
  }
  async function saveParameters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await apiMutation("/api/fleet/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        ...parameters,
        fuelPriceCents: moneyInputToCents(form.get("fuelPrice")),
        averageConsumptionMilliKmPerLiter: Math.round(decimalValue(form.get("consumption"), "Consumo médio") * 1000),
        matchWindowDays: decimalValue(form.get("matchWindowDays"), "Janela de encaixe"),
      }) });
      onSaved("Parâmetros atualizados.");
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao salvar parâmetros."); }
    finally { setBusy(false); }
  }
  async function saveHistory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await apiMutation(editing ? `/api/fleet/vehicle-costs/${editing.id}` : "/api/fleet/vehicle-costs", {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId, competency, distanceMeters: distanceInputToMeters(distance), monthlyCostCents: moneyInputToCents(monthlyCost) }),
      });
      clearHistoryForm(); onSaved("Histórico salvo. A média por km da placa e os fretes foram recalculados.");
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao salvar histórico."); }
    finally { setBusy(false); }
  }
  async function deleteHistory(cost: FleetVehicleCost) {
    if (!window.confirm(`Excluir a base de ${competencyLabel(cost.competency)} da placa ${vehicle?.plate}? A média por km será recalculada.`)) return;
    setBusy(true); setError("");
    try {
      await apiMutation(`/api/fleet/vehicle-costs/${cost.id}`, { method: "DELETE" });
      clearHistoryForm(); onSaved("Base mensal excluída. Média por km recalculada.");
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao excluir histórico."); }
    finally { setBusy(false); }
  }

  return <div className="fleet-stack">
    <section className="panel fleet-settings-panel">
      <header><div><span className="eyebrow">Base dos cálculos</span><h2>Parâmetros de custo e operação</h2><p>Combustível = distância ÷ consumo médio × preço por litro.</p></div></header>
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
      <header className="fleet-panel-header"><div><span className="eyebrow">Parâmetro por placa</span><h2>Custo fixo rateado por km</h2><p>Para cada mês: custo fixo do caminhão ÷ km rodados. O parâmetro é a média simples dos meses disponíveis daquela placa.</p><p>O frete usa sua distância × essa média. Combustível fica separado. O histórico serve somente como base e não é descontado novamente.</p></div></header>
      <div className="responsive-table"><table><thead><tr><th>Placa</th><th>Meses na base</th><th>Custo médio por km</th><th>Histórico</th></tr></thead><tbody>
        {fleet.vehicles.map((item) => <tr key={item.id}><td data-label="Placa"><strong>{item.plate}</strong></td><td data-label="Meses na base">{item.costs.length}</td><td data-label="Custo médio por km"><strong>{formatFleetRate(item.averageCostPerKmCents)}</strong></td><td data-label="Histórico"><button type="button" className="button secondary compact-button" onClick={() => { setVehicleId(item.id); clearHistoryForm(); }}>Ver base mensal</button></td></tr>)}
        {!fleet.vehicles.length && <tr><td colSpan={4} className="empty-cell">Cadastre um veículo para configurar o rateio.</td></tr>}
      </tbody></table></div>
    </section>
    {vehicle && <section className="panel fleet-settings-panel">
      <header><div><span className="eyebrow">Histórico mensal</span><h2>Base de cálculo · {vehicle.plate}</h2><p>Inclua custos fixos, como manutenção, seguro e IPVA. Não inclua combustível, pedágio ou comissão já lançados no frete. A média mantém todos os meses disponíveis.</p></div></header>
      <Field label="Veículo"><select value={vehicleId} onChange={(event) => { setVehicleId(event.target.value); clearHistoryForm(); }}>{fleet.vehicles.map((item) => <option key={item.id} value={item.id}>{item.plate}</option>)}</select></Field>
      <div className="responsive-table"><table><thead><tr><th>Mês</th><th>KM no mês</th><th>Custo fixo do mês</th><th>Custo/km</th>{fleet.canManage && <th>Ações</th>}</tr></thead><tbody>
        {vehicle.costs.map((cost) => <tr key={cost.id}><td data-label="Mês">{competencyLabel(cost.competency)}</td><td data-label="KM no mês">{(cost.distanceMeters / 1000).toLocaleString("pt-BR")}</td><td data-label="Custo fixo do mês">{formatMoney(cost.monthlyCostCents)}</td><td data-label="Custo/km">{formatFleetRate(cost.costPerKmCents)}</td>{fleet.canManage && <td data-label="Ações"><div className="table-actions"><button type="button" className="button secondary compact-button" disabled={busy} onClick={() => editHistory(cost)}>Editar</button><button type="button" className="button danger compact-button" aria-label={`Excluir base de ${cost.competency}`} disabled={busy} onClick={() => deleteHistory(cost)}>Excluir</button></div></td>}</tr>)}
        {!vehicle.costs.length && <tr><td colSpan={fleet.canManage ? 5 : 4} className="empty-cell">Base pendente. Informe pelo menos um mês para calcular o custo por km.</td></tr>}
      </tbody></table></div>
      {fleet.canManage && <form className="form-stack" onSubmit={saveHistory}>
        <h3>{editing ? "Editar base mensal" : "Adicionar base mensal"}</h3>
        <div className="form-grid three">
          <Field label="Competência"><input type="month" value={competency} onChange={(event) => setCompetency(event.target.value)} required disabled={busy} /></Field>
          <Field label="KM rodados no mês"><input inputMode="decimal" value={distance} onChange={(event) => setDistance(event.target.value)} required disabled={busy} /></Field>
          <Field label="Custo fixo do mês (R$)"><input inputMode="decimal" value={monthlyCost} onChange={(event) => setMonthlyCost(event.target.value)} required disabled={busy} /></Field>
        </div>
        <div className="fleet-settings-actions">{editing && <button type="button" className="button secondary" onClick={clearHistoryForm}>Cancelar edição</button>}<button className="button primary" disabled={busy}>{busy ? "Salvando…" : "Salvar base mensal"}</button></div>
      </form>}
    </section>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
