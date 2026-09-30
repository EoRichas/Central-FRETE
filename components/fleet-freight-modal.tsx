"use client";
import { ORIGIN_LOCATION_TYPES, ORIGIN_LOCATION_TYPE_LABELS } from "@/lib/domain/operations";
import { commissionCents } from "@/lib/domain/finance";
import { ClientAutocomplete } from "@/components/client-autocomplete";
import type { SelectedClient } from "@/lib/domain/client-search";
import { useEffect, useRef, useState } from "react";
import { effectiveFleetDistance } from "@/lib/domain/fleet-distance";
import { CargoVehiclesEditor } from "@/components/cargo-vehicles-editor";
import { cargoVehiclesOrLegacy } from "@/lib/domain/cargo-vehicles";
import { fuelInputToInteger } from "@/lib/domain/fuel-input";
import { todaySaoPaulo } from "@/lib/domain/dates";
import { FleetPaymentPanel } from "@/components/fleet-payment-panel";
import { Field, Modal } from "@/components/ui";
import type { CurrentUser } from "@/lib/contracts";
import { apiMutation, useApi } from "@/components/use-api";
import {
  FLEET_OPERATIONAL_STATUSES,
  FLEET_OPERATIONAL_STATUS_LABELS,
  FLEET_PRIORITIES,
  FLEET_PRIORITY_LABELS,
  calculateFleetFreightPreview,
  type FleetFreightFormData,
  type FleetFreight,
} from "@/lib/domain/fleet";
import {
  distanceInputToMeters,
  distanceToInput,
} from "@/lib/domain/number-input";
import { formatMoney, formatPercent, moneyInputToCents } from "@/lib/format";

