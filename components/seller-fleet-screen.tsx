"use client";

import Link from 'next/link';
import { DatePeriodFields } from './date-period-fields';
import { currentDatePeriod } from '@/lib/domain/date-period';
import { useState } from 'react';
import { FleetFreightDetail } from '@/components/fleet-freight-detail';
import { FleetFreightFormScreen } from '@/components/fleet-freight-form-screen';
import { FreightTable } from '@/components/fleet-freight-table';
import { Icons } from '@/components/icons';
import { ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { apiMutation,useApi } from '@/components/use-api';
import { useTransientMessage } from '@/components/use-transient-message';
import { FLEET_OPERATIONAL_STATUSES, FLEET_OPERATIONAL_STATUS_LABELS, FLEET_FINANCIAL_STATUSES, FLEET_FINANCIAL_STATUS_LABELS, fleetFinancialStatus, type FleetFreight, type FleetFreightFormData, type SellerFreightSummary } from '@/lib/domain/fleet';

export function SellerFleetScreen() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useApi<{freight:FleetFreight}>(selectedId ? `/api/fleet/freights/${selectedId}` : null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState(''), [status, setStatus] = useState(''), [financialStatus, setFinancialStatus] = useState(''), [seller, setSeller] = useState('');
  const [success, setSuccess] = useTransientMessage();
  const options = useApi<{fleet:FleetFreightFormData}>(open ? `/api/fleet/freights/options${editing && selectedId ? `?freightId=${encodeURIComponent(selectedId)}` : ''}` : null);
  const [period,setPeriod]=useState(currentDatePeriod);
  const list = useApi<{freights:SellerFreightSummary[]}>(`/api/fleet/freights?${new URLSearchParams(period)}`);
  const freights = list.data?.freights ?? [];
  const sellerKey = (f:SellerFreightSummary) => f.sellerId ? `id:${f.sellerId}` : f.sellerName ? `name:${f.sellerName}` : 'unassigned';
  const sellers = [...new Map(freights.map(f=>[sellerKey(f),f.sellerName||'Não informado'])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
  const normalized = search.trim().toLocaleUpperCase('pt-BR');
  const filtered = freights.filter(f=>(!normalized||[f.saleNumber,f.clientName,f.origin,f.destination,f.vehiclePlate,f.driverName].some(v=>v?.toLocaleUpperCase('pt-BR').includes(normalized)))&&(!status||f.operationalStatus===status)&&(!financialStatus||fleetFinancialStatus(f)===financialStatus)&&(!seller||sellerKey(f)===seller));
  async function deleteFreight(freight:FleetFreight){
    if(!window.confirm(`Excluir o frete de ${freight.origin} para ${freight.destination}? A OS própria deste frete será removida. Uma venda vinculada e sua OS serão preservadas.`))return;
    await apiMutation(`/api/fleet/freights/${freight.id}`,{method:'DELETE'});
    setSelectedId(null);setEditing(false);setOpen(false);setSuccess('Frete excluído.');list.refresh();
  }
  const edit = () => {setEditing(true);setOpen(true);};
  if (open) return <div className="fleet-module">
    {options.loading&&<LoadingState label="Preparando frete…"/>}
    {options.error&&<ErrorState message={options.error} retry={options.refresh}/>}
    {editing&&detail.loading&&<LoadingState label="Carregando detalhes…"/>}
    {editing&&detail.error&&<ErrorState message={detail.error} retry={detail.refresh}/>}
    {!options.loading&&options.data&&(!editing||(!detail.loading&&detail.data?.freight.id===selectedId)) ? <FleetFreightFormScreen key={editing?selectedId:'new'} freight={editing?detail.data!.freight:null} fleet={options.data.fleet} onClose={()=>setOpen(false)} onSaved={(message,_id,_competency,accessTransferred,savedPickupDate)=>{if(!accessTransferred&&savedPickupDate)setPeriod(current=>({from:savedPickupDate<current.from?savedPickupDate:current.from,to:savedPickupDate>current.to?savedPickupDate:current.to}));setOpen(false);setSuccess(message);list.refresh();if(accessTransferred){setSelectedId(null);setEditing(false);}else if(editing)detail.refresh();}} onDelete={deleteFreight}/> : <button type="button" className="button secondary" onClick={()=>setOpen(false)}>Voltar à Frota</button>}
  </div>;
  return <div className="fleet-module">
    {selectedId ? <>
      <PageHeader eyebrow={`Venda ${detail.data?.freight.saleNumber ?? ''}`} title="Detalhes do frete" description={detail.data ? `${detail.data.freight.origin} → ${detail.data.freight.destination}` : ''} actions={<><button className="button secondary" onClick={()=>setSelectedId(null)}>Voltar à Frota</button><Link className="button secondary" href={`/frota/fretes/${selectedId}/os`}>Visualizar OS</Link>{detail.data&&!detail.loading&&<button type="button" className="button primary" onClick={edit}>Editar frete</button>}</>} />
      {detail.loading&&<LoadingState label="Carregando detalhes…"/>}{detail.error&&<ErrorState message={detail.error} retry={detail.refresh}/>}{detail.data&&!detail.loading&&<FleetFreightDetail freight={detail.data.freight}/>}
    </> : <>
      <PageHeader title="Frota" eyebrow="Operação logística" description="Cadastre e acompanhe seus fretes pelo período de coleta." actions={<><DatePeriodFields value={period} onChange={setPeriod}/><button className="button secondary create-sale-action" onClick={()=>{setEditing(false);setOpen(true);}}><Icons.plus /> Novo frete</button></>} />
      <div className="fleet-stack">
        <div className="cegonha-tabs module-tabs" role="tablist" aria-label="Áreas da Frota"><button type="button" role="tab" aria-selected={true} className="active">Fretes</button></div>
        <section className="filter-panel fleet-filter-panel">
          <label><span>Buscar</span><div className="search-input"><Icons.search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cliente, rota, placa ou motorista" /></div></label>
          <label><span>Status</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Todos</option>{FLEET_OPERATIONAL_STATUSES.map(v=><option key={v} value={v}>{FLEET_OPERATIONAL_STATUS_LABELS[v]}</option>)}</select></label>
          <label><span>Situação financeira</span><select value={financialStatus} onChange={e=>setFinancialStatus(e.target.value)}><option value="">Todas</option>{FLEET_FINANCIAL_STATUSES.map(v=><option key={v} value={v}>{FLEET_FINANCIAL_STATUS_LABELS[v]}</option>)}</select></label>
          <label><span>Vendedor</span><select value={seller} onChange={e=>setSeller(e.target.value)}><option value="">Todos</option>{sellers.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
          <div className="filter-stat"><strong>{filtered.length}</strong><span>frete{filtered.length===1?'':'s'}</span></div>
        </section>
        {list.loading&&<LoadingState label="Carregando seus fretes…"/>}{list.error&&<ErrorState message={list.error} retry={list.refresh}/>}
        {list.data&&<section className="panel table-panel"><FreightTable freights={filtered} onEdit={f=>{setSelectedId(f.id);setEditing(true);setOpen(true);}} onOpen={f=>setSelectedId(f.id)}/></section>}
      </div>
    </>}
    {success&&<p role="status" className="success-banner">{success}</p>}
  </div>;
}
