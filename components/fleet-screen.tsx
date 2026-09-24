"use client";
import { StorageCleanupNotice } from "@/components/storage-cleanup-notice";
import { useMemo, useState } from "react";
import { FleetMonthlyPanel } from "@/components/fleet-monthly-panel";
import { FleetBilling } from "@/components/fleet-billing";
import { currentCompetency } from "@/lib/domain/dates";
import { cargoVehiclesOrLegacy } from "@/lib/domain/cargo-vehicles";
import { Icons } from "@/components/icons";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/ui";
import { apiMutation, useApi } from "@/components/use-api";
import {
  FLEET_OPERATIONAL_STATUSES,
  FLEET_OPERATIONAL_STATUS_LABELS,
  FLEET_PRIORITIES,
  FLEET_PRIORITY_LABELS,
  type FleetData,
  type FleetDriver,
  type FleetFreight,
  type FleetVehicle,
} from "@/lib/domain/fleet";
import { formatMoney, formatPercent } from "@/lib/format";
import { FreightTable } from "@/components/fleet-freight-table";
import { FreightModal } from "@/components/fleet-freight-modal";
import {
  FleetAssetsPanel,
  VehicleModal,
  DriverModal,
} from "@/components/fleet-assets";

type FleetTab = "overview" | "freights" | "assets" | "monthly" | "billing";

