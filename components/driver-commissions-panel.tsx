"use client";
import { useState } from 'react';
import { currentDatePeriod } from '@/lib/domain/date-period';
import { groupDriverCommissions,commissionDriverKey,type DriverCommissionRow,type DriverCommissionReport } from '@/lib/domain/driver-commissions';
import { formatDate,formatMoney } from '@/lib/format';
import { DatePeriodFields } from './date-period-fields';
import { ReportPreviewButton } from './report-preview-button';
import { todaySaoPaulo } from '@/lib/domain/dates';
import { EmptyState,ErrorState,LoadingState,Modal,Field,StatusBadge } from './ui';
import { apiMutation,useApi } from './use-api';
import { Icons } from './icons';

export function DriverCommissionsPanel({reportBy}:{reportBy?:'driver'|'vehicle'}){
 const [period,setPeriod]=useState(currentDatePeriod);
 const [driver,setDriver]=useState(''),[vehicle,setVehicle]=useState('');
 const [selected,setSelected]=useState<DriverCommissionRow|null>(null);
 const [paymentStatus,setPaymentStatus]=useState<'EM_ABERTO'|'PAGO'>('EM_ABERTO');
 const [paidAt,setPaidAt]=useState(todaySaoPaulo),[pixDetails,setPixDetails]=useState('');
 const [saving,setSaving]=useState(false),[mutationError,setMutationError]=useState<string|null>(null);
 const [applied,setApplied]=useState(()=>({...currentDatePeriod(),driver:'',vehicle:''}));
 const query=new URLSearchParams(reportBy?{...applied,by:reportBy}:{...period,driver,vehicle});
 // Each report has its own dimension; the commissions consultation can combine both.
 if(reportBy==='driver')query.delete('vehicle');
 if(reportBy==='vehicle')query.delete('driver');
 const api=useApi<{report:DriverCommissionReport;canManagePayments:boolean}>(`/api/reports/driver-commissions?${query}`);
 const report=api.data?.report,rows=report?.rows??[],groups=reportBy?groupDriverCommissions(rows,reportBy):[];
 const paymentGroups=new Map<string,{key:string;name:string;total:number;items:DriverCommissionRow[]}>();
 for(const row of rows){const key=commissionDriverKey(row),group=paymentGroups.get(key)??{key,name:row.driverName||'Motorista não informado',total:0,items:[]};group.total+=row.driverCommissionCents;group.items.push(row);paymentGroups.set(key,group);}
 function openPayment(row:DriverCommissionRow){setSelected(row);setPaymentStatus(row.commissionStatus??'EM_ABERTO');setPaidAt(row.commissionPaidAt??todaySaoPaulo());setPixDetails(row.pixDetails??'');setMutationError(null);}
 async function savePayment(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(!selected||saving||!api.data?.canManagePayments)return;
  setSaving(true);setMutationError(null);
  try{await apiMutation('/api/drivers/commissions',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({freightId:selected.id,status:paymentStatus,paidAt:paymentStatus==='PAGO'?paidAt:null,pixDetails})});setSelected(null);api.refresh();}
  catch(error){setMutationError(error instanceof Error?error.message:'Não foi possível atualizar a comissão.');}finally{setSaving(false);}
 }
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
  <p className="fleet-update-note">{reportBy?'Comissão gerada pelos fretes na data da coleta, incluindo os ainda não faturados.':'A situação abaixo indica o pagamento individual da comissão ao motorista, independente do recebimento do frete.'}</p>
  {!rows.length?<EmptyState title="Nenhuma comissão no período" description="Altere as datas ou os filtros para consultar outros fretes."/>:reportBy?<section className="panel table-panel"><div className="responsive-table"><table>
   <thead><tr><th>{reportBy==='driver'?'Motorista':'Veículo'}</th><th>Fretes</th><th>Valor dos fretes</th><th>Comissão</th></tr></thead><tbody>{groups.map(g=><tr key={g.key}><td>{g.name}</td><td>{g.freights}</td><td>{formatMoney(g.amountCents)}</td><td><strong>{formatMoney(g.commissionCents)}</strong></td></tr>)}</tbody>
  </table></div></section>:<div className="seller-commission-stack">{[...paymentGroups.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(group=><details className="panel seller-commission-group" key={group.key}>
   <summary>{group.name} · {formatMoney(group.total)} · {group.items.length} vendas</summary>
   <div className="responsive-table"><table><thead><tr><th>Venda</th><th>Data</th><th>Cliente</th><th>Veículo</th><th>Valor da venda</th><th>Comissão</th><th>PIX</th><th>Situação</th><th>Data do pagamento</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{group.items.map(r=><tr key={r.id}>
    <td><strong>{r.saleNumber}</strong></td><td>{formatDate(r.pickupDate)}</td><td>{r.clientName}</td><td>{r.vehiclePlate||'Não informado'}</td><td>{formatMoney(r.freightAmountCents)}</td><td><strong>{formatMoney(r.driverCommissionCents)}</strong></td><td>{r.pixDetails||'—'}</td><td><StatusBadge status={r.commissionStatus??'EM_ABERTO'}/></td><td>{r.commissionPaidAt?formatDate(r.commissionPaidAt):'—'}{r.commissionPaidByName&&<small>BAIXADO POR {r.commissionPaidByName}</small>}</td>
    <td>{api.data?.canManagePayments?<button type="button" className="table-action" aria-label={`Editar comissão da venda ${r.saleNumber} de ${r.driverName}`} title="Editar pagamento" onClick={()=>openPayment(r)}><Icons.chevron/></button>:'—'}</td>
   </tr>)}</tbody></table></div>
  </details>)}</div>}
 </>}
 <Modal open={Boolean(selected)} onClose={()=>{if(!saving)setSelected(null);}} title="Pagamento da comissão" description={selected?`${selected.driverName} · Venda ${selected.saleNumber}`:undefined}>
  <form className="modal-body form-stack" onSubmit={savePayment}>
   <Field label="Dados do PIX" hint="O PIX fica salvo para este motorista; a situação e a data são desta venda."><textarea rows={2} maxLength={2000} value={pixDetails} disabled={saving} onChange={e=>setPixDetails(e.target.value)} placeholder="Ex.: chave PIX, tipo da chave e titular"/></Field>
   <Field label="Situação"><select value={paymentStatus} disabled={saving} onChange={e=>setPaymentStatus(e.target.value as 'EM_ABERTO'|'PAGO')}><option value="EM_ABERTO">Em aberto</option><option value="PAGO">Pago</option></select></Field>
   {paymentStatus==='PAGO'&&<Field label="Data do pagamento"><input type="date" required disabled={saving} value={paidAt} onChange={e=>setPaidAt(e.target.value)}/></Field>}
   {mutationError&&<p className="form-error" role="alert">{mutationError}</p>}
   <footer className="modal-actions"><button type="button" className="button secondary" disabled={saving} onClick={()=>setSelected(null)}>Cancelar</button><button className="button primary" disabled={saving}>{saving?'Salvando…':'Salvar pagamento'}</button></footer>
  </form>
 </Modal>
 </div>;
}
