"use client";

import { FleetFreightDetail } from "@/components/fleet-freight-detail";
import { useState } from "react";
import { FreightModal } from "@/components/fleet-freight-modal";
import { ErrorState, LoadingState, PageHeader, Modal } from "@/components/ui";
import { useApi } from "@/components/use-api";
import { useTransientMessage } from "@/components/use-transient-message";
import type { FleetFreight, FleetFreightFormData, SellerFreightSummary } from "@/lib/domain/fleet";
import { formatDate, formatMoney } from "@/lib/format";

export function SellerFleetScreen() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useApi<{freight:FleetFreight}>(selectedId ? `/api/fleet/freights/${selectedId}` : null);
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
    {list.data && <section className="panel"><div className="responsive-table"><table><thead><tr><th>Venda</th><th>Cliente</th><th>Rota</th><th>Coleta</th><th>Frete</th><th>Detalhes</th></tr></thead><tbody>
      {list.data.freights.map(f=><tr key={f.id}><td>{f.saleNumber}</td><td>{f.clientName}</td><td>{f.origin} → {f.destination}</td><td>{formatDate(f.pickupDate)}</td><td>{formatMoney(f.freightAmountCents)}</td><td><button className="button secondary" onClick={()=>setSelectedId(f.id)}>Ver detalhes</button></td></tr>)}
      {!list.data.freights.length && <tr><td colSpan={6}>Você ainda não cadastrou fretes da Frota.</td></tr>}
    </tbody></table></div></section>}
    <Modal open={Boolean(selectedId)} onClose={()=>setSelectedId(null)} title={`Detalhes da venda ${detail.data?.freight.saleNumber ?? ''}`} wide>
      <div className="modal-body">{detail.loading && <LoadingState label="Carregando detalhes…"/>}{detail.error && <ErrorState message={detail.error} retry={detail.refresh}/>}{detail.data && !detail.loading && <FleetFreightDetail freight={detail.data.freight}/>}</div>
    </Modal>
  </>;
}