export function FleetScreen() {
  const [competency, setCompetency] = useState(currentCompetency);
  const api = useApi<{ fleet: FleetData }>(
    `/api/fleet?competency=${competency}`,
  );
  const fleet = api.data?.fleet;
  const [selectedTab, setTab] = useState<FleetTab>("overview");
  const tab = fleet?.freightOnly ? "freights" : selectedTab;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [freightModalOpen, setFreightModalOpen] = useState(false);
  const [editingFreight, setEditingFreight] = useState<FleetFreight | null>(
    null,
  );
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<FleetVehicle | null>(
    null,
  );
  const [driverModalOpen, setDriverModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<FleetDriver | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const filteredFreights = useMemo(() => {
    const normalized = search.trim().toLocaleUpperCase("pt-BR");
    return (fleet?.freights ?? []).filter((freight) => {
      const matchesSearch =
        !normalized ||
        [
          freight.vehiclePlate,
          freight.driverName,
          freight.clientName,
          ...cargoVehiclesOrLegacy(
            freight.cargoVehicles,
            freight.cargoVehicleModel,
            freight.cargoPlate,
          ).flatMap((v) => [v.model, v.plate, v.identification]),
          freight.origin,
          freight.destination,
        ].some((value) =>
          value?.toLocaleUpperCase("pt-BR").includes(normalized),
        );
      return (
        matchesSearch &&
        (!status || freight.operationalStatus === status) &&
        (!priority || freight.priority === priority)
      );
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
    setEditingFreight(null);
    setEditingVehicle(null);
    setEditingDriver(null);
    setMutationError(null);
    setSuccess(message);
    api.refresh();
  }
  async function deleteFreight(freight: FleetFreight) {
    if (!window.confirm(`Excluir o frete de ${freight.origin} para ${freight.destination}? Uma venda vinculada será preservada.`)) return;
    setMutationError(null);
    await apiMutation(`/api/fleet/freights/${freight.id}`, { method: "DELETE" });
    finishMutation("Frete excluído.");
  }
  function openVehicle(vehicle: FleetVehicle | null) {
    setEditingVehicle(vehicle);
    setVehicleModalOpen(true);
  }
  function openDriver(driver: FleetDriver | null) {
    setEditingDriver(driver);
    setDriverModalOpen(true);
  }

  const allTabs: Array<{ id: FleetTab; label: string }> = [
    { id: "overview", label: "Visão geral" },
    { id: "freights", label: "Fretes" },
    { id: "assets", label: "Veículos e motoristas" },
    { id: "monthly", label: "Fechamento mensal" },
    { id: "billing", label: "Faturamento" },
  ];
  const tabs = fleet?.freightOnly
    ? allTabs.filter((item) => item.id === "freights")
    : allTabs;

  return (
    <>
      <PageHeader
        eyebrow="Operação logística"
        title="Frota"
        description="Acompanhe os fretes, o resultado por caminhão e o fechamento mensal."
        actions={
          <>
            <label className="compact-filter">
              <span>
                {tab === "monthly" || tab === "billing"
                  ? "Mês de faturamento"
                  : "Competência"}
              </span>
              <input
                type="month"
                value={competency}
                onChange={(event) =>
                  setCompetency(event.target.value || currentCompetency())
                }
              />
            </label>
            {fleet?.canEditFreights && (
              <button className="button primary" onClick={openNewFreight}>
                <Icons.plus /> Novo frete
              </button>
            )}
          </>
        }
      />
      {fleet?.canDeleteFreights && <StorageCleanupNotice key={success} />}
      {success && (
        <p className="success-banner" role="status">
          {success}
        </p>
      )}
      {mutationError && (
        <p className="form-error" role="alert">
          {mutationError}
        </p>
      )}
      {api.loading && <LoadingState label="Carregando a frota…" />}
      {api.error && <ErrorState message={api.error} retry={api.refresh} />}
      {fleet && (
        <div className="fleet-stack">
          <div
            className="fleet-tabs"
            role="tablist"
            aria-label="Áreas da Frota"
          >
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
          {tab === "overview" && !fleet.freightOnly && (
            <>
              <section className="kpi-grid fleet-kpis">
                <article className="kpi-card">
                  <span>Faturamento</span>
                  <strong>{formatMoney(fleet.billing.revenueCents)}</strong>
                  <small>
                    {fleet.billing.freightCount} fretes por data de faturamento
                  </small>
                  <button
                    className="text-button"
                    onClick={() => setTab("billing")}
                  >
                    Ver detalhamento
                  </button>
                </article>
                <article className="kpi-card">
                  <span>Comissões dos motoristas</span>
                  <strong>{formatMoney(fleet.billing.commissionCents)}</strong>
                  <small>Geradas pelos fretes faturados no mês</small>
                  <button
                    className="text-button"
                    onClick={() => setTab("billing")}
                  >
                    Ver motoristas e fretes
                  </button>
                </article>
                <article className="kpi-card accent">
                  <span>Resultado das operações</span>
                  <strong>{formatMoney(fleet.summary.netRevenueCents)}</strong>
                  <small>
                    {formatPercent(fleet.summary.averageMarginBasisPoints)} ·
                    Fretes por mês da coleta; inclui combustível estimado quando
                    não apurado.
                  </small>
                </article>
              </section>
              <section className="panel table-panel">
                <header className="fleet-panel-header">
                  <div>
                    <span className="eyebrow">Atividade recente</span>
                    <h2>Últimos fretes</h2>
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setTab("freights")}
                  >
                    Ver todos
                  </button>
                </header>
                {fleet.freights.length ? (
                  <FreightTable
                    freights={fleet.freights.slice(0, 6)}
                    canManage={fleet.canEditFreights || fleet.canManagePayments}
                    onEdit={openEditFreight}
                  />
                ) : (
                  <EmptyState
                    title="Nenhum frete cadastrado"
                    description="Cadastre a primeira operação da Frota para iniciar os indicadores."
                  />
                )}
              </section>
            </>
          )}
          {tab === "freights" && (
            <>
              <section className="filter-panel fleet-filter-panel">
                <label>
                  <span>Buscar</span>
                  <div className="search-input">
                    <Icons.search />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Cliente, rota, placa ou motorista"
                    />
                  </div>
                </label>
                <label>
                  <span>Status</span>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                  >
                    <option value="">Todos</option>
                    {FLEET_OPERATIONAL_STATUSES.map((item) => (
                      <option key={item} value={item}>
                        {FLEET_OPERATIONAL_STATUS_LABELS[item]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Prioridade</span>
                  <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value)}
                  >
                    <option value="">Todas</option>
                    {FLEET_PRIORITIES.map((item) => (
                      <option key={item} value={item}>
                        {FLEET_PRIORITY_LABELS[item]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="filter-stat">
                  <strong>{filteredFreights.length}</strong>
                  <span>frete{filteredFreights.length === 1 ? "" : "s"}</span>
                </div>
              </section>
              <section className="panel table-panel">
                <FreightTable
                  freights={filteredFreights}
                  canManage={fleet.canEditFreights || fleet.canManagePayments}
                  onEdit={openEditFreight}
                />
              </section>
            </>
          )}
          {tab === "assets" && !fleet.freightOnly && <FleetAssetsPanel fleet={fleet} openVehicle={openVehicle} openDriver={openDriver} />}
        {tab === "monthly" && !fleet.freightOnly && (
            <FleetMonthlyPanel key={competency} competency={competency} />
          )}
          {tab === "billing" && !fleet.freightOnly && (
            <FleetBilling data={fleet.billing} onEdit={openEditFreight} />
          )}
        </div>
      )}
      {freightModalOpen && fleet && (
        <FreightModal
          key={editingFreight?.id ?? "new"}
          freight={editingFreight}
          fleet={fleet}
          onClose={() => setFreightModalOpen(false)}
          onSaved={finishMutation}
          onDelete={deleteFreight}
        />
      )}
      {vehicleModalOpen && (
        <VehicleModal
          canManage={fleet?.canManage ?? false}
          key={editingVehicle?.id ?? "new"}
          vehicle={editingVehicle}
          onClose={() => setVehicleModalOpen(false)}
          onSaved={finishMutation}
        />
      )}
      {driverModalOpen && (
        <DriverModal
          key={editingDriver?.id ?? "new"}
          driver={editingDriver}
          onClose={() => setDriverModalOpen(false)}
          onSaved={finishMutation}
        />
      )}
    </>
  );
}
