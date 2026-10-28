"use client";
import { SellerFleetScreen } from "@/components/seller-fleet-screen";
import { useTransientMessage } from "@/components/use-transient-message";
import Link from "next/link";
import { roleCan } from "@/lib/domain/permissions";
import type { CurrentUser } from "@/lib/contracts";

import { StorageCleanupNotice } from "@/components/storage-cleanup-notice";
import { useMemo, useState } from "react";
import { DatePeriodFields } from "./date-period-fields";
import { currentDatePeriod } from "@/lib/domain/date-period";
import { cargoVehiclesOrLegacy } from "@/lib/domain/cargo-vehicles";
import { Icons } from "@/components/icons";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  Modal,
} from "@/components/ui";
import { apiMutation, useApi } from "@/components/use-api";
import {
  FLEET_OPERATIONAL_STATUSES,
  FLEET_OPERATIONAL_STATUS_LABELS,
  FLEET_FINANCIAL_STATUSES,
  FLEET_FINANCIAL_STATUS_LABELS,
  fleetFinancialStatus,
  type FleetData,
  type FleetDriver,
  type FleetFreight,
  type FleetVehicle,
} from "@/lib/domain/fleet";
import { formatMoney } from "@/lib/format";
import { FreightTable } from "@/components/fleet-freight-table";
import { FleetFreightDetail } from "@/components/fleet-freight-detail";
import { FleetFreightFormScreen } from "@/components/fleet-freight-form-screen";
import {
  FleetAssetsPanel,
  VehicleModal,
  DriverModal,
} from "@/components/fleet-assets";

type FleetTab = "freights" | "assets";

function sellerFilterValue(freight: FleetFreight) {
  if (freight.sellerId) return `id:${freight.sellerId}`;
  const name = freight.sellerName?.trim();
  return name ? `name:${name}` : "unassigned";
}

export function FleetScreen() {
  const me = useApi<{user: CurrentUser}>("/api/me");
  if (me.loading) return <LoadingState label="Carregando acesso à Frota…" />;
  if (me.error) return <ErrorState message={me.error} retry={me.refresh} />;
  if (!me.data) return null;
  if (roleCan(me.data.user.role, "FLEET_SALES_ONLY")) return <SellerFleetScreen />;
  return <FleetOperationsScreen />;
}