function centsToInput(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

function formatDistance(distanceMeters: number) {
  return `${(distanceMeters / 1_000).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })} km`;
}

export function FreightModal({
  freight,
  fleet,
  onClose,
  onSaved,
  onDelete,
}: {
  freight: FleetFreight | null;
  fleet: FleetFreightFormData;
  onClose: () => void;
  onSaved: (message: string, id?: string, competency?: string) => void;
  onDelete: (freight: FleetFreight) => Promise<void>;
}) {
  const editing = Boolean(freight);
  const me = useApi<{user:CurrentUser}>("/api/me");
  const sellers = useApi<{sellers:{id:string;name:string;commissionBasisPoints:number}[]}>(me.data?.user.role === 'ADMIN' && !editing ? '/api/sales/sellers' : null);
  const [sellerId,setSellerId] = useState(freight?.sellerId ?? '');
  const sellerRate = editing ? freight?.sellerCommissionBasisPoints ?? 0 : me.data?.user.role === 'VENDEDOR' ? me.data.user.commissionBasisPoints ?? 0 : sellers.data?.sellers.find(s=>s.id===sellerId)?.commissionBasisPoints ?? 0;
  const [client, setClient] = useState<SelectedClient | null>(freight ? {id: freight.clientId ?? null, legalName: freight.clientName} : null);
  const financialOnly =
    fleet.canEditFreightFinancials && !fleet.canEditFreights;
  const firstVehicle = fleet.vehicles.find((vehicle) => vehicle.active);
  const firstDriver =
    fleet.drivers.find(
      (driver) => driver.active && driver.vehicleId === firstVehicle?.id,
    ) ?? fleet.drivers.find((driver) => driver.active);
  const [driverId, setDriverId] = useState(
    freight?.driverId ?? firstDriver?.id ?? "",
  );
  const [origin, setOrigin] = useState(freight?.origin ?? "");
  const [destination, setDestination] = useState(freight?.destination ?? "");
  const [originCep, setOriginCep] = useState(freight?.originCep ?? "");
  const [destinationCep, setDestinationCep] = useState(
    freight?.destinationCep ?? "",
  );
  const [routing, setRouting] = useState(false);
  const [routeNotice, setRouteNotice] = useState("");
  const [vehicleId, setVehicleId] = useState(
    freight ? freight.vehicleId ?? "" : firstVehicle?.id ?? "",
  );
  const [freightValue, setFreightValue] = useState(
    centsToInput(freight?.freightAmountCents),
  );
  const [distance, setDistance] = useState(
    freight ? distanceToInput(freight.distanceMeters) : "",
  );
  const [routeDistanceMeters, setRouteDistanceMeters] = useState(
    freight?.routeDistanceMeters ?? null,
  );
  const [kmStart, setKmStart] = useState(
    freight?.odometerStartMeters == null
      ? ""
      : distanceToInput(freight.odometerStartMeters),
  );
  const [kmEnd, setKmEnd] = useState(
    freight?.odometerEndMeters == null
      ? ""
      : distanceToInput(freight.odometerEndMeters),
  );
  const routeSequence = useRef(0);
  const hasOdometer = Boolean(kmStart.trim() && kmEnd.trim());
  const [routeAttribution, setRouteAttribution] = useState("");
  function distanceValues() {
    const values = {
      distanceMeters: hasOdometer ? 0 : distanceInputToMeters(distance || "0"),
      routeDistanceMeters: hasOdometer ? null : routeDistanceMeters,
      odometerStartMeters: kmStart.trim()
        ? distanceInputToMeters(kmStart)
        : null,
      odometerEndMeters: kmEnd.trim() ? distanceInputToMeters(kmEnd) : null,
    };
    return { ...values, distanceMeters: effectiveFleetDistance(values) };
  }
  useEffect(() => {
    const sequence = ++routeSequence.current;
    const from = originCep.replace(/\D/g, "");
    const to = destinationCep.replace(/\D/g, "");
    if (financialOnly || hasOdometer || !/^\d{8}$/.test(from) || !/^\d{8}$/.test(to)) return;
    // Opening an existing operation preserves its saved manual adjustment.
    if (from === freight?.originCep && to === freight?.destinationCep && freight?.routeDistanceMeters != null) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setRouting(true);
      setRouteNotice("Calculando distância rodoviária…");
      try {
        const response = await fetch("/api/fleet/route-lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ originCep: from, destinationCep: to }),
          signal: controller.signal,
        });
        const result = await response.json();
        if (sequence !== routeSequence.current) return;
        if (!response.ok)
          throw new Error(result.error || "Informe a distância manualmente.");
        setOrigin(result.origin);
        setDestination(result.destination);
        setRouteDistanceMeters(result.distanceMeters);
        if (result.distanceMeters != null)
          setDistance(distanceToInput(result.distanceMeters));
        setRouteNotice(result.notice || "Distância rodoviária calculada.");
        setRouteAttribution(result.attribution || "");
      } catch (error) {
        if (!controller.signal.aborted && sequence === routeSequence.current)
          setRouteNotice(
            error instanceof Error
              ? error.message
              : "Informe a distância manualmente.",
          );
      } finally {
        if (sequence === routeSequence.current) setRouting(false);
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    originCep,
    destinationCep,
    financialOnly,
    hasOdometer,
    freight?.routeDistanceMeters,
    freight?.originCep,
    freight?.destinationCep,
  ]);
  const [pickupDate, setPickupDate] = useState(
    freight?.pickupDate ?? todaySaoPaulo(),
  );
  const tripId = freight?.tripId ?? "";
  const [cargoVehicles, setCargoVehicles] = useState(() =>
    cargoVehiclesOrLegacy(
      freight?.cargoVehicles,
      freight?.cargoVehicleModel ?? null,
      freight?.cargoPlate ?? null,
    ),
  );
  const [fuelLiters, setFuelLiters] = useState(
    freight?.fuelLitersMilli == null
      ? ""
      : String(freight.fuelLitersMilli / 1000).replace(".", ","),
  );
  const [pumpAmount, setPumpAmount] = useState(
    centsToInput(freight?.fuelPumpAmountCents),
  );
  const [yardCost, setYardCost] = useState(
    centsToInput(freight?.yardCostCents),
  );
  const [pickupCost, setPickupCost] = useState(
    centsToInput(freight?.pickupCostCents),
  );
  const [deliveryCost, setDeliveryCost] = useState(
    centsToInput(freight?.deliveryCostCents),
  );
  const [otherCost, setOtherCost] = useState(
    centsToInput(freight?.otherCostCents),
  );
  const [insuranceCostCents, setInsuranceCostCents] = useState(centsToInput(freight?.insuranceCostCents));
  const [invoiceCostCents, setInvoiceCostCents] = useState(centsToInput(freight?.invoiceCostCents));
  const [icmsCostCents, setIcmsCostCents] = useState(centsToInput(freight?.icmsCostCents));
  const [cteMdfeCostCents, setCteMdfeCostCents] = useState(centsToInput(freight?.cteMdfeCostCents));
  const [actualFuel, setActualFuel] = useState(
    centsToInput(freight?.actualFuelCostCents),
  );
  const [toll, setToll] = useState(centsToInput(freight?.tollCents));
  const [driverCommission, setDriverCommission] = useState(
    centsToInput(freight?.driverCommissionCents),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function calculateRoute(from = origin, to = destination) {
    if (hasOdometer || (!from || !to) && !(originCep && destinationCep)) return;
    const sequence = ++routeSequence.current;
    setRouting(true);
    setRouteNotice("");
    try {
      const result = await apiMutation<{
        distanceMeters: number | null;
        notice?: string;
        origin: string; destination: string; attribution?: string;
      }>("/api/fleet/route-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(/^\d{8}$/.test(originCep.replace(/\D/g,"")) && /^\d{8}$/.test(destinationCep.replace(/\D/g,"")) ? {originCep,destinationCep} : { origin: from, destination: to }),
      });
      if (sequence !== routeSequence.current) return;
      setRouteAttribution(result.attribution || "");
      setRouteDistanceMeters(result.distanceMeters);
      if (result.distanceMeters != null)
        setDistance(distanceToInput(result.distanceMeters));
      setRouteNotice(
        result.notice ||
          "Distância rodoviária calculada. Você pode corrigi-la.",
      );
    } catch (e) {
      if (sequence !== routeSequence.current) return;
      setRouteNotice(
        e instanceof Error ? e.message : "Informe a distância manualmente.",
      );
    } finally {
      if (sequence === routeSequence.current) setRouting(false);
    }
  }
  async function lookupCep(side: "origin" | "destination") {
    const cep = side === "origin" ? originCep : destinationCep;
    const sequence = ++routeSequence.current;
    setRouting(true);
    setRouteNotice("");
    try {
      const result = await apiMutation<{ address: string }>(
        `/api/fleet/route-lookup?cep=${encodeURIComponent(cep)}`,
        { method: "GET" },
      );
      if (sequence !== routeSequence.current) return;
      if (side === "origin") setOrigin(result.address);
      else setDestination(result.address);
      await calculateRoute(
        side === "origin" ? result.address : origin,
        side === "destination" ? result.address : destination,
      );
    } catch (e) {
      if (sequence === routeSequence.current) setRouteNotice(e instanceof Error ? e.message : "Preencha manualmente.");
    } finally {
      if (sequence === routeSequence.current) setRouting(false);
    }
  }

  const calculatedCommission = (() => {
    try { return commissionCents(moneyInputToCents(freightValue || "0"), sellerRate); }
    catch { return null; }
  })();
  const preview = (() => {
    try {
      return calculateFleetFreightPreview(
        {
          vehicleId,
          tripId: tripId || null,
          yardCostCents: moneyInputToCents(yardCost || "0"),
          pickupCostCents: moneyInputToCents(pickupCost || "0"),
          deliveryCostCents: moneyInputToCents(deliveryCost || "0"),
          otherCostCents: moneyInputToCents(otherCost || "0"),
          insuranceCostCents: moneyInputToCents(insuranceCostCents || "0"),
          invoiceCostCents: moneyInputToCents(invoiceCostCents || "0"),
          icmsCostCents: moneyInputToCents(icmsCostCents || "0"),
          cteMdfeCostCents: moneyInputToCents(cteMdfeCostCents || "0"),
          actualFuelCostCents: fuelInputToInteger(
            actualFuel,
            "Valor pago combustível",
            2,
          ),
          ...distanceValues(),
          freightAmountCents: moneyInputToCents(freightValue || "0"),
          tollCents: moneyInputToCents(toll || "0"),
          driverCommissionCents: moneyInputToCents(driverCommission || "0"),
          sellerCommissionBasisPoints: sellerRate,
        },
        fleet.parameters,
        fleet.vehicles,
        freight?.tripId
          ? {
              fuelCents: freight.historicalFuelShareCents ?? 0,
              tollCents: freight.sharedTransportCostCents,
              otherCents: 0,
            }
          : undefined,
      );
    } catch {
      return null;
    }
  })();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        vehicleId,
        driverId,
        tripId: tripId || null,
        yardCostCents: moneyInputToCents(yardCost || "0"),
        pickupCostCents: moneyInputToCents(pickupCost || "0"),
        deliveryCostCents: moneyInputToCents(deliveryCost || "0"),
        otherCostCents: moneyInputToCents(otherCost || "0"),
        insuranceCostCents: moneyInputToCents(insuranceCostCents || "0"),
        invoiceCostCents: moneyInputToCents(invoiceCostCents || "0"),
        icmsCostCents: moneyInputToCents(icmsCostCents || "0"),
        cteMdfeCostCents: moneyInputToCents(cteMdfeCostCents || "0"),
        actualFuelCostCents: fuelInputToInteger(
          actualFuel,
          "Valor pago combustível",
          2,
        ),
        clientId: financialOnly ? freight!.clientId ?? null : client?.id ?? null,
        clientName: financialOnly ? freight!.clientName : client?.legalName ?? "",
        cargoVehicles,
        fuelLitersMilli: fuelInputToInteger(
          fuelLiters,
          "Litros abastecidos",
          3,
        ),
        fuelPumpAmountCents: fuelInputToInteger(pumpAmount, "Valor bomba", 2),
        originCep: financialOnly ? freight!.originCep : originCep,
        destinationCep: financialOnly
          ? freight!.destinationCep
          : destinationCep,
        originLocationType: financialOnly ? freight!.originLocationType : form.get("originLocationType"),
        destinationLocationType: financialOnly ? freight!.destinationLocationType : form.get("destinationLocationType"),
        origin: financialOnly ? freight!.origin : form.get("origin"),
        destination: financialOnly
          ? freight!.destination
          : form.get("destination"),
        pickupDate: financialOnly ? freight!.pickupDate : pickupDate,
        deliveryDate: financialOnly
          ? freight!.deliveryDate
          : form.get("deliveryDate") || null,
        billingDate: financialOnly
          ? freight!.billingDate
          : form.get("billingDate") || null,
        operationalStatus: financialOnly
          ? freight!.operationalStatus
          : form.get("operationalStatus"),
        priority: financialOnly ? freight!.priority : form.get("priority"),
        freightAmountCents: moneyInputToCents(freightValue || "0"),
        ...distanceValues(),
        tollCents: moneyInputToCents(toll || "0"),
        driverCommissionCents: moneyInputToCents(driverCommission || "0"),
        ...(!editing ? {sellerId} : {}),
      };
      const saved = await apiMutation<{id: string}>(
        editing ? `/api/fleet/freights/${freight!.id}` : "/api/fleet/freights",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      onSaved(editing ? "Frete atualizado." : "Frete cadastrado.", saved.id, pickupDate.slice(0,7));
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Erro ao salvar o frete.",
      );
    } finally {
      setSaving(false);
    }
  }

  const selectableVehicles = fleet.vehicles.filter(
    (vehicle) => vehicle.active || vehicle.id === freight?.vehicleId,
  );
  const selectableDrivers = fleet.drivers.filter(
    (driver) => driver.active || driver.id === freight?.driverId,
  );

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={editing ? "Editar frete da frota" : "Novo frete da frota"}
      description="Cadastre os veículos da carga e os custos desta operação. O resultado utiliza o combustível realizado quando informado."
    >
      <form className="modal-body form-stack" onSubmit={submit}>
        <fieldset
          disabled={!(fleet.canEditFreights || fleet.canEditFreightFinancials)}
          className="fleet-fieldset"
        >
          {financialOnly && (
            <p className="fleet-update-note">
              Perfil Financeiro: somente os valores do frete e dos custos podem
              ser alterados. Dados operacionais permanecem bloqueados.
            </p>
          )}
          <fieldset disabled={financialOnly} className="fleet-fieldset">
            <div className="section-divider">Identificação</div>
            {tripId && (
              <p className="fleet-update-note">
                Operação vinculada a uma viagem histórica. Seus custos
                compartilhados continuam preservados. O combustível pago
                substitui somente a parcela deste frete.
              </p>
            )}
            <div className="form-grid three">
              {!editing && me.data?.user.role === 'ADMIN' && <Field label="Vendedor"><select value={sellerId} onChange={e=>setSellerId(e.target.value)}><option value="">Sem vendedor</option>{sellers.data?.sellers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>{sellers.error && <span role="alert">{sellers.error}</span>}</Field>}
              <Field label="Veículo da frota">
                <select
                  name="vehicleId"
                  disabled={Boolean(tripId)}
                  value={vehicleId}
                  onChange={(event) => {
                    setVehicleId(event.target.value);
                    const linked = fleet.drivers.find(
                      (d) => d.active && d.vehicleId === event.target.value,
                    );
                    if (linked) setDriverId(linked.id);
                  }}
                  required
                >
                  <option value="">Selecione</option>
                  {selectableVehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.plate}{vehicle.model ? ` · ${vehicle.model}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Motorista">
                <select
                  name="driverId"
                  disabled={Boolean(tripId)}
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                  required
                >
                  <option value="">Selecione</option>
                  {selectableDrivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                    </option>
                  ))}
                </select>
              </Field>
              <ClientAutocomplete channel="FROTA" value={client} onChange={setClient} required disabled={financialOnly} />
            </div>
            <CargoVehiclesEditor
              vehicles={cargoVehicles}
              onChange={setCargoVehicles}
              disabled={financialOnly}
            />
            <div className="section-divider">Rota e datas</div>
            <div className="form-grid two">
              <Field label="Tipo de local de origem"><select name="originLocationType" defaultValue={freight?.originLocationType ?? ""} required={!editing} disabled={financialOnly}><option value="">Selecione o local</option>{ORIGIN_LOCATION_TYPES.map(type=><option key={type} value={type}>{ORIGIN_LOCATION_TYPE_LABELS[type]}</option>)}</select></Field>
              <Field label="Tipo de local de destino"><select name="destinationLocationType" defaultValue={freight?.destinationLocationType ?? ""} required={!editing} disabled={financialOnly}><option value="">Selecione o local</option>{ORIGIN_LOCATION_TYPES.map(type=><option key={type} value={type}>{ORIGIN_LOCATION_TYPE_LABELS[type]}</option>)}</select></Field>
            </div>
            <div className="form-grid two">
              <Field label="CEP de origem">
                <input
                  value={originCep}
                  onChange={(e) => { ++routeSequence.current; setRouting(false); setRouteDistanceMeters(null); setDistance(""); setOriginCep(e.target.value); }}
                  maxLength={9}
                  inputMode="numeric"
                />
                <button
                  type="button"
                  className="button secondary"
                  disabled={routing}
                  onClick={() => lookupCep("origin")}
                >
                  Buscar origem
                </button>
              </Field>
              <Field label="CEP de destino">
                <input
                  value={destinationCep}
                  onChange={(e) => { ++routeSequence.current; setRouting(false); setRouteDistanceMeters(null); setDistance(""); setDestinationCep(e.target.value); }}
                  maxLength={9}
                  inputMode="numeric"
                />
                <button
                  type="button"
                  className="button secondary"
                  disabled={routing}
                  onClick={() => lookupCep("destination")}
                >
                  Buscar destino
                </button>
              </Field>
            </div>
            <button
              type="button"
              className="button secondary"
              disabled={routing || hasOdometer}
              onClick={() => calculateRoute()}
            >
              {routing ? "Consultando rota…" : "Recalcular distância"}
            </button>
            {!hasOdometer && routeNotice && <p role="status">{routeNotice}</p>}
            {!hasOdometer && routeAttribution && <p className="fleet-update-note"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">{routeAttribution}</a></p>}
            {!hasOdometer && routeDistanceMeters != null && (
              <p role="status">
                <strong>
                  Distância pela rota: {formatDistance(routeDistanceMeters)}
                </strong>
              </p>
            )}
            <div className="form-grid two">
              <Field label="KM inicial">
                <input
                  inputMode="decimal"
                  value={kmStart}
                  onChange={(e) => { if (kmEnd.trim()) { ++routeSequence.current; setRouting(false); } setKmStart(e.target.value); }}
                  placeholder="125.300"
                />
              </Field>
              <Field label="KM final">
                <input
                  inputMode="decimal"
                  value={kmEnd}
                  onChange={(e) => { if (kmStart.trim()) { ++routeSequence.current; setRouting(false); } setKmEnd(e.target.value); }}
                  placeholder="125.795"
                />
              </Field>
            </div>
            {kmStart.trim() &&
              kmEnd.trim() &&
              (() => {
                try {
                  return (
                    <p role="status">
                      <strong>
                        Distância realizada:{" "}
                        {formatDistance(distanceValues().distanceMeters)}
                      </strong>
                    </p>
                  );
                } catch (error) {
                  return (
                    <p role="alert" className="form-error">
                      {error instanceof Error
                        ? error.message
                        : "Quilometragem inválida."}
                    </p>
                  );
                }
              })()}
            <div className="form-grid two">
              <Field label="Origem">
                <input
                  name="origin"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  maxLength={180}
                  required
                />
              </Field>
              <Field label="Destino">
                <input
                  name="destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  maxLength={180}
                  required
                />
              </Field>
            </div>
            <div className="form-grid three">
              <Field label="Data da coleta">
                <input
                  name="pickupDate"
                  type="date"
                  value={pickupDate}
                  onChange={(event) => setPickupDate(event.target.value)}
                  required
                />
              </Field>
              <Field label="Data da entrega">
                <input
                  name="deliveryDate"
                  type="date"
                  defaultValue={freight?.deliveryDate ?? ""}
                />
              </Field>
              <Field label="Data do faturamento">
                <input
                  name="billingDate"
                  type="date"
                  defaultValue={freight?.billingDate ?? ""}
                />
              </Field>
            </div>
          </fieldset>
          <div className="section-divider">Operação e valores</div>
          <div className="form-grid four">
            <Field label="Status operacional">
              <select
                name="operationalStatus"
                disabled={financialOnly}
                defaultValue={freight?.operationalStatus ?? "SEM_PREVISAO"}
              >
                {FLEET_OPERATIONAL_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {FLEET_OPERATIONAL_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prioridade">
              <select
                name="priority"
                disabled={financialOnly}
                defaultValue={freight?.priority ?? "NORMAL"}
              >
                {FLEET_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {FLEET_PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Valor do frete">
              <div className="money-field">
                <span>R$</span>
                <input
                  value={freightValue}
                  onChange={(event) => setFreightValue(event.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  required
                />
              </div>
            </Field>
            <Field
              label={hasOdometer ? "Distância realizada" : "Distância manual / calculada"}
              hint="Em km: 1200 ou 1.200. Para decimais, use vírgula (1200,5)."
            >
              <div className="fleet-unit-field">
                <input
                  disabled={financialOnly}
                  readOnly={hasOdometer}
                  value={hasOdometer ? (() => { try { return distanceToInput(distanceValues().distanceMeters); } catch { return ""; } })() : distance}
                  onChange={(event) => { ++routeSequence.current; setRouting(false); setDistance(event.target.value); }}
                  inputMode="decimal"
                  placeholder="0"
                  required
                />
                <span>km</span>
              </div>
            </Field>
          </div>
          <div className="form-grid three">
            <Field label="Pedágio">
              <div className="money-field">
                <span>R$</span>
                <input
                  disabled={Boolean(tripId)}
                  value={toll}
                  onChange={(event) => setToll(event.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                />
              </div>
            </Field>
            <Field label="Motorista / comissão">
              <div className="money-field">
                <span>R$</span>
                <input
                  value={driverCommission}
                  onChange={(event) => setDriverCommission(event.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                />
              </div>
            </Field>
          </div>
          <div className="form-grid four">
            <Field label="Pátio / recebimento (R$)">
              <input
                value={yardCost}
                onChange={(e) => setYardCost(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
              />
            </Field>
            <Field label="Coleta (R$)">
              <input
                value={pickupCost}
                onChange={(e) => setPickupCost(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
              />
            </Field>
            <Field label="Entrega (R$)">
              <input
                value={deliveryCost}
                onChange={(e) => setDeliveryCost(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
              />
            </Field>
            <Field label="Outras despesas (R$)">
              <input
                value={otherCost}
                onChange={(e) => setOtherCost(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
              />
            </Field>
          </div>
          <div className="form-grid four">
            <Field label="Seguro (R$)"><input value={insuranceCostCents} onChange={e => setInsuranceCostCents(e.target.value)} inputMode="decimal" placeholder="0,00" /></Field>
            <Field label="Nota Fiscal (R$)"><input value={invoiceCostCents} onChange={e => setInvoiceCostCents(e.target.value)} inputMode="decimal" placeholder="0,00" /></Field>
            <Field label="ICMS (R$)"><input value={icmsCostCents} onChange={e => setIcmsCostCents(e.target.value)} inputMode="decimal" placeholder="0,00" /></Field>
            <Field label="CTE/MDF (R$)"><input value={cteMdfeCostCents} onChange={e => setCteMdfeCostCents(e.target.value)} inputMode="decimal" placeholder="0,00" /></Field>
          </div>
          <div className="form-grid three">
            <Field label="Litros abastecidos" hint="Até 3 casas decimais.">
              <input
                value={fuelLiters}
                onChange={(e) => setFuelLiters(e.target.value)}
                inputMode="decimal"
                placeholder="0,000"
              />
            </Field>
            <Field
              label="Valor bomba (R$)"
              hint="Valor informado na bomba, separado do valor efetivamente pago."
            >
              <input
                value={pumpAmount}
                onChange={(e) => setPumpAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
              />
            </Field>
            <Field
              label="Valor pago combustível (R$)"
              hint="Custo real. Em branco mantém a estimativa ou parcela histórica; zero é um valor realizado."
            >
              <input
                value={actualFuel}
                onChange={(e) => setActualFuel(e.target.value)}
                inputMode="decimal"
                placeholder="Ainda não apurado"
              />
            </Field>
          </div>
          {(me.data?.user.role === "ADMIN" || me.data?.user.role === "VENDEDOR") && <div className="calculation-summary" aria-live="polite"><span>Comissão calculada</span><strong>{calculatedCommission === null ? "Informe um valor válido" : formatMoney(calculatedCommission)}</strong><small>{!editing && me.data?.user.role === "ADMIN" && !sellerId ? "Selecione o vendedor para calcular a comissão." : "Atualizada automaticamente pelo percentual do vendedor."}</small></div>}
          {preview && (!editing || freight?.sellerCommissionBasisPoints != null) && (
            <>
              <div className="fleet-form-preview fleet-result-preview">
                <div>
                  <span>Custos da operação</span>
                  <strong>{formatMoney(preview.totalCostCents)}</strong>
                </div>
                <div>
                  <span>Resultado / margem</span>
                  <strong
                    className={
                      preview.netRevenueCents < 0 ? "negative" : "positive"
                    }
                  >
                    {formatMoney(preview.netRevenueCents)} ·{" "}
                    {formatPercent(preview.marginBasisPoints)}
                  </strong>
                </div>
                {
                  <>
                    <div>
                      <span>
                        Combustível{" "}
                        {actualFuel.trim()
                          ? "realizado"
                          : tripId
                            ? "da viagem histórica"
                            : "estimado"}
                      </span>
                      <strong>{formatMoney(preview.fuelCostCents)}</strong>
                    </div>
                  </>
                }
              </div>
              <p className="fleet-update-note">
                O resultado operacional desconta combustível e pedágio.{" "}
                {tripId
                  ? "Custos históricos compartilhados são distribuídos entre os fretes vinculados, sem duplicação."
                  : "Sem valor pago informado, o combustível exibido é estimado."}
              </p>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <footer className="modal-actions">
            {freight && fleet.canDeleteFreights && (
              <button
                type="button"
                className="button danger"
                disabled={saving}
                onClick={async () => {
                  setSaving(true); setError(null);
                  try { await onDelete(freight); }
                  catch (error) { setError(error instanceof Error ? error.message : "Não foi possível excluir o frete."); }
                  finally { setSaving(false); }
                }}
              >
                Excluir frete
              </button>
            )}
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button className="button primary" disabled={saving || routing}>
              {saving
                ? "Salvando…"
                : editing
                  ? "Salvar alterações"
                  : "Cadastrar frete"}
            </button>
          </footer>
        </fieldset>
      </form>
      {freight && (fleet.canEditFreights || fleet.canManagePayments) && (
        <FleetPaymentPanel
          id={freight.id}
          status={freight.paymentStatus}
          paidAt={freight.paidAt}
          proofAttachmentId={freight.proofAttachmentId}
          canManagePayments={fleet.canManagePayments}
          onSaved={() => onSaved("Pagamento atualizado.")}
        />
      )}
    </Modal>
  );
}
