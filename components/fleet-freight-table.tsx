"use client";
import { useEffect,useRef } from "react";
import { Icons } from "@/components/icons";
import { StatusBadge } from "@/components/ui";
import { cargoPlateKey } from "@/lib/domain/cargo-vehicles";
import {
  FLEET_OPERATIONAL_STATUS_LABELS,
  fleetFinancialStatus,
  freightCargoVehicles,
  type FleetFreightListRow,
} from "@/lib/domain/fleet";
import { formatDate, formatMoney } from "@/lib/format";

export function FreightTable<T extends FleetFreightListRow>({
  freights, search = "",
  onOpen, onEdit,
}: {
  freights: T[];
  search?: string;
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
  const plateQuery = cargoPlateKey(search);

  return (
    <div className="responsive-table fleet-table-wrap">
      <table className="fleet-table fleet-table-compact">
        <colgroup>{["11%","18%","16%","17%","11%","10%","13%","4%"].map((width,index)=><col key={index} style={{width}}/>)}</colgroup>
        <thead>
          <tr>
            <th>Venda</th>
            <th>Cliente / rota</th>
            <th>Frota / motorista</th>
            <th>Veículos transportados</th>
            <th>Operação</th>
            <th>Frete</th>
            <th>Situação financeira</th>
            <th><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {freights.map((freight) => {
            const cargo = freightCargoVehicles(freight).filter(v=>v.model||v.plate||v.identification);
            const matches = cargo.filter(v=>plateQuery && cargoPlateKey(v.plate).includes(plateQuery));
            const shown = [...matches,...cargo.filter(v=>!matches.includes(v))].slice(0,2);
            return (
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
              <td data-label="Veículos transportados">
                {shown.map((v,i)=>{
                  const text=[v.plate,v.model].filter(Boolean).join(' · ') || v.identification || '';
                  return matches.includes(v)?<strong key={i} title={text}>{text}</strong>:<small key={i} title={text}>{text}</small>;
                })}
                {!shown.length && <small>Não informado</small>}
                {cargo.length>shown.length && <small>+ {cargo.length-shown.length} veículo(s)</small>}
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
          );})}
        </tbody>
      </table>
    </div>
  );
}
