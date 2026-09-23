"use client";

import { CargoVehiclesEditor } from "@/components/cargo-vehicles-editor";
import { cargoVehiclesOrLegacy } from "@/lib/domain/cargo-vehicles";
import { fuelInputToInteger } from "@/lib/domain/fuel-input";
import { FleetMonthlyPanel } from "@/components/fleet-monthly-panel";
import { FleetParametersPanel } from "@/components/fleet-parameters-panel";
import { currentCompetency, todaySaoPaulo } from "@/lib/domain/dates";
import { FleetPaymentPanel } from "@/components/fleet-payment-panel";

import { useMemo, useState } from "react";
import { Icons } from "@/components/icons";
import {
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { apiMutation, useApi } from "@/components/use-api";
import {
  FLEET_OPERATIONAL_STATUSES,
  FLEET_OPERATIONAL_STATUS_LABELS,
  FLEET_PRIORITIES,
  FLEET_PRIORITY_LABELS,
  calculateFleetFreightPreview,
  summarizeFleet,
  type FleetData,
  type FleetDriver,
  type FleetFreight,
  type FleetVehicle,
} from "@/lib/domain/fleet";
import { distanceInputToMeters, distanceToInput } from "@/lib/domain/number-input";
import {
  formatDate,
  formatMoney,
  formatPercent,
  moneyInputToCents,
} from "@/lib/format";

type FleetTab = "overview" | "freights" | "assets" | "monthly" | "settings";

function centsToInput(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

function formatDistance(distanceMeters: number) {
  return `${(distanceMeters / 1_000).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })} km`;
}

function FreightTable({
  freights,
  canManage,
  onEdit,
}: {
  freights: FleetFreight[];
  canManage: boolean;
  onEdit: (freight: FleetFreight) => void;
}) {
  if (!freights.length) {
    return (
      <div className="inline-empty">
        Nenhum frete corresponde aos filtros informados.
      </div>
    );
  }

  return (
    <div className="responsive-table fleet-table-wrap">
      <table className="fleet-table">
        <thead>
          <tr>
            <th>Coleta</th>
            <th>Rota</th>
            <th>Frota / motorista</th>
            <th>Cliente / carga</th>
            <th>Status</th>
            <th>Frete</th>
            <th>Custos diretos</th>
            <th>Margem de contribuição</th>
            <th>Retorno</th>
            {canManage && <th><span className="sr-only">Ações</span></th>}
          </tr>
        </thead>
        <tbody>
          {freights.map((freight) => (
            <tr key={freight.id}>
              <td data-label="Coleta">
                <strong>{formatDate(freight.pickupDate)}</strong>
                <small>Entrega: {formatDate(freight.deliveryDate)}</small>
                <small>Faturamento: {formatDate(freight.billingDate)}</small>
              </td>
              <td data-label="Rota">
                <strong>{freight.origin}</strong>
                <small>→ {freight.destination}</small>
              </td>
              <td data-label="Frota / motorista">
                <strong>{freight.vehiclePlate}</strong>
                <small>{freight.driverName}</small>
              </td>
              <td data-label="Cliente / carga">
                <strong>{freight.clientName}</strong>
                <small>
                  {cargoVehiclesOrLegacy(freight.cargoVehicles, freight.cargoVehicleModel, freight.cargoPlate).length} veículo(s)
                  {cargoVehiclesOrLegacy(freight.cargoVehicles, freight.cargoVehicleModel, freight.cargoPlate).map((v, i) => <span className="cargo-summary" key={i}>{[v.model, v.plate, v.identification].filter(Boolean).join(" · ") || "Identificação não informada"}</span>)}
                </small>
              </td>
              <td data-label="Status">
                <StatusBadge
                  status={FLEET_OPERATIONAL_STATUS_LABELS[freight.operationalStatus]}
                />
                <small>{FLEET_PRIORITY_LABELS[freight.priority]}</small><StatusBadge status={freight.paymentStatus} />
              </td>
              <td data-label="Frete">
                <strong>{formatMoney(freight.freightAmountCents)}</strong>
                <small>{formatDistance(freight.distanceMeters)}</small>
              </td>
              <td data-label="Custos diretos">
                <strong>{formatMoney(freight.directCostCents)}</strong>
                <small>Comissão: {formatMoney(freight.driverCommissionCents)}</small>
                <small>Pátio: {formatMoney(freight.yardCostCents ?? 0)}</small>
                <small>Coleta: {formatMoney(freight.pickupCostCents ?? 0)} · Entrega: {formatMoney(freight.deliveryCostCents ?? 0)}</small>
                <small>Outros: {formatMoney(freight.otherCostCents ?? 0)}</small>
                <small>{`Combustível ${freight.fuelCostSource === 'REALIZADO' ? 'realizado' : freight.fuelCostSource === 'ESTIMADO' ? 'estimado' : 'histórico'}: ${formatMoney(freight.fuelCostCents)}`}</small>
              </td>
              <td data-label="Margem de contribuição">
                <strong className={freight.contributionCents < 0 ? "negative" : "positive"}>{formatMoney(freight.contributionCents)}</strong>
                <small>{formatPercent(freight.contributionBasisPoints)}</small>
                <small>Resultado operacional: {formatMoney(freight.netRevenueCents)}</small>
              </td>
              <td data-label="Retorno">
                <span className={`fleet-match-badge ${freight.possibleMatch ? "opportunity" : ""}`}>
                  {freight.possibleMatch ? "Possível encaixe" : "Sem encaixe"}
                </span>
                <small>{freight.returnUsed ? "Retorno aproveitado" : "Não aproveitado"}</small>
              </td>
              {canManage && (
                <td data-label="Ações">
                  <div className="table-actions">
                    <button type="button" className="table-action" aria-label={`Editar frete de ${freight.origin} para ${freight.destination}`} title="Editar frete" onClick={() => onEdit(freight)}><Icons.chevron /></button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FreightModal({ freight, fleet, onClose, onSaved, onDelete }: { freight: FleetFreight | null; fleet: FleetData; onClose: () => void; onSaved: (message: string) => void; onDelete: (freight: FleetFreight) => Promise<void>; }) {
  const editing = Boolean(freight);
  const financialOnly = fleet.canEditFreightFinancials && !fleet.canEditFreights;
  const firstVehicle = fleet.vehicles.find((vehicle) => vehicle.active);
  const firstDriver = fleet.drivers.find((driver) => driver.active && driver.vehicleId === firstVehicle?.id) ?? fleet.drivers.find(driver => driver.active);
  const [driverId, setDriverId] = useState(freight?.driverId ?? firstDriver?.id ?? "");
  const [origin, setOrigin] = useState(freight?.origin ?? "");
  const [destination, setDestination] = useState(freight?.destination ?? "");
  const [originCep, setOriginCep] = useState(freight?.originCep ?? "");
  const [destinationCep, setDestinationCep] = useState(freight?.destinationCep ?? "");
  const [routing, setRouting] = useState(false);
  const [routeNotice, setRouteNotice] = useState("");
  const [vehicleId, setVehicleId] = useState(freight?.vehicleId ?? firstVehicle?.id ?? "");
  const [freightValue, setFreightValue] = useState(centsToInput(freight?.freightAmountCents));
  const [distance, setDistance] = useState(freight ? distanceToInput(freight.distanceMeters) : "");
  const [pickupDate, setPickupDate] = useState(freight?.pickupDate ?? todaySaoPaulo());
  const tripId = freight?.tripId ?? "";
  const [cargoVehicles, setCargoVehicles] = useState(() => cargoVehiclesOrLegacy(freight?.cargoVehicles, freight?.cargoVehicleModel ?? null, freight?.cargoPlate ?? null));
  const [fuelLiters, setFuelLiters] = useState(freight?.fuelLitersMilli == null ? "" : String(freight.fuelLitersMilli / 1000).replace(".", ","));
  const [pumpAmount, setPumpAmount] = useState(centsToInput(freight?.fuelPumpAmountCents));
  const [yardCost, setYardCost] = useState(centsToInput(freight?.yardCostCents));
  const [pickupCost, setPickupCost] = useState(centsToInput(freight?.pickupCostCents));
  const [deliveryCost, setDeliveryCost] = useState(centsToInput(freight?.deliveryCostCents));
  const [otherCost, setOtherCost] = useState(centsToInput(freight?.otherCostCents));
  const [actualFuel, setActualFuel] = useState(centsToInput(freight?.actualFuelCostCents));
  const [toll, setToll] = useState(centsToInput(freight?.tollCents));
  const [driverCommission, setDriverCommission] = useState(centsToInput(freight?.driverCommissionCents));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function calculateRoute(from = origin, to = destination) {
    if (!from || !to) return;
    setRouting(true); setRouteNotice("");
    try {
      const result = await apiMutation<{distanceMeters: number}>("/api/fleet/route-lookup", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({origin: from, destination: to}) });
      setDistance(distanceToInput(result.distanceMeters)); setRouteNotice("Distância rodoviária calculada. Você pode corrigi-la.");
    } catch(e) { setRouteNotice(e instanceof Error ? e.message : "Informe a distância manualmente."); }
    finally { setRouting(false); }
  }
  async function lookupCep(side: "origin" | "destination") {
    const cep = side === "origin" ? originCep : destinationCep;
    setRouting(true); setRouteNotice("");
    try {
      const result = await apiMutation<{address: string}>(`/api/fleet/route-lookup?cep=${encodeURIComponent(cep)}`, {method: "GET"});
      if (side === "origin") setOrigin(result.address); else setDestination(result.address);
      await calculateRoute(side === "origin" ? result.address : origin, side === "destination" ? result.address : destination);
    } catch(e) { setRouteNotice(e instanceof Error ? e.message : "Preencha manualmente."); }
    finally { setRouting(false); }
  }

  const preview = useMemo(() => {
    try {
      return calculateFleetFreightPreview(
        {
          vehicleId, tripId: tripId || null,
          yardCostCents: moneyInputToCents(yardCost || "0"), pickupCostCents: moneyInputToCents(pickupCost || "0"),
          deliveryCostCents: moneyInputToCents(deliveryCost || "0"), otherCostCents: moneyInputToCents(otherCost || "0"),
          actualFuelCostCents: fuelInputToInteger(actualFuel, "Valor pago combustível", 2),
          distanceMeters: distanceInputToMeters(distance || "0"),
          freightAmountCents: moneyInputToCents(freightValue || "0"),
          tollCents: moneyInputToCents(toll || "0"),
          driverCommissionCents: moneyInputToCents(driverCommission || "0"),
        },
        fleet.parameters,
        fleet.vehicles,
        freight?.tripId ? { fuelCents: freight.historicalFuelShareCents ?? 0,
          tollCents: freight.sharedTransportCostCents, otherCents: 0 } : undefined,
      );
    } catch { return null; }
  }, [freight, distance, driverCommission, fleet.parameters, fleet.vehicles, vehicleId, freightValue, toll, tripId, yardCost, pickupCost, deliveryCost, otherCost, actualFuel]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        vehicleId, driverId, tripId: tripId || null,
        yardCostCents: moneyInputToCents(yardCost || "0"), pickupCostCents: moneyInputToCents(pickupCost || "0"),
        deliveryCostCents: moneyInputToCents(deliveryCost || "0"), otherCostCents: moneyInputToCents(otherCost || "0"),
        actualFuelCostCents: fuelInputToInteger(actualFuel, "Valor pago combustível", 2),
        clientName: financialOnly ? freight!.clientName : form.get("clientName"),
        cargoVehicles,
        fuelLitersMilli: fuelInputToInteger(fuelLiters, "Litros abastecidos", 3),
        fuelPumpAmountCents: fuelInputToInteger(pumpAmount, "Valor bomba", 2),
        originCep: financialOnly ? freight!.originCep : originCep,
        destinationCep: financialOnly ? freight!.destinationCep : destinationCep,
        origin: financialOnly ? freight!.origin : form.get("origin"),
        destination: financialOnly ? freight!.destination : form.get("destination"),
        pickupDate: financialOnly ? freight!.pickupDate : pickupDate,
        deliveryDate: financialOnly ? freight!.deliveryDate : form.get("deliveryDate") || null,
        billingDate: financialOnly ? freight!.billingDate : form.get("billingDate") || null,
        operationalStatus: financialOnly ? freight!.operationalStatus : form.get("operationalStatus"),
        priority: financialOnly ? freight!.priority : form.get("priority"),
        freightAmountCents: moneyInputToCents(freightValue || "0"),
        distanceMeters: financialOnly ? freight!.distanceMeters : distanceInputToMeters(distance || "0"),
        tollCents: moneyInputToCents(toll || "0"),
        driverCommissionCents: moneyInputToCents(driverCommission || "0"),
        returnUsed: financialOnly ? freight!.returnUsed : form.get("returnUsed") === "on",
      };
      await apiMutation(editing ? `/api/fleet/freights/${freight!.id}` : "/api/fleet/freights", { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      onSaved(editing ? "Frete atualizado." : "Frete cadastrado.");
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Erro ao salvar o frete."); }
    finally { setSaving(false); }
  }

  const selectableVehicles = fleet.vehicles.filter((vehicle) => vehicle.active || vehicle.id === freight?.vehicleId);
  const selectableDrivers = fleet.drivers.filter((driver) => driver.active || driver.id === freight?.driverId);

  return (
    <Modal open wide onClose={onClose} title={editing ? "Editar frete da frota" : "Novo frete da frota"} description="Cadastre os veículos da carga e os custos desta operação. O resultado utiliza o combustível realizado quando informado.">
      <form className="modal-body form-stack" onSubmit={submit}>
        <fieldset disabled={!(fleet.canEditFreights || fleet.canEditFreightFinancials)} className="fleet-fieldset">
          {financialOnly && <p className="fleet-update-note">Perfil Financeiro: somente os valores do frete e dos custos podem ser alterados. Dados operacionais permanecem bloqueados.</p>}
          <fieldset disabled={financialOnly} className="fleet-fieldset">
          <div className="section-divider">Identificação</div>
          {tripId && <p className="fleet-update-note">Operação vinculada a uma viagem histórica. Seus custos compartilhados continuam preservados. O combustível pago substitui somente a parcela deste frete.</p>}
          <div className="form-grid three">
            <Field label="Veículo da frota"><select name="vehicleId" disabled={Boolean(tripId)} value={vehicleId} onChange={(event) => { setVehicleId(event.target.value); const linked = fleet.drivers.find(d => d.active && d.vehicleId === event.target.value); if (linked) setDriverId(linked.id); }} required><option value="">Selecione</option>{selectableVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate}</option>)}</select></Field>
            <Field label="Motorista"><select name="driverId" disabled={Boolean(tripId)} value={driverId} onChange={e => setDriverId(e.target.value)} required><option value="">Selecione</option>{selectableDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></Field>
            <Field label="Cliente"><input name="clientName" defaultValue={freight?.clientName ?? ""} required /></Field>
          </div>
          <CargoVehiclesEditor vehicles={cargoVehicles} onChange={setCargoVehicles} disabled={financialOnly} />
          <div className="section-divider">Rota e datas</div>
          <div className="form-grid two">
            <Field label="CEP de origem"><input value={originCep} onChange={e => setOriginCep(e.target.value)} maxLength={9} inputMode="numeric" /><button type="button" className="button secondary" disabled={routing} onClick={() => lookupCep("origin")}>Buscar origem</button></Field>
            <Field label="CEP de destino"><input value={destinationCep} onChange={e => setDestinationCep(e.target.value)} maxLength={9} inputMode="numeric" /><button type="button" className="button secondary" disabled={routing} onClick={() => lookupCep("destination")}>Buscar destino</button></Field>
          </div>
          <button type="button" className="button secondary" disabled={routing} onClick={() => calculateRoute()}>{routing ? "Consultando rota…" : "Recalcular distância"}</button>
          {routeNotice && <p role="status">{routeNotice}</p>}
          <div className="form-grid two"><Field label="Origem"><input name="origin" value={origin} onChange={e => setOrigin(e.target.value)} maxLength={180} required /></Field><Field label="Destino"><input name="destination" value={destination} onChange={e => setDestination(e.target.value)} maxLength={180} required /></Field></div>
          <div className="form-grid three"><Field label="Data da coleta"><input name="pickupDate" type="date" value={pickupDate} onChange={(event) => setPickupDate(event.target.value)} required /></Field><Field label="Data da entrega"><input name="deliveryDate" type="date" defaultValue={freight?.deliveryDate ?? ""} /></Field><Field label="Data do faturamento"><input name="billingDate" type="date" defaultValue={freight?.billingDate ?? ""} /></Field></div>
          </fieldset>
          <div className="section-divider">Operação e valores</div>
          <div className="form-grid four">
            <Field label="Status operacional"><select name="operationalStatus" disabled={financialOnly} defaultValue={freight?.operationalStatus ?? "SEM_PREVISAO"}>{FLEET_OPERATIONAL_STATUSES.map((status) => <option key={status} value={status}>{FLEET_OPERATIONAL_STATUS_LABELS[status]}</option>)}</select></Field>
            <Field label="Prioridade"><select name="priority" disabled={financialOnly} defaultValue={freight?.priority ?? "NORMAL"}>{FLEET_PRIORITIES.map((priority) => <option key={priority} value={priority}>{FLEET_PRIORITY_LABELS[priority]}</option>)}</select></Field>
            <Field label="Valor do frete"><div className="money-field"><span>R$</span><input value={freightValue} onChange={(event) => setFreightValue(event.target.value)} inputMode="decimal" placeholder="0,00" required /></div></Field>
            <Field label="Distância" hint="Em km: 1200 ou 1.200. Para decimais, use vírgula (1200,5)."><div className="fleet-unit-field"><input disabled={financialOnly} value={distance} onChange={(event) => setDistance(event.target.value)} inputMode="decimal" placeholder="0" required /><span>km</span></div></Field>
          </div>
          <div className="form-grid three"><Field label="Pedágio"><div className="money-field"><span>R$</span><input disabled={Boolean(tripId)} value={toll} onChange={(event) => setToll(event.target.value)} inputMode="decimal" placeholder="0,00" /></div></Field><Field label="Motorista / comissão"><div className="money-field"><span>R$</span><input value={driverCommission} onChange={(event) => setDriverCommission(event.target.value)} inputMode="decimal" placeholder="0,00" /></div></Field><label className="fleet-check-field"><input name="returnUsed" type="checkbox" disabled={financialOnly} defaultChecked={freight?.returnUsed ?? false} /><span>Retorno já aproveitado</span></label></div>
          <div className="form-grid four">
            <Field label="Pátio / recebimento (R$)"><input value={yardCost} onChange={e => setYardCost(e.target.value)} inputMode="decimal" placeholder="0,00" /></Field>
            <Field label="Coleta (R$)"><input value={pickupCost} onChange={e => setPickupCost(e.target.value)} inputMode="decimal" placeholder="0,00" /></Field>
            <Field label="Entrega (R$)"><input value={deliveryCost} onChange={e => setDeliveryCost(e.target.value)} inputMode="decimal" placeholder="0,00" /></Field>
            <Field label="Outros custos diretos (R$)"><input value={otherCost} onChange={e => setOtherCost(e.target.value)} inputMode="decimal" placeholder="0,00" /></Field>
          </div>
          <div className="form-grid three">
            <Field label="Litros abastecidos" hint="Até 3 casas decimais."><input value={fuelLiters} onChange={e => setFuelLiters(e.target.value)} inputMode="decimal" placeholder="0,000" /></Field>
            <Field label="Valor bomba (R$)" hint="Valor informado na bomba, separado do valor efetivamente pago."><input value={pumpAmount} onChange={e => setPumpAmount(e.target.value)} inputMode="decimal" placeholder="0,00" /></Field>
            <Field label="Valor pago combustível (R$)" hint="Custo real. Em branco mantém a estimativa ou parcela histórica; zero é um valor realizado."><input value={actualFuel} onChange={e => setActualFuel(e.target.value)} inputMode="decimal" placeholder="Ainda não apurado" /></Field>
          </div>
          {preview && <>
            <div className="fleet-form-preview fleet-result-preview">
              <div><span>Custos diretos</span><strong>{formatMoney(preview.directCostCents)}</strong></div>
              <div><span>Margem de contribuição</span><strong className={preview.contributionCents < 0 ? "negative" : "positive"}>{formatMoney(preview.contributionCents)} · {formatPercent(preview.contributionBasisPoints)}</strong></div>
              {<><div><span>Combustível {actualFuel.trim() ? "realizado" : tripId ? "da viagem histórica" : "estimado"}</span><strong>{formatMoney(preview.fuelCostCents)}</strong></div><div><span>Resultado operacional</span><strong>{formatMoney(preview.netRevenueCents)}</strong></div></>}
            </div>
            <p className="fleet-update-note">O resultado operacional desconta combustível e pedágio. {tripId ? "Custos históricos compartilhados são distribuídos entre os fretes vinculados, sem duplicação." : "Sem valor pago informado, o combustível exibido é estimado."}</p>
          </>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer className="modal-actions">{freight && fleet.canManage && <button type="button" className="button danger" disabled={saving} onClick={() => void onDelete(freight)}>Excluir frete</button>}<button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar frete"}</button></footer>
        </fieldset>
      </form>
      {freight && (fleet.canEditFreights || fleet.canManagePayments) && <FleetPaymentPanel id={freight.id} status={freight.paymentStatus} paidAt={freight.paidAt} proofAttachmentId={freight.proofAttachmentId} canManagePayments={fleet.canManagePayments} onSaved={() => onSaved("Pagamento atualizado.")} />}
    </Modal>
  );
}

function VehicleResultCells({ vehicleId, freights }: { vehicleId: string; freights: FleetFreight[] }) {
  const members = freights.filter(freight => freight.vehicleId === vehicleId);
  const totals = summarizeFleet(members);
  return <>
    <td data-label="Receita no mês">{formatMoney(totals.revenueCents)}</td>
    <td data-label="Custos da operação">{formatMoney(totals.totalCostCents)}</td>
    <td data-label="Resultado operacional">{formatMoney(totals.netRevenueCents)}<small>{members.some(f => f.fuelCostSource === 'ESTIMADO') ? 'Inclui combustível estimado' : 'Sem estimativa de combustível'}</small></td>
  </>;
}

function VehicleModal({ vehicle, onClose, onSaved }: { vehicle: FleetVehicle | null; onClose: () => void; onSaved: (message: string) => void; }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(null); const form = new FormData(event.currentTarget); try { await apiMutation(vehicle ? `/api/fleet/vehicles/${vehicle.id}` : "/api/fleet/vehicles", { method: vehicle ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plate: form.get("plate"), active: form.get("active") === "on" }) }); onSaved(vehicle ? "Veículo atualizado." : "Veículo cadastrado."); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Erro ao salvar veículo."); } finally { setSaving(false); } }
  return <Modal open onClose={onClose} title={vehicle ? "Editar veículo" : "Novo veículo da frota"}><form className="modal-body form-stack" onSubmit={submit}><Field label="Placa"><input name="plate" defaultValue={vehicle?.plate ?? ""} maxLength={8} required /></Field><Field label="Ativo"><input name="active" type="checkbox" defaultChecked={vehicle?.active ?? true} /></Field>{error && <p className="form-error" role="alert">{error}</p>}<footer className="modal-actions">{vehicle && <button type="button" className="button danger" disabled={saving} onClick={async () => { if (!window.confirm("Excluir cadastro? Registros com histórico serão preservados.")) return; setSaving(true); setError(null); try { await apiMutation(`/api/fleet/vehicles/${vehicle.id}`, { method: "DELETE" }); onSaved("Cadastro excluído."); } catch(e) { setError(e instanceof Error ? e.message : "Erro ao excluir."); } finally { setSaving(false); } }}>Excluir</button>}<button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button></footer></form></Modal>;
}

function DriverModal({ driver, vehicles, onClose, onSaved }: { driver: FleetDriver | null; vehicles: FleetVehicle[]; onClose: () => void; onSaved: (message: string) => void; }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(null); const form = new FormData(event.currentTarget); try { await apiMutation(driver ? `/api/fleet/drivers/${driver.id}` : "/api/fleet/drivers", { method: driver ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), cpf: form.get("cpf"), address: form.get("address"), phone: form.get("phone"), vehicleId: form.get("vehicleId"), active: form.get("active") === "on" }) }); onSaved(driver ? "Motorista atualizado." : "Motorista cadastrado."); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Erro ao salvar motorista."); } finally { setSaving(false); } }
  return <Modal open onClose={onClose} title={driver ? "Editar motorista" : "Novo motorista"}><form className="modal-body form-stack" onSubmit={submit}><Field label="Nome completo"><input name="name" defaultValue={driver?.name ?? ""} required /></Field><Field label="CPF"><input name="cpf" defaultValue={driver?.cpf ?? ""} maxLength={14} required /></Field><Field label="Endereço completo"><input name="address" defaultValue={driver?.address ?? ""} maxLength={300} required /></Field><Field label="Telefone com DDD"><input name="phone" type="tel" defaultValue={driver?.phone ?? ""} required /></Field><Field label="Veículo vinculado"><select name="vehicleId" defaultValue={driver?.vehicleId ?? ""}><option value="">Sem vínculo</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}</select></Field><Field label="Ativo"><input name="active" type="checkbox" defaultChecked={driver?.active ?? true} /></Field>{error && <p className="form-error" role="alert">{error}</p>}<footer className="modal-actions">{driver && <button type="button" className="button danger" disabled={saving} onClick={async () => { if (!window.confirm("Excluir cadastro? Registros com histórico serão preservados.")) return; setSaving(true); setError(null); try { await apiMutation(`/api/fleet/drivers/${driver.id}`, { method: "DELETE" }); onSaved("Cadastro excluído."); } catch(e) { setError(e instanceof Error ? e.message : "Erro ao excluir."); } finally { setSaving(false); } }}>Excluir</button>}<button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button></footer></form></Modal>;
}

export function FleetScreen() {
  const [competency, setCompetency] = useState(currentCompetency);
  const api = useApi<{ fleet: FleetData }>(`/api/fleet?competency=${competency}`);
  const fleet = api.data?.fleet;
  const [selectedTab, setTab] = useState<FleetTab>("overview");
  const tab = fleet?.freightOnly ? "freights" : selectedTab;
  const [search, setSearch] = useState(""); const [opportunity, setOpportunity] = useState(""); const [status, setStatus] = useState(""); const [priority, setPriority] = useState("");
  const [freightModalOpen, setFreightModalOpen] = useState(false); const [editingFreight, setEditingFreight] = useState<FleetFreight | null>(null); const [vehicleModalOpen, setVehicleModalOpen] = useState(false); const [editingVehicle, setEditingVehicle] = useState<FleetVehicle | null>(null); const [driverModalOpen, setDriverModalOpen] = useState(false); const [editingDriver, setEditingDriver] = useState<FleetDriver | null>(null); const [mutationError, setMutationError] = useState<string | null>(null); const [success, setSuccess] = useState<string | null>(null);


  const filteredFreights = useMemo(() => { const normalized = search.trim().toLocaleUpperCase("pt-BR"); return (fleet?.freights ?? []).filter((freight) => { const matchesSearch = !normalized || [freight.vehiclePlate, freight.driverName, freight.clientName, ...cargoVehiclesOrLegacy(freight.cargoVehicles, freight.cargoVehicleModel, freight.cargoPlate).flatMap(v => [v.model, v.plate, v.identification]), freight.origin, freight.destination].some((value) => value?.toLocaleUpperCase("pt-BR").includes(normalized)); return matchesSearch && (!status || freight.operationalStatus === status) && (!priority || freight.priority === priority) && (!opportunity || (opportunity === "matches" ? freight.possibleMatch : opportunity === "open" ? !freight.returnUsed : freight.returnUsed)); }); }, [fleet, priority, search, status, opportunity]);

  function openNewFreight() { setEditingFreight(null); setMutationError(null); setFreightModalOpen(true); }
  function openEditFreight(freight: FleetFreight) { setEditingFreight(freight); setMutationError(null); setFreightModalOpen(true); }
  function finishMutation(message: string) { setFreightModalOpen(false); setVehicleModalOpen(false); setDriverModalOpen(false); setEditingFreight(null); setEditingVehicle(null); setEditingDriver(null); setMutationError(null); setSuccess(message); api.refresh(); }
  async function deleteFreight(freight: FleetFreight) { if (!window.confirm(`Excluir o frete de ${freight.origin} para ${freight.destination}?`)) return; setMutationError(null); try { await apiMutation(`/api/fleet/freights/${freight.id}`, { method: "DELETE" }); finishMutation("Frete excluído."); } catch (error) { setMutationError(error instanceof Error ? error.message : "Erro ao excluir frete."); } }
  function openVehicle(vehicle: FleetVehicle | null) { setEditingVehicle(vehicle); setVehicleModalOpen(true); }
  function openDriver(driver: FleetDriver | null) { setEditingDriver(driver); setDriverModalOpen(true); }

  const allTabs: Array<{ id: FleetTab; label: string }> = [{ id: "overview", label: "Visão geral" }, { id: "freights", label: "Fretes" }, { id: "assets", label: "Veículos e motoristas" }, { id: "monthly", label: "Fechamento mensal" }, { id: "settings", label: "Parâmetros" }];
  const tabs = fleet?.freightOnly ? allTabs.filter((item) => item.id === "freights") : allTabs;

  return <>
    <PageHeader eyebrow="Operação logística" title="Frota" description="Acompanhe os fretes, o resultado por caminhão e o fechamento mensal." actions={<><label className="compact-filter"><span>{tab === "monthly" ? "Competência" : "Mês da coleta"}</span><input type="month" value={competency} onChange={(event) => setCompetency(event.target.value || currentCompetency())} /></label>{fleet?.canEditFreights && <button className="button primary" onClick={openNewFreight}><Icons.plus /> Novo frete</button>}</>} />
    {success && <p className="success-banner" role="status">{success}</p>}{mutationError && <p className="form-error" role="alert">{mutationError}</p>}{api.loading && <LoadingState label="Carregando a frota…" />}{api.error && <ErrorState message={api.error} retry={api.refresh} />}
    {fleet && <div className="fleet-stack">
      {fleet.summary.missingCostCount > 0 && <p className="form-error" role="status">{fleet.summary.missingCostCount} frete(s) deste mês sem base de rateio da placa. Configure o histórico mensal em Parâmetros para concluir os custos e margens.</p>}
      <div className="fleet-tabs" role="tablist" aria-label="Áreas da Frota">{tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
      {tab === "overview" && !fleet.freightOnly && <>
        <section className="kpi-grid fleet-kpis"><article className="kpi-card"><span>Receita dos fretes</span><strong>{formatMoney(fleet.summary.revenueCents)}</strong><small>Soma do valor dos fretes</small></article><article className="kpi-card"><span>Custos diretos</span><strong>{fleet.summary.missingCostCount ? "Base pendente" : formatMoney(fleet.summary.directCostCents)}</strong><small>Comissões, pátio, coleta, entrega e outros custos diretos</small></article><article className="kpi-card accent"><span>Margem de contribuição total</span><strong>{fleet.summary.missingCostCount ? "Base pendente" : formatMoney(fleet.summary.contributionCents)} <em>{fleet.summary.missingCostCount ? "" : formatPercent(fleet.summary.revenueCents ? Math.round(fleet.summary.contributionCents * 10000 / fleet.summary.revenueCents) : 0)}</em></strong><small>Antes dos custos compartilhados das viagens e dos custos fixos</small></article></section>
        <section className="fleet-opportunity-grid"><article className="panel fleet-opportunity-card"><span className="fleet-opportunity-icon"><Icons.map /></span><div><span>Possíveis encaixes</span><strong>{fleet.summary.possibleMatchCount}</strong><small>Destino compatível com nova coleta dentro de {fleet.parameters.matchWindowDays} dia{fleet.parameters.matchWindowDays === 1 ? "" : "s"}</small><button type="button" className="text-button" onClick={() => { setOpportunity("matches"); setSearch(""); setStatus(""); setPriority(""); setTab("freights"); }}>Abrir encaixes</button></div></article><article className="panel fleet-opportunity-card"><span className="fleet-opportunity-icon used"><Icons.truck /></span><div><span>Retornos em aberto</span><strong>{fleet.freights.filter(f => !f.returnUsed).length}</strong><small>{fleet.summary.returnUsedCount} retorno(s) já aproveitado(s)</small><button type="button" className="text-button" onClick={() => { setOpportunity("open"); setSearch(""); setStatus(""); setPriority(""); setTab("freights"); }}>Abrir retornos</button></div></article><article className="panel fleet-opportunity-card"><span className="fleet-opportunity-icon allocated"><Icons.wallet /></span><div><span>Resultado operacional</span><strong>{formatMoney(fleet.summary.netRevenueCents)}</strong><small>Inclui combustível realizado ou estimado e custos históricos rateados</small></div></article></section>
        <section className="panel table-panel"><header className="fleet-panel-header"><div><span className="eyebrow">Atividade recente</span><h2>Últimos fretes</h2></div><button type="button" className="text-button" onClick={() => setTab("freights")}>Ver todos</button></header>{fleet.freights.length ? <FreightTable freights={fleet.freights.slice(0, 6)} canManage={fleet.canEditFreights || fleet.canManagePayments} onEdit={openEditFreight} /> : <EmptyState title="Nenhum frete cadastrado" description="Cadastre a primeira operação da Frota para iniciar os indicadores." />}</section>
      </>}
      {tab === "freights" && <><section className="filter-panel fleet-filter-panel"><label><span>Buscar</span><div className="search-input"><Icons.search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente, rota, placa ou motorista" /></div></label><label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option>{FLEET_OPERATIONAL_STATUSES.map((item) => <option key={item} value={item}>{FLEET_OPERATIONAL_STATUS_LABELS[item]}</option>)}</select></label><label><span>Prioridade</span><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Todas</option>{FLEET_PRIORITIES.map((item) => <option key={item} value={item}>{FLEET_PRIORITY_LABELS[item]}</option>)}</select></label><label><span>Encaixes e retornos</span><select value={opportunity} onChange={event => setOpportunity(event.target.value)}><option value="">Todos</option><option value="matches">Possíveis encaixes</option><option value="open">Retornos em aberto</option><option value="used">Retornos aproveitados</option></select></label><div className="filter-stat"><strong>{filteredFreights.length}</strong><span>frete{filteredFreights.length === 1 ? "" : "s"}</span></div></section><section className="panel table-panel"><FreightTable freights={filteredFreights} canManage={fleet.canEditFreights || fleet.canManagePayments} onEdit={openEditFreight} /></section></>}
      {tab === "assets" && !fleet.freightOnly && <div className="fleet-assets-stack"><section className="panel table-panel"><header className="fleet-panel-header"><div><span className="eyebrow">Cadastro</span><h2>Veículos da frota</h2><p>Resultado por caminhão no mês da coleta, antes dos custos fixos da empresa.</p></div>{fleet.canManage && <button type="button" className="button primary" onClick={() => openVehicle(null)}><Icons.plus /> Novo veículo</button>}</header><div className="responsive-table"><table><thead><tr><th>Placa</th><th>Situação</th><th>Receita no mês</th><th>Custos da operação</th><th>Resultado operacional</th>{fleet.canManage && <th><span className="sr-only">Ações</span></th>}</tr></thead><tbody>{fleet.vehicles.map((vehicle) => <tr key={vehicle.id}><td data-label="Placa"><strong>{vehicle.plate}</strong></td><td data-label="Situação"><StatusBadge status={vehicle.active ? "ATIVO" : "INATIVO"} /></td><VehicleResultCells vehicleId={vehicle.id} freights={fleet.freights} />{fleet.canManage && <td data-label="Ações"><div className="table-actions"><button type="button" className="table-action" aria-label={`Editar veículo ${vehicle.plate}`} title="Editar veículo" onClick={() => openVehicle(vehicle)}><Icons.chevron /></button></div></td>}</tr>)}{!fleet.vehicles.length && <tr><td colSpan={fleet.canManage ? 6 : 5} className="empty-cell">Nenhum veículo cadastrado.</td></tr>}</tbody></table></div></section><section className="panel table-panel"><header className="fleet-panel-header"><div><span className="eyebrow">Equipe</span><h2>Motoristas</h2></div>{fleet.canManage && <button type="button" className="button secondary" onClick={() => openDriver(null)}><Icons.plus /> Novo motorista</button>}</header><div className="responsive-table"><table><thead><tr><th>Nome / contato</th><th>Veículo</th><th>Situação</th>{fleet.canManage && <th><span className="sr-only">Ações</span></th>}</tr></thead><tbody>{fleet.drivers.map((driver) => <tr key={driver.id}><td data-label="Nome / contato"><strong>{driver.name}</strong><small>{driver.cpf ?? "CPF pendente"} · {driver.phone ?? "Telefone pendente"}</small><small>{driver.address}</small></td><td data-label="Veículo">{fleet.vehicles.find(v => v.id === driver.vehicleId)?.plate ?? "Sem vínculo"}</td><td data-label="Situação"><StatusBadge status={driver.active ? "ATIVO" : "INATIVO"} /></td>{fleet.canManage && <td data-label="Ações"><div className="table-actions"><button type="button" className="table-action" aria-label={`Editar motorista ${driver.name}`} title="Editar motorista" onClick={() => openDriver(driver)}><Icons.chevron /></button></div></td>}</tr>)}{!fleet.drivers.length && <tr><td colSpan={fleet.canManage ? 4 : 3} className="empty-cell">Nenhum motorista cadastrado.</td></tr>}</tbody></table></div></section></div>}
      {tab === "monthly" && !fleet.freightOnly && <FleetMonthlyPanel key={competency} competency={competency} />}
      {tab === "settings" && !fleet.freightOnly && <FleetParametersPanel key={fleet.parameters.updatedAt ?? "default"} fleet={fleet} onSaved={finishMutation} />}
    </div>}
    {freightModalOpen && fleet && <FreightModal key={editingFreight?.id ?? "new"} freight={editingFreight} fleet={fleet} onClose={() => setFreightModalOpen(false)} onSaved={finishMutation} onDelete={deleteFreight} />}
    {vehicleModalOpen && <VehicleModal key={editingVehicle?.id ?? "new"} vehicle={editingVehicle} onClose={() => setVehicleModalOpen(false)} onSaved={finishMutation} />}
    {driverModalOpen && <DriverModal vehicles={fleet?.vehicles ?? []} key={editingDriver?.id ?? "new"} driver={editingDriver} onClose={() => setDriverModalOpen(false)} onSaved={finishMutation} />}
  </>;
}
