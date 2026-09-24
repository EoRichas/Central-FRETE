"use client";
import { cargoVehiclesOrLegacy } from "@/lib/domain/cargo-vehicles";
import { Icons } from "@/components/icons";
import { StatusBadge } from "@/components/ui";
import {
  FLEET_OPERATIONAL_STATUS_LABELS,
  FLEET_PRIORITY_LABELS,
  type FleetFreight,
} from "@/lib/domain/fleet";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";

function formatDistance(distanceMeters: number) {
  return `${(distanceMeters / 1_000).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })} km`;
}

export function FreightTable({
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
            <th>Custos da operação</th>
            <th>Resultado / margem</th>
            {canManage && (
              <th>
                <span className="sr-only">Ações</span>
              </th>
            )}
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
                  {
                    cargoVehiclesOrLegacy(
                      freight.cargoVehicles,
                      freight.cargoVehicleModel,
                      freight.cargoPlate,
                    ).length
                  }{" "}
                  veículo(s)
                  {cargoVehiclesOrLegacy(
                    freight.cargoVehicles,
                    freight.cargoVehicleModel,
                    freight.cargoPlate,
                  ).map((v, i) => (
                    <span className="cargo-summary" key={i}>
                      {[v.model, v.plate, v.identification]
                        .filter(Boolean)
                        .join(" · ") || "Identificação não informada"}
                    </span>
                  ))}
                </small>
              </td>
              <td data-label="Status">
                <StatusBadge
                  status={
                    FLEET_OPERATIONAL_STATUS_LABELS[freight.operationalStatus]
                  }
                />
                <small>{FLEET_PRIORITY_LABELS[freight.priority]}</small>
                <StatusBadge status={freight.paymentStatus} />
              </td>
              <td data-label="Frete">
                <strong>{formatMoney(freight.freightAmountCents)}</strong>
                <small>{formatDistance(freight.distanceMeters)}</small>
              </td>
              <td data-label="Custos da operação">
                <strong>{formatMoney(freight.totalCostCents)}</strong>
                <small>
                  Comissão: {formatMoney(freight.driverCommissionCents)}
                </small>
                <small>Pátio: {formatMoney(freight.yardCostCents ?? 0)}</small>
                <small>
                  Coleta: {formatMoney(freight.pickupCostCents ?? 0)} · Entrega:{" "}
                  {formatMoney(freight.deliveryCostCents ?? 0)}
                </small>
                <small>
                  Outros: {formatMoney(freight.otherCostCents ?? 0)}
                </small>
                <small>{`Combustível ${freight.fuelCostSource === "REALIZADO" ? "realizado" : freight.fuelCostSource === "ESTIMADO" ? "estimado" : "histórico"}: ${formatMoney(freight.fuelCostCents)}`}</small>
              </td>
              <td data-label="Resultado / margem">
                <strong
                  className={
                    freight.netRevenueCents < 0 ? "negative" : "positive"
                  }
                >
                  {formatMoney(freight.netRevenueCents)}
                </strong>
                <small>{formatPercent(freight.marginBasisPoints)}</small>
              </td>
              {canManage && (
                <td data-label="Ações">
                  <div className="table-actions">
                    <button
                      type="button"
                      className="table-action"
                      aria-label={`Editar frete de ${freight.origin} para ${freight.destination}`}
                      title="Editar frete"
                      onClick={() => onEdit(freight)}
                    >
                      <Icons.chevron />
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
