"use client";
import { useState } from 'react';
import { currentDatePeriod } from '@/lib/domain/date-period';
import { groupDriverCommissions,type DriverCommissionReport } from '@/lib/domain/driver-commissions';
import { formatDate,formatMoney } from '@/lib/format';
import { DatePeriodFields } from './date-period-fields';
import { ReportPreviewButton } from './report-preview-button';
import { FleetFreightDetail } from './fleet-freight-detail';
import type { FleetFreight } from '@/lib/domain/fleet';
import { EmptyState,ErrorState,LoadingState,Modal } from './ui';
import { useApi } from './use-api';
import { Icons } from './icons';

export function DriverCommissionsPanel({reportBy}:{reportBy?:'driver'|'vehicle'}){
 const [period,setPeriod]=useState(currentDatePeriod);
 const [driver,setDriver]=useState(''),[vehicle,setVehicle]=useState('');
 const [selected,setSelected]=useState<string|null>(null);
 const [applied,setApplied]=useState(()=>({...currentDatePeriod(),driver:'',vehicle:''}));
 const query=new URLSearchParams(reportBy?{...applied,by:reportBy}:{...period,driver,vehicle});
 // Each report has its own dimension; the commissions consultation can combine both.
 if(reportBy==='driver')query.delete('vehicle');
 if(reportBy==='vehicle')query.delete('driver');
 const api=useApi<{report:DriverCommissionReport}>(`/api/reports/driver-commissions?${query}`);
 const detail=useApi<{freight:FleetFreight}>(selected?`/api/fleet/freights/${selected}`:null);
 const report=api.data?.report,rows=report?.rows??[],groups=reportBy?groupDriverCommissions(rows,reportBy):[];
 const available=!api.loading&&!api.error;
 const driverField=<label><span>Motorista</span><select value={driver} onChange={e=>setDriver(e.target.value)}><option value="">Todos os motoristas</option>{report?.drivers.map(d=><option key={d.key} value={d.key}>{d.name}</option>)}</select></label>;
 const vehicleField=<label><span>Veículo</span><select value={vehicle} onChange={e=>setVehicle(e.target.value)}><option value="">Todos os veículos</option>{report?.vehicles.map(v=><option key={v.key} value={v.key}>{v.name}</option>)}</select></label>;
 return <div className="fleet-stack">
 {reportBy?<form className="filter-panel report-filters report-search-filters" onSubmit={e=>{
  e.preventDefault();const next={...period,driver:reportBy==='driver'?driver:'',vehicle:reportBy==='vehicle'?vehicle:''};
  if(JSON.stringify(next)===JSON.stringify(applied))api.refresh();else setApplied(next);
 }}>
  {reportBy==='driver'?driverField:vehicleField}
  <label><span>Coleta de</span><input type="date" required value={period.from} max={period.to||undefined} onChange={e=>setPeriod({...period,from:e.target.value})}/></label>
  <label><span>Até</span><input type="date" required value={period.to} min={period.from||undefined} onChange={e=>setPeriod({...period,to:e.target.value})}/></label>
  <button className="button primary" disabled={api.loading}>Consultar</button>
 </form>:<section className="filter-panel driver-commission-filters">
  <DatePeriodFields value={period} onChange={value=>{setPeriod(value);setDriver('');setVehicle('');}}/>{driverField}{vehicleField}
 </section>}
 {api.loading&&<LoadingState label="Carregando comissões dos motoristas…"/>}{api.error&&<ErrorState message={api.error} retry={api.refresh}/>}
 {available&&<>
  {reportBy&&<div className="order-actions"><ReportPreviewButton key={query.toString()} title={reportBy==='driver'?'Relatório motorista':'Relatório veículo'} label="Visualizar relatório" filename={reportBy==='driver'?'Comissoes-Motoristas.pdf':'Comissoes-Veiculos.pdf'} url={`/api/reports/driver-commissions?${query}&format=pdf`}/></div>}
  <section className="kpi-grid"><article className="kpi-card"><span>Fretes no período</span><strong>{rows.length}</strong></article><article className="kpi-card"><span>Valor dos fretes</span><strong>{formatMoney(rows.reduce((n,r)=>n+r.freightAmountCents,0))}</strong></article><article className="kpi-card accent"><span>Comissão dos motoristas</span><strong>{formatMoney(rows.reduce((n,r)=>n+r.driverCommissionCents,0))}</strong></article></section>
  <p className="fleet-update-note">Comissão gerada pelos fretes na data da coleta, incluindo os ainda não faturados. Não representa pagamento ao motorista.</p>
  {!rows.length?<EmptyState title="Nenhuma comissão no período" description="Altere as datas ou os filtros para consultar outros fretes."/>:<section className="panel table-panel"><div className="responsive-table"><table>
   {reportBy?<><thead><tr><th>{reportBy==='driver'?'Motorista':'Veículo'}</th><th>Fretes</th><th>Valor dos fretes</th><th>Comissão</th></tr></thead><tbody>{groups.map(g=><tr key={g.key}><td>{g.name}</td><td>{g.freights}</td><td>{formatMoney(g.amountCents)}</td><td><strong>{formatMoney(g.commissionCents)}</strong></td></tr>)}</tbody></>:<><thead><tr><th>Data / venda</th><th>Motorista</th><th>Veículo</th><th>Cliente</th><th>Frete</th><th>Comissão</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{formatDate(r.pickupDate)}<small>Venda {r.saleNumber}</small></td><td>{r.driverName||'Não informado'}</td><td>{r.vehiclePlate||'Não informado'}</td><td>{r.clientName}</td><td>{formatMoney(r.freightAmountCents)}</td><td><strong>{formatMoney(r.driverCommissionCents)}</strong></td><td><button type="button" className="table-action" aria-label={`Abrir venda ${r.saleNumber}`} onClick={()=>setSelected(r.id)}><Icons.chevron/></button></td></tr>)}</tbody></>}
  </table></div></section>}
 </>}
 <Modal open={Boolean(selected)} onClose={()=>setSelected(null)} title="Detalhes do frete" wide><div className="modal-body">{detail.loading&&<LoadingState label="Carregando frete…"/>}{detail.error&&<ErrorState message={detail.error} retry={detail.refresh}/>} {!detail.loading&&!detail.error&&detail.data&&<FleetFreightDetail freight={detail.data.freight}/>}</div></Modal>
 </div>;
}
