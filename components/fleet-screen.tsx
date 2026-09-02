"use client";

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
  calculateFleetFreightMetrics,
  type FleetData,
  type FleetDriver,
  type FleetFreight,
  type FleetVehicle,
  type FleetVehicleCost,
} from "@/lib/domain/fleet";
import {
  competencyLabel,
  formatDate,
  formatMoney,
  formatPercent,
  moneyInputToCents,
} from "@/lib/format";

type FleetTab = "overview" | "freights" | "assets" | "settings";

function centsToInput(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

function decimalValue(value: unknown, label: string) {
  const raw = String(value ?? "").trim().replace(/\s/g, "");
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} deve ser um número válido.`);
  }
  return number;
}

function distanceToInput(distanceMeters: number) {
  return (distanceMeters / 1_000).toLocaleString("pt-BR", {
    maximumFractionDigits: 3,
  });
}

function formatDistance(distanceMeters: number) {
  return `${(distanceMeters / 1_000).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })} km`;
}

function formatRate(cents: number | null) {
  if (cents === null) return "Sem histórico";
  return `${new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)}/km`;
}

function currentCompetency() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function todaySaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function FreightTable({
  freights,
  canManage,
  deletingId,
  onEdit,
  onDelete,
}: {
  freights: FleetFreight[];
  canManage: boolean;
  deletingId: string | null;
  onEdit: (freight: FleetFreight) => void;
  onDelete: (freight: FleetFreight) => void;
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
            <th>Custo</th>
            <th>Margem</th>
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
                  {[freight.cargoVehicleModel, freight.cargoPlate]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </small>
              </td>
              <td data-label="Status">
                <StatusBadge
                  status={FLEET_OPERATIONAL_STATUS_LABELS[freight.operationalStatus]}
                />
                <small>{FLEET_PRIORITY_LABELS[freight.priority]}</small>
              </td>
              <td data-label="Frete">
                <strong>{formatMoney(freight.freightAmountCents)}</strong>
                <small>{formatDistance(freight.distanceMeters)}</small>
              </td>
              <td data-label="Custo">
                <strong>{formatMoney(freight.totalCostCents)}</strong>
                <small>
                  Comb.: {formatMoney(freight.fuelCostCents)} · Fixo: {formatMoney(freight.fixedCostCents)}
                </small>
                <small>
                  Pedágio: {formatMoney(freight.tollCents)} · Motorista: {formatMoney(freight.driverCommissionCents)}
                </small>
              </td>
              <td data-label="Margem">
                <strong className={freight.netRevenueCents < 0 ? "negative" : "positive"}>
                  {formatMoney(freight.netRevenueCents)}
                </strong>
                <small>{formatPercent(freight.marginBasisPoints)}</small>
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
                    <button
                      type="button"
                      className="button secondary compact-button"
                      onClick={() => onEdit(freight)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="button danger compact-button"
                      disabled={deletingId === freight.id}
                      onClick={() => onDelete(freight)}
                    >
                      {deletingId === freight.id ? "Excluindo…" : "Excluir"}
                    </button>
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

function FreightModal({
  freight,
  fleet,
  onClose,
  onSaved,
}: {
  freight: FleetFreight | null;
  fleet: FleetData;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const editing = Boolean(freight);
  const firstVehicle = fleet.vehicles.find((vehicle) => vehicle.active);
  const firstDriver = fleet.drivers.find((driver) => driver.active);
  const [vehicleId, setVehicleId] = useState(freight?.vehicleId ?? firstVehicle?.id ?? "");
  const [freightValue, setFreightValue] = useState(
    centsToInput(freight?.freightAmountCents),
  );
  const [distance, setDistance] = useState(
    freight ? distanceToInput(freight.distanceMeters) : "",
  );
  const [toll, setToll] = useState(centsToInput(freight?.tollCents));
  const [driverCommission, setDriverCommission] = useState(
    centsToInput(freight?.driverCommissionCents),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedVehicle = fleet.vehicles.find((vehicle) => vehicle.id === vehicleId);
  const preview = useMemo(() => {
    try {
      return calculateFleetFreightMetrics(
        {
          distanceMeters: Math.round(decimalValue(distance || "0", "Distância") * 1_000),
          freightAmountCents: moneyInputToCents(freightValue || "0"),
          tollCents: moneyInputToCents(toll || "0"),
          driverCommissionCents: moneyInputToCents(driverCommission || "0"),
        },
        fleet.parameters,
        selectedVehicle?.averageCostPerKmCents ?? null,
      );
    } catch {
      return null;
    }
  }, [distance, driverCommission, fleet.parameters, freightValue, selectedVehicle, toll]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        vehicleId: form.get("vehicleId"),
        driverId: form.get("driverId"),
        clientName: form.get("clientName"),
        cargoVehicleModel: form.get("cargoVehicleModel"),
        cargoPlate: form.get("cargoPlate"),
        origin: form.get("origin"),
        destination: form.get("destination"),
        pickupDate: form.get("pickupDate"),
        deliveryDate: form.get("deliveryDate") || null,
        billingDate: form.get("billingDate") || null,
        operationalStatus: form.get("operationalStatus"),
        priority: form.get("priority"),
        freightAmountCents: moneyInputToCents(freightValue || "0"),
        distanceMeters: Math.round(decimalValue(distance || "0", "Distância") * 1_000),
        tollCents: moneyInputToCents(toll || "0"),
        driverCommissionCents: moneyInputToCents(driverCommission || "0"),
        returnUsed: form.get("returnUsed") === "on",
      };
      await apiMutation(
        editing ? `/api/fleet/freights/${freight!.id}` : "/api/fleet/freights",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      onSaved(editing ? "Frete atualizado." : "Frete cadastrado.");
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Erro ao salvar o frete.",
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
      description="Os custos e a margem são calculados automaticamente pelos parâmetros da Frota."
    >
      <form className="modal-body form-stack" onSubmit={submit}>
        <div className="section-divider">Identificação</div>
        <div className="form-grid three">
          <Field label="Veículo da frota">
            <select
              name="vehicleId"
              value={vehicleId}
              onChange={(event) => setVehicleId(event.target.value)}
              required
            >
              <option value="">Selecione</option>
              {selectableVehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>{vehicle.plate}</option>
              ))}
            </select>
          </Field>
          <Field label="Motorista">
            <select name="driverId" defaultValue={freight?.driverId ?? firstDriver?.id ?? ""} required>
              <option value="">Selecione</option>
              {selectableDrivers.map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Cliente">
            <input name="clientName" defaultValue={freight?.clientName ?? ""} required />
          </Field>
        </div>
        <div className="form-grid two">
          <Field label="Modelo do veículo transportado">
            <input name="cargoVehicleModel" defaultValue={freight?.cargoVehicleModel ?? ""} />
          </Field>
          <Field label="Placa do veículo transportado" hint="Mercosul ou padrão antigo, com 7 caracteres.">
            <input name="cargoPlate" defaultValue={freight?.cargoPlate ?? ""} maxLength={8} />
          </Field>
        </div>

        <div className="section-divider">Rota e datas</div>
        <div className="form-grid two">
          <Field label="Origem">
            <input name="origin" defaultValue={freight?.origin ?? ""} required />
          </Field>
          <Field label="Destino">
            <input name="destination" defaultValue={freight?.destination ?? ""} required />
          </Field>
        </div>
        <div className="form-grid three">
          <Field label="Data da coleta">
            <input name="pickupDate" type="date" defaultValue={freight?.pickupDate ?? todaySaoPaulo()} required />
          </Field>
          <Field label="Data da entrega">
            <input name="deliveryDate" type="date" defaultValue={freight?.deliveryDate ?? ""} />
          </Field>
          <Field label="Data do faturamento">
            <input name="billingDate" type="date" defaultValue={freight?.billingDate ?? ""} />
          </Field>
        </div>

        <div className="section-divider">Operação e valores</div>
        <div className="form-grid four">
          <Field label="Status operacional">
            <select name="operationalStatus" defaultValue={freight?.operationalStatus ?? "SEM_PREVISAO"}>
              {FLEET_OPERATIONAL_STATUSES.map((status) => (
                <option key={status} value={status}>{FLEET_OPERATIONAL_STATUS_LABELS[status]}</option>
              ))}
            </select>
          </Field>
          <Field label="Prioridade">
            <select name="priority" defaultValue={freight?.priority ?? "NORMAL"}>
              {FLEET_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>{FLEET_PRIORITY_LABELS[priority]}</option>
              ))}
            </select>
          </Field>
          <Field label="Valor do frete">
            <div className="money-field"><span>R$</span><input value={freightValue} onChange={(event) => setFreightValue(event.target.value)} inputMode="decimal" placeholder="0,00" required /></div>
          </Field>
          <Field label="Distância">
            <div className="fleet-unit-field"><input value={distance} onChange={(event) => setDistance(event.target.value)} inputMode="decimal" placeholder="0" required /><span>km</span></div>
          </Field>
        </div>
        <div className="form-grid three">
          <Field label="Pedágio">
            <div className="money-field"><span>R$</span><input value={toll} onChange={(event) => setToll(event.target.value)} inputMode="decimal" placeholder="0,00" /></div>
          </Field>
          <Field label="Motorista / comissão">
            <div className="money-field"><span>R$</span><input value={driverCommission} onChange={(event) => setDriverCommission(event.target.value)} inputMode="decimal" placeholder="0,00" /></div>
          </Field>
          <label className="fleet-check-field">
            <input name="returnUsed" type="checkbox" defaultChecked={freight?.returnUsed ?? false} />
            <span>Retorno já aproveitado</span>
          </label>
        </div>

        {preview && (
          <div className="fleet-form-preview" aria-label="Prévia dos cálculos">
            <div><span>Combustível</span><strong>{formatMoney(preview.fuelCostCents)}</strong></div>
            <div><span>Custo fixo</span><strong>{formatMoney(preview.fixedCostCents)}</strong></div>
            <div><span>Custo total</span><strong>{formatMoney(preview.totalCostCents)}</strong></div>
            <div><span>Margem líquida</span><strong className={preview.netRevenueCents < 0 ? "negative" : "positive"}>{formatMoney(preview.netRevenueCents)} · {formatPercent(preview.marginBasisPoints)}</strong></div>
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancelar</button>
          <button className="button primary" disabled={saving}>{saving ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar frete"}</button>
        </footer>
      </form>
    </Modal>
  );
}

function VehicleModal({
  vehicle,
  onClose,
  onSaved,
}: {
  vehicle: FleetVehicle | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiMutation(vehicle ? `/api/fleet/vehicles/${vehicle.id}` : "/api/fleet/vehicles", {
        method: vehicle ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plate: form.get("plate"),
          active: form.get("active") !== "false",
        }),
      });
      onSaved(vehicle ? "Veículo atualizado." : "Veículo cadastrado.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Erro ao salvar veículo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={vehicle ? "Editar veículo" : "Novo veículo da frota"}>
      <form className="modal-body form-stack" onSubmit={submit}>
        <Field label="Placa">
          <input name="plate" defaultValue={vehicle?.plate ?? ""} maxLength={8} required />
        </Field>
        {vehicle && (
          <Field label="Situação">
            <select name="active" defaultValue={vehicle.active ? "true" : "false"}>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </Field>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancelar</button>
          <button className="button primary" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
        </footer>
      </form>
    </Modal>
  );
}

function DriverModal({
  driver,
  onClose,
  onSaved,
}: {
  driver: FleetDriver | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiMutation(driver ? `/api/fleet/drivers/${driver.id}` : "/api/fleet/drivers", {
        method: driver ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          active: form.get("active") !== "false",
        }),
      });
      onSaved(driver ? "Motorista atualizado." : "Motorista cadastrado.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Erro ao salvar motorista.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={driver ? "Editar motorista" : "Novo motorista"}>
      <form className="modal-body form-stack" onSubmit={submit}>
        <Field label="Nome">
          <input name="name" defaultValue={driver?.name ?? ""} required />
        </Field>
        {driver && (
          <Field label="Situação">
            <select name="active" defaultValue={driver.active ? "true" : "false"}>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </Field>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancelar</button>
          <button className="button primary" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
        </footer>
      </form>
    </Modal>
  );
}

function CostModal({
  cost,
  defaultVehicleId,
  vehicles,
  onClose,
  onSaved,
}: {
  cost: FleetVehicleCost | null;
  defaultVehicleId: string | null;
  vehicles: FleetVehicle[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        vehicleId: form.get("vehicleId"),
        competency: form.get("competency"),
        distanceMeters: Math.round(decimalValue(form.get("distance"), "Quilometragem") * 1_000),
        monthlyCostCents: moneyInputToCents(form.get("monthlyCost")),
      };
      await apiMutation(
        cost ? `/api/fleet/vehicle-costs/${cost.id}` : "/api/fleet/vehicle-costs",
        {
          method: cost ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      onSaved(cost ? "Custo mensal atualizado." : "Custo mensal cadastrado.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Erro ao salvar custo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={cost ? "Editar custo mensal" : "Novo custo mensal"} description="O custo por km e a média do veículo serão recalculados automaticamente.">
      <form className="modal-body form-stack" onSubmit={submit}>
        <Field label="Veículo">
          <select name="vehicleId" defaultValue={cost?.vehicleId ?? defaultVehicleId ?? ""} required>
            <option value="">Selecione</option>
            {vehicles.filter((vehicle) => vehicle.active || vehicle.id === cost?.vehicleId).map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>{vehicle.plate}</option>
            ))}
          </select>
        </Field>
        <div className="form-grid two">
          <Field label="Competência">
            <input name="competency" type="month" defaultValue={cost?.competency ?? currentCompetency()} required />
          </Field>
          <Field label="KM no mês">
            <div className="fleet-unit-field"><input name="distance" defaultValue={cost ? distanceToInput(cost.distanceMeters) : ""} inputMode="decimal" required /><span>km</span></div>
          </Field>
        </div>
        <Field label="Custo do mês">
          <div className="money-field"><span>R$</span><input name="monthlyCost" defaultValue={centsToInput(cost?.monthlyCostCents)} inputMode="decimal" required /></div>
        </Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancelar</button>
          <button className="button primary" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
        </footer>
      </form>
    </Modal>
  );
}

function SettingsPanel({
  fleet,
  onSaved,
}: {
  fleet: FleetData;
  onSaved: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { parameters } = fleet;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const office = String(form.get("officeMonthlyCost") ?? "").trim();
      await apiMutation("/api/fleet/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fuelPriceCents: moneyInputToCents(form.get("fuelPrice")),
          averageConsumptionMilliKmPerLiter: Math.round(
            decimalValue(form.get("averageConsumption"), "Consumo médio") * 1_000,
          ),
          fallbackFixedCostPerKmCents: moneyInputToCents(form.get("fallbackFixedCost")),
          matchWindowDays: Math.round(decimalValue(form.get("matchWindowDays"), "Janela de encaixe")),
          officeMonthlyCostCents: office ? moneyInputToCents(office) : null,
        }),
      });
      onSaved("Parâmetros atualizados. Todos os cálculos foram refeitos.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Erro ao salvar parâmetros.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel fleet-settings-panel">
      <header>
        <div>
          <span className="eyebrow">Base dos cálculos</span>
          <h2>Parâmetros de custo e operação</h2>
          <p>Alterações nesta área atualizam os indicadores e custos de todos os fretes.</p>
        </div>
      </header>
      <form className="form-stack" onSubmit={submit}>
        <div className="form-grid two">
          <Field label="Preço do combustível" hint="Valor por litro.">
            <div className="money-field"><span>R$</span><input name="fuelPrice" defaultValue={centsToInput(parameters.fuelPriceCents)} inputMode="decimal" disabled={!fleet.canManage} required /></div>
          </Field>
          <Field label="Consumo médio" hint="Quilômetros por litro do veículo carregado.">
            <div className="fleet-unit-field"><input name="averageConsumption" defaultValue={(parameters.averageConsumptionMilliKmPerLiter / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} inputMode="decimal" disabled={!fleet.canManage} required /><span>km/l</span></div>
          </Field>
        </div>
        <div className="form-grid two">
          <Field label="Custo fixo padrão por km" hint="Usado quando o veículo ainda não possui histórico mensal.">
            <div className="money-field"><span>R$</span><input name="fallbackFixedCost" defaultValue={centsToInput(parameters.fallbackFixedCostPerKmCents)} inputMode="decimal" disabled={!fleet.canManage} required /></div>
          </Field>
          <Field label="Janela para considerar encaixe" hint="Dias entre uma entrega e nova coleta na mesma região.">
            <div className="fleet-unit-field"><input name="matchWindowDays" type="number" min="0" max="90" defaultValue={parameters.matchWindowDays} disabled={!fleet.canManage} required /><span>dias</span></div>
          </Field>
        </div>
        <Field label="Custo fixo mensal do escritório" hint="Salários, materiais, softwares, energia, aluguel, pró-labore, internet e cozinha.">
          <div className="money-field"><span>R$</span><input name="officeMonthlyCost" defaultValue={centsToInput(parameters.officeMonthlyCostCents)} inputMode="decimal" disabled={!fleet.canManage} placeholder="Opcional" /></div>
        </Field>
        {parameters.updatedAt && (
          <p className="fleet-update-note">
            Última alteração em {formatDate(parameters.updatedAt)}
            {parameters.updatedByName ? ` por ${parameters.updatedByName}` : ""}.
          </p>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        {fleet.canManage && (
          <div className="fleet-settings-actions">
            <button className="button primary" disabled={saving}>{saving ? "Salvando…" : "Salvar parâmetros"}</button>
          </div>
        )}
      </form>
    </section>
  );
}

export function FleetScreen() {
  const api = useApi<{ fleet: FleetData }>("/api/fleet");
  const fleet = api.data?.fleet;
  const [tab, setTab] = useState<FleetTab>("overview");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [freightModalOpen, setFreightModalOpen] = useState(false);
  const [editingFreight, setEditingFreight] = useState<FleetFreight | null>(null);
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<FleetVehicle | null>(null);
  const [driverModalOpen, setDriverModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<FleetDriver | null>(null);
  const [costModalOpen, setCostModalOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<FleetVehicleCost | null>(null);
  const [costVehicleId, setCostVehicleId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const filteredFreights = useMemo(() => {
    const normalized = search.trim().toLocaleUpperCase("pt-BR");
    return (fleet?.freights ?? []).filter((freight) => {
      const matchesSearch = !normalized || [
        freight.vehiclePlate,
        freight.driverName,
        freight.clientName,
        freight.cargoVehicleModel,
        freight.cargoPlate,
        freight.origin,
        freight.destination,
      ].some((value) => value?.toLocaleUpperCase("pt-BR").includes(normalized));
      return matchesSearch && (!status || freight.operationalStatus === status) &&
        (!priority || freight.priority === priority);
    });
  }, [fleet, priority, search, status]);

  function openNewFreight() {
    setEditingFreight(null);
    setMutationError(null);
    setFreightModalOpen(true);
  }

  function openEditFreight(freight: FleetFreight) {
    setEditingFreight(freight);
    setMutationError(null);
    setFreightModalOpen(true);
  }

  function finishMutation(message: string) {
    setFreightModalOpen(false);
    setVehicleModalOpen(false);
    setDriverModalOpen(false);
    setCostModalOpen(false);
    setEditingFreight(null);
    setEditingVehicle(null);
    setEditingDriver(null);
    setEditingCost(null);
    setCostVehicleId(null);
    setMutationError(null);
    setSuccess(message);
    api.refresh();
  }

  async function deleteFreight(freight: FleetFreight) {
    if (!window.confirm(`Excluir o frete de ${freight.origin} para ${freight.destination}?`)) return;
    setDeletingId(freight.id);
    setMutationError(null);
    try {
      await apiMutation(`/api/fleet/freights/${freight.id}`, { method: "DELETE" });
      finishMutation("Frete excluído.");
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "Erro ao excluir frete.");
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteCost(cost: FleetVehicleCost) {
    if (!window.confirm(`Excluir o custo de ${competencyLabel(cost.competency)}?`)) return;
    setDeletingId(cost.id);
    setMutationError(null);
    try {
      await apiMutation(`/api/fleet/vehicle-costs/${cost.id}`, { method: "DELETE" });
      finishMutation("Custo mensal excluído.");
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "Erro ao excluir custo.");
    } finally {
      setDeletingId(null);
    }
  }

  function openVehicle(vehicle: FleetVehicle | null) {
    setEditingVehicle(vehicle);
    setVehicleModalOpen(true);
  }

  function openDriver(driver: FleetDriver | null) {
    setEditingDriver(driver);
    setDriverModalOpen(true);
  }

  function openCost(cost: FleetVehicleCost | null, vehicleId: string | null) {
    setEditingCost(cost);
    setCostVehicleId(vehicleId);
    setCostModalOpen(true);
  }

  const tabs: Array<{ id: FleetTab; label: string }> = [
    { id: "overview", label: "Visão geral" },
    { id: "freights", label: "Fretes" },
    { id: "assets", label: "Veículos e custos" },
    { id: "settings", label: "Parâmetros" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Operação logística"
        title="Frota"
        description="Controle fretes, veículos, motoristas, custos por quilômetro, margem e oportunidades de retorno."
        actions={fleet?.canManage ? (
          <button className="button primary" onClick={openNewFreight}>
            <Icons.plus /> Novo frete
          </button>
        ) : null}
      />
      {success && <p className="success-banner" role="status">{success}</p>}
      {mutationError && <p className="form-error" role="alert">{mutationError}</p>}
      {api.loading && <LoadingState label="Carregando a frota…" />}
      {api.error && <ErrorState message={api.error} retry={api.refresh} />}
      {fleet && (
        <div className="fleet-stack">
          <div className="fleet-tabs" role="tablist" aria-label="Áreas da Frota">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? "active" : ""}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <>
              <section className="kpi-grid fleet-kpis">
                <article className="kpi-card"><span>Fretes registrados</span><strong>{fleet.summary.freightCount}</strong><small>Operações cadastradas</small></article>
                <article className="kpi-card"><span>Faturamento total</span><strong>{formatMoney(fleet.summary.revenueCents)}</strong><small>Soma do valor dos fretes</small></article>
                <article className="kpi-card"><span>Custo total</span><strong>{formatMoney(fleet.summary.totalCostCents)}</strong><small>Combustível, pedágio, motorista e custo fixo</small></article>
                <article className="kpi-card accent"><span>Margem líquida total</span><strong>{formatMoney(fleet.summary.netRevenueCents)} <em>{formatPercent(fleet.summary.averageMarginBasisPoints)}</em></strong><small>Margem ponderada pelo faturamento</small></article>
              </section>
              <section className="fleet-opportunity-grid">
                <article className="panel fleet-opportunity-card">
                  <span className="fleet-opportunity-icon"><Icons.map /></span>
                  <div><span>Possíveis encaixes</span><strong>{fleet.summary.possibleMatchCount}</strong><small>Destino compatível com nova coleta dentro de {fleet.parameters.matchWindowDays} dia{fleet.parameters.matchWindowDays === 1 ? "" : "s"}</small></div>
                </article>
                <article className="panel fleet-opportunity-card">
                  <span className="fleet-opportunity-icon used"><Icons.truck /></span>
                  <div><span>Retornos aproveitados</span><strong>{fleet.summary.returnUsedCount}</strong><small>Marcados manualmente pela equipe</small></div>
                </article>
              </section>
              <section className="panel table-panel">
                <header className="fleet-panel-header">
                  <div><span className="eyebrow">Atividade recente</span><h2>Últimos fretes</h2></div>
                  <button type="button" className="text-button" onClick={() => setTab("freights")}>Ver todos</button>
                </header>
                {fleet.freights.length ? (
                  <FreightTable freights={fleet.freights.slice(0, 6)} canManage={fleet.canManage} deletingId={deletingId} onEdit={openEditFreight} onDelete={deleteFreight} />
                ) : (
                  <EmptyState title="Nenhum frete cadastrado" description="Cadastre a primeira operação da Frota para iniciar os indicadores." />
                )}
              </section>
            </>
          )}

          {tab === "freights" && (
            <>
              <section className="filter-panel fleet-filter-panel">
                <label><span>Buscar</span><div className="search-input"><Icons.search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente, rota, placa ou motorista" /></div></label>
                <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option>{FLEET_OPERATIONAL_STATUSES.map((item) => <option key={item} value={item}>{FLEET_OPERATIONAL_STATUS_LABELS[item]}</option>)}</select></label>
                <label><span>Prioridade</span><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Todas</option>{FLEET_PRIORITIES.map((item) => <option key={item} value={item}>{FLEET_PRIORITY_LABELS[item]}</option>)}</select></label>
                <div className="filter-stat"><strong>{filteredFreights.length}</strong><span>frete{filteredFreights.length === 1 ? "" : "s"}</span></div>
              </section>
              <section className="panel table-panel">
                <FreightTable freights={filteredFreights} canManage={fleet.canManage} deletingId={deletingId} onEdit={openEditFreight} onDelete={deleteFreight} />
              </section>
            </>
          )}

          {tab === "assets" && (
            <div className="fleet-assets-stack">
              <section className="panel table-panel">
                <header className="fleet-panel-header">
                  <div><span className="eyebrow">Cadastro</span><h2>Veículos da frota</h2><p>A média por km usa o histórico mensal de cada placa.</p></div>
                  {fleet.canManage && <button type="button" className="button primary" onClick={() => openVehicle(null)}><Icons.plus /> Novo veículo</button>}
                </header>
                <div className="responsive-table">
                  <table>
                    <thead><tr><th>Placa</th><th>Custo médio por km</th><th>Meses calculados</th><th>Situação</th>{fleet.canManage && <th><span className="sr-only">Ações</span></th>}</tr></thead>
                    <tbody>
                      {fleet.vehicles.map((vehicle) => (
                        <tr key={vehicle.id}>
                          <td data-label="Placa"><strong>{vehicle.plate}</strong></td>
                          <td data-label="Custo médio por km"><strong>{formatRate(vehicle.averageCostPerKmCents)}</strong></td>
                          <td data-label="Meses calculados">{vehicle.costs.length}</td>
                          <td data-label="Situação"><StatusBadge status={vehicle.active ? "ATIVO" : "INATIVO"} /></td>
                          {fleet.canManage && <td data-label="Ações"><div className="table-actions"><button type="button" className="button secondary compact-button" onClick={() => openCost(null, vehicle.id)}>Adicionar custo</button><button type="button" className="button secondary compact-button" onClick={() => openVehicle(vehicle)}>Editar</button></div></td>}
                        </tr>
                      ))}
                      {!fleet.vehicles.length && <tr><td colSpan={fleet.canManage ? 5 : 4} className="empty-cell">Nenhum veículo cadastrado.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="panel table-panel">
                <header className="fleet-panel-header">
                  <div><span className="eyebrow">Custo rateado</span><h2>Histórico mensal por veículo</h2></div>
                  {fleet.canManage && <button type="button" className="button secondary" onClick={() => openCost(null, null)}><Icons.plus /> Novo custo</button>}
                </header>
                <div className="responsive-table">
                  <table>
                    <thead><tr><th>Veículo</th><th>Competência</th><th>KM/mês</th><th>Custo do mês</th><th>Custo/km</th>{fleet.canManage && <th><span className="sr-only">Ações</span></th>}</tr></thead>
                    <tbody>
                      {fleet.vehicles.flatMap((vehicle) => vehicle.costs.map((cost) => ({ vehicle, cost }))).sort((a, b) => b.cost.competency.localeCompare(a.cost.competency) || a.vehicle.plate.localeCompare(b.vehicle.plate)).map(({ vehicle, cost }) => (
                        <tr key={cost.id}>
                          <td data-label="Veículo"><strong>{vehicle.plate}</strong></td>
                          <td data-label="Competência">{competencyLabel(cost.competency)}</td>
                          <td data-label="KM/mês">{formatDistance(cost.distanceMeters)}</td>
                          <td data-label="Custo do mês">{formatMoney(cost.monthlyCostCents)}</td>
                          <td data-label="Custo/km"><strong>{formatRate(cost.costPerKmCents)}</strong></td>
                          {fleet.canManage && <td data-label="Ações"><div className="table-actions"><button type="button" className="button secondary compact-button" onClick={() => openCost(cost, cost.vehicleId)}>Editar</button><button type="button" className="button danger compact-button" disabled={deletingId === cost.id} onClick={() => deleteCost(cost)}>{deletingId === cost.id ? "Excluindo…" : "Excluir"}</button></div></td>}
                        </tr>
                      ))}
                      {!fleet.vehicles.some((vehicle) => vehicle.costs.length) && <tr><td colSpan={fleet.canManage ? 6 : 5} className="empty-cell">Nenhum custo mensal cadastrado.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="panel table-panel">
                <header className="fleet-panel-header">
                  <div><span className="eyebrow">Equipe</span><h2>Motoristas</h2></div>
                  {fleet.canManage && <button type="button" className="button secondary" onClick={() => openDriver(null)}><Icons.plus /> Novo motorista</button>}
                </header>
                <div className="responsive-table">
                  <table>
                    <thead><tr><th>Nome</th><th>Situação</th>{fleet.canManage && <th><span className="sr-only">Ações</span></th>}</tr></thead>
                    <tbody>
                      {fleet.drivers.map((driver) => (
                        <tr key={driver.id}>
                          <td data-label="Nome"><strong>{driver.name}</strong></td>
                          <td data-label="Situação"><StatusBadge status={driver.active ? "ATIVO" : "INATIVO"} /></td>
                          {fleet.canManage && <td data-label="Ações"><div className="table-actions"><button type="button" className="button secondary compact-button" onClick={() => openDriver(driver)}>Editar</button></div></td>}
                        </tr>
                      ))}
                      {!fleet.drivers.length && <tr><td colSpan={fleet.canManage ? 3 : 2} className="empty-cell">Nenhum motorista cadastrado.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {tab === "settings" && (
            <SettingsPanel key={fleet.parameters.updatedAt ?? "default"} fleet={fleet} onSaved={finishMutation} />
          )}
        </div>
      )}

      {freightModalOpen && fleet && (
        <FreightModal key={editingFreight?.id ?? "new"} freight={editingFreight} fleet={fleet} onClose={() => setFreightModalOpen(false)} onSaved={finishMutation} />
      )}
      {vehicleModalOpen && (
        <VehicleModal key={editingVehicle?.id ?? "new"} vehicle={editingVehicle} onClose={() => setVehicleModalOpen(false)} onSaved={finishMutation} />
      )}
      {driverModalOpen && (
        <DriverModal key={editingDriver?.id ?? "new"} driver={editingDriver} onClose={() => setDriverModalOpen(false)} onSaved={finishMutation} />
      )}
      {costModalOpen && fleet && (
        <CostModal key={editingCost?.id ?? `new-${costVehicleId ?? "none"}`} cost={editingCost} defaultVehicleId={costVehicleId} vehicles={fleet.vehicles} onClose={() => setCostModalOpen(false)} onSaved={finishMutation} />
      )}
    </>
  );
}