function FleetOperationsScreen() {
  const [calculationOpen, setCalculationOpen] = useState(false);
  const [selectedTab, setTab] = useState<FleetTab>("freights");
  const [period,setPeriod]=useState(currentDatePeriod);
  const competency=period.from.slice(0,7);
  const api = useApi<{ fleet: FleetData }>(`/api/fleet?${new URLSearchParams(period)}`);
  const fleet = api.data?.fleet;
  const tab = fleet?.freightOnly ? "freights" : selectedTab;
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [financialStatus, setFinancialStatus] = useState("");
  const [seller, setSeller] = useState("");
  const [freightFormOpen, setFreightFormOpen] = useState(false);
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
  const [success, setSuccess] = useTransientMessage();

  const sellerOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const freight of fleet?.freights ?? []) {
      options.set(sellerFilterValue(freight), freight.sellerName?.trim() || "Não informado");
    }
    return [...options].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [fleet]);

  const filteredFreights = useMemo(() => {
    const normalized = search.trim().toLocaleUpperCase("pt-BR");
    return (fleet?.freights ?? []).filter((freight) => {
      const matchesSearch =
        !normalized ||
        [
          freight.saleNumber,
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
        (!financialStatus || fleetFinancialStatus(freight) === financialStatus) &&
        (!seller || sellerFilterValue(freight) === seller)
      );
    });
  }, [fleet, financialStatus, search, seller, status]);

  function openNewFreight() {
    setEditingFreight(null);
    setMutationError(null);
    setFreightFormOpen(true);
  }
  function openEditFreight(freight: FleetFreight) {
    setEditingFreight(freight);
    setMutationError(null);
    setFreightFormOpen(true);
  }
  function finishMutation(message: string, id?: string, savedCompetency?: string, _accessTransferred?: boolean, savedPickupDate?: string) {
    if(savedPickupDate && (savedPickupDate<period.from||savedPickupDate>period.to)) {
      setPeriod(current=>({from:savedPickupDate<current.from?savedPickupDate:current.from,to:savedPickupDate>current.to?savedPickupDate:current.to}));
    } else if(!savedPickupDate && savedCompetency && (savedCompetency<period.from.slice(0,7)||savedCompetency>period.to.slice(0,7))){const d=new Date(`${savedCompetency}-01T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);setPeriod({from:`${savedCompetency}-01`,to:d.toISOString().slice(0,10)});}
    if (id) setViewingId(id);
    setFreightFormOpen(false);
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
    if (!window.confirm(`Excluir o frete de ${freight.origin} para ${freight.destination}? A OS própria deste frete será removida. Uma venda vinculada e sua OS serão preservadas.`)) return;
    setMutationError(null);
    await apiMutation(`/api/fleet/freights/${freight.id}`, { method: "DELETE" });
    setViewingId(null);
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
    { id: "freights", label: "Fretes" },
    { id: "assets", label: "Veículos e motoristas" },
  ];
  const tabs = fleet?.freightOnly
    ? allTabs.filter((item) => item.id === "freights")
    : allTabs;

  const viewedFreight = fleet?.freights.find(f => f.id === viewingId) ?? fleet?.billing.freights.find(f => f.id === viewingId);
  if (freightFormOpen && fleet) return (
    <FleetFreightFormScreen
      key={editingFreight?.id ?? "new"}
      freight={editingFreight}
      fleet={fleet}
      onClose={() => setFreightFormOpen(false)}
      onSaved={finishMutation}
      onDelete={deleteFreight}
    />
  );
  return (
    <>
    <div className="fleet-module">
      {viewedFreight ? <>
        <PageHeader eyebrow={`Venda ${viewedFreight.saleNumber}`} title="Detalhes do frete" description={`${viewedFreight.origin} → ${viewedFreight.destination}`} actions={<><button className="button secondary" onClick={() => setViewingId(null)}>Voltar à Frota</button><Link className="button secondary" href={`/frota/fretes/${viewedFreight.id}/os`}>Visualizar OS</Link>{fleet?.canEditFreights || fleet?.canEditFreightFinancials || fleet?.canManagePayments ? <button className="button primary" onClick={() => openEditFreight(viewedFreight)}>Editar frete</button> : null}</>} />
        <FleetFreightDetail freight={viewedFreight} />
      </> : <>
      <PageHeader
        eyebrow="Operação logística"
        title="Frota"
        description="Acompanhe os fretes e a situação financeira pelo período de coleta."
        actions={
          <>
            <DatePeriodFields value={period} onChange={setPeriod} />
            {fleet?.freightOnly && <Link className="button secondary" href={`/vendas?canal=FROTA&competency=${competency}`}>Vendas Frota</Link>}
            {tab === "freights" && fleet?.canEditFreights && (
              <button className="button secondary create-sale-action" onClick={openNewFreight}>
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
            className="cegonha-tabs module-tabs"
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
                  <span>Situação financeira</span>
                  <select
                    value={financialStatus}
                    onChange={(event) => setFinancialStatus(event.target.value)}
                  >
                    <option value="">Todas</option>
                    {FLEET_FINANCIAL_STATUSES.map((item) => (
                      <option key={item} value={item}>
                        {FLEET_FINANCIAL_STATUS_LABELS[item]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Vendedor</span>
                  <select
                    value={seller}
                    onChange={(event) => setSeller(event.target.value)}
                  >
                    <option value="">Todos</option>
                    {sellerOptions.map(([value, name]) => (
                      <option key={value} value={value}>{name}</option>
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
                  onOpen={f => setViewingId(f.id)}
                />
              </section>
            </>
          )}
          {tab === "assets" && !fleet.freightOnly && <FleetAssetsPanel fleet={fleet} openVehicle={openVehicle} openDriver={openDriver} />}
        </div>
      )}
      </>}
    </div>
      <Modal open={calculationOpen} onClose={() => setCalculationOpen(false)} title="Como é calculado o resultado das operações?">
        <div className="modal-body form-stack"><p>Receita dos fretes coletados no mês ({formatMoney(fleet?.summary.revenueCents ?? 0)}) menos os custos das operações ({formatMoney(fleet?.summary.totalCostCents ?? 0)}). Inclui comissões, despesas diretas, combustível e pedágios. Não inclui custos fixos mensais, rateio por km ou vendas sem frete vinculado. O faturamento usa outra base: a data de faturamento.</p><footer className="modal-actions"><button type="button" className="button secondary" onClick={() => setCalculationOpen(false)}>Fechar</button></footer></div>
      </Modal>
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
