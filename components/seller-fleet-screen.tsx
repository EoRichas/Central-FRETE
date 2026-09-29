"use client";

import { useState } from "react";
import { FreightModal } from "@/components/fleet-freight-modal";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { useApi } from "@/components/use-api";
import { useTransientMessage } from "@/components/use-transient-message";
import type { FleetFreightFormData, SellerFreightSummary } from "@/lib/domain/fleet";
import { formatDate, formatMoney } from "@/lib/format";

export function SellerFleetScreen() {
  const [open, setOpen] = useState(false);
  const [success, setSuccess] = useTransientMessage();
  const options = useApi<{fleet:FleetFreightFormData}>(open ? "/api/fleet/freights/options" : null);
  const list = useApi<{freights:SellerFreightSummary[]}>("/api/fleet/freights");
  return <>
    <PageHeader title="Frota" eyebrow="Operação logística" description="Cadastre um frete e acompanhe os seus últimos 100 registros."
      actions={<button className="button primary" onClick={()=>setOpen(true)}>Novo frete</button>}/>
    {success && <p role="status" className="success-banner">{success}</p>}
    {list.loading && <LoadingState label="Carregando seus fretes…"/>}
    {list.error && <ErrorState message={list.error} retry={list.refresh}/>}
    {open && options.loading && <LoadingState label="Preparando novo frete…"/>}
    {open && options.error && <ErrorState message={options.error} retry={options.refresh}/>}
    {open && !options.loading && options.data && <FreightModal freight={null} fleet={options.data.fleet} onClose={()=>setOpen(false)}
      onSaved={(message)=>{setOpen(false);setSuccess(message);list.refresh();}} onDelete={async()=>{throw new Error("Exclusão não permitida.");}}/>}
    {list.data && <section className="panel"><div className="responsive-table"><table><thead><tr><th>Venda</th><th>Cliente</th><th>Rota</th><th>Coleta</th><th>Frete</th></tr></thead><tbody>
      {list.data.freights.map(f=><tr key={f.id}><td>{f.saleNumber}</td><td>{f.clientName}</td><td>{f.origin} → {f.destination}</td><td>{formatDate(f.pickupDate)}</td><td>{formatMoney(f.freightAmountCents)}</td></tr>)}
      {!list.data.freights.length && <tr><td colSpan={5}>Você ainda não cadastrou fretes da Frota.</td></tr>}
    </tbody></table></div></section>}
  </>;
}
