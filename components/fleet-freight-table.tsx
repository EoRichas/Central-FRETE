"use client";
import { Icons } from "@/components/icons";
import { StatusBadge } from "@/components/ui";
import {
  FLEET_OPERATIONAL_STATUS_LABELS,
  type FleetFreight,
} from "@/lib/domain/fleet";
import { formatDate, formatMoney } from "@/lib/format";

export function FreightTable({
  freights,
  onOpen,
}: {
  freights: FleetFreight[];
  onOpen: (freight: FleetFreight) => void;
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
            <th>Venda</th>
            <th>Cliente / rota</th>
            <th>Frota / motorista</th>
            <th>Operação</th>
            <th>Frete</th>
            <th>Situação</th>
            <th><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {freights.map((freight) => (
            <tr key={freight.id}>
              <td data-label="Venda">
                <button type="button" className="text-button" onClick={() => onOpen(freight)} aria-label={`Abrir venda ${freight.saleNumber}`}>
                  <strong>{freight.saleNumber}</strong>
                </button>
                <small>{formatDate(freight.pickupDate)} · {freight.sellerName || "Vendedor não informado"}</small>
              </td>
              <td data-label="Cliente / rota">
                <strong>{freight.clientName}</strong>
                <small>{freight.origin} → {freight.destination}</small>
              </td>
              <td data-label="Frota / motorista">
                <strong>{freight.vehiclePlate}</strong>
                <small>{freight.driverName}</small>
              </td>
              <td data-label="Operação">
                <StatusBadge status={FLEET_OPERATIONAL_STATUS_LABELS[freight.operationalStatus]} />
              </td>
              <td data-label="Frete">
                <strong>{formatMoney(freight.freightAmountCents)}</strong>
              </td>
              <td data-label="Situação">
                <StatusBadge status={freight.paymentStatus} />
              </td>
              <td data-label="Ações">
                  <div className="table-actions">
                    <button
                      type="button"
                      className="table-action"
                      aria-label={`Ver frete de ${freight.origin} para ${freight.destination}`}
                      title="Ver detalhes do frete"
                      onClick={() => onOpen(freight)}
                    >
                      <Icons.chevron />
                    </button>
                  </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
