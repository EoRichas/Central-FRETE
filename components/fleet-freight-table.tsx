"use client";
import { useEffect,useRef } from "react";
import { Icons } from "@/components/icons";
import { StatusBadge } from "@/components/ui";
import {
  FLEET_OPERATIONAL_STATUS_LABELS,
  fleetFinancialStatus,
  type FleetFreightListRow,
} from "@/lib/domain/fleet";
import { formatDate, formatMoney } from "@/lib/format";

export function FreightTable<T extends FleetFreightListRow>({
  freights,
  onOpen, onEdit,
}: {
  freights: T[];
  onOpen: (freight: T) => void;
  onEdit?: (freight:T)=>void;
}) {
  const pendingOpen=useRef<ReturnType<typeof setTimeout>|null>(null);
  function cancelPendingOpen(){if(pendingOpen.current)clearTimeout(pendingOpen.current);pendingOpen.current=null;}
  useEffect(()=>()=>{if(pendingOpen.current)clearTimeout(pendingOpen.current);},[]);
  function openNumber(freight:T,keyboard:boolean){
    cancelPendingOpen();
    if(!onEdit||keyboard)onOpen(freight);
    else pendingOpen.current=setTimeout(()=>{pendingOpen.current=null;onOpen(freight);},350);
  }
  if (!freights.length) {
    return (
      <div className="inline-empty">
        Nenhum frete corresponde aos filtros informados.
      </div>
    );
  }

  return (
    <div className="responsive-table fleet-table-wrap">
      <table className="fleet-table fleet-table-compact">
        <colgroup>{["12%","22%","22%","12%","12%","14%","6%"].map((width,index)=><col key={index} style={{width}}/>)}</colgroup>
        <thead>
          <tr>
            <th>Venda</th>
            <th>Cliente / rota</th>
            <th>Frota / motorista</th>
            <th>Operação</th>
            <th>Frete</th>
            <th>Situação financeira</th>
            <th><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {freights.map((freight) => (
            <tr key={freight.id} onDoubleClick={onEdit?event=>{if(!(event.target as HTMLElement).closest("button,a,input,select,textarea,summary"))onEdit(freight);}:undefined}>
              <td data-label="Venda">
                <button type="button" className="text-button" onClick={event => openNumber(freight,event.detail===0)} onDoubleClick={onEdit?event=>{event.stopPropagation();cancelPendingOpen();onEdit(freight);}:undefined} aria-label={`Abrir venda ${freight.saleNumber}`}>
                  <strong>{freight.saleNumber}</strong>
                </button>
                <small>{formatDate(freight.pickupDate)} · {freight.sellerName || "Vendedor não informado"}</small>
              </td>
              <td data-label="Cliente / rota">
                <strong title={freight.clientName}>{freight.clientName}</strong>
                <small title={`${freight.origin} → ${freight.destination}`}>{freight.origin} → {freight.destination}</small>
              </td>
              <td data-label="Frota / motorista">
                <strong>{freight.vehiclePlate}</strong>
                <small title={freight.driverName}>{freight.driverName}</small>
              </td>
              <td data-label="Operação">
                <StatusBadge status={FLEET_OPERATIONAL_STATUS_LABELS[freight.operationalStatus]} />
              </td>
              <td data-label="Frete">
                <strong>{formatMoney(freight.freightAmountCents)}</strong>
              </td>
              <td data-label="Situação financeira">
                <StatusBadge status={fleetFinancialStatus(freight)} />
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
