"use client";
import type { ProviderService } from '@/lib/domain/provider-services';
import { providerKindLabel,PROVIDER_SERVICE_KINDS } from '@/lib/domain/provider-services';
import { moneyInputToCents } from '@/lib/format';
import { Field } from './ui';
import { useApi } from './use-api';
import { useState } from 'react';

type Provider={id:string;name:string;referenceName:string|null;active:boolean};
const providerLabel=(p:{name:string;referenceName:string|null})=>`${p.name}${p.referenceName?` · ${p.referenceName}`:''}`;
export function ProviderServicesEditor({services,onChange,mode,disabled=false}:{services:ProviderService[];onChange:(rows:ProviderService[])=>void;mode:'identification'|'costs';disabled?:boolean}) {
 const api=useApi<{providers:Provider[]}>(mode==='identification'?'/api/providers':null);
 const [adding,setAdding]=useState(false);
 const active=api.data?.providers.filter(p=>p.active)??[];
 const showBlank=adding||services.length===0;
 function select(providerId:string,rowId?:string){
  const p=active.find(p=>p.id===providerId);if(!p)return;
  if(rowId){onChange(services.map(row=>row.id===rowId?{...row,providerId:p.id,providerName:p.name,referenceName:p.referenceName,amountCents:0}:row));return;}
  if(services.length>=30)return;
  onChange([...services,{id:crypto.randomUUID(),providerId:p.id,providerName:p.name,referenceName:p.referenceName,kind:'OUTRO',amountCents:0}]);setAdding(false);
 }
 if(mode==='identification')return <div className="form-stack"><div className="provider-selectors">
  {services.map((row,index)=><div key={row.id} className="provider-selector"><Field label={`Prestador ${index+1}`}><select value={row.providerId} disabled={disabled||api.loading||Boolean(api.error)} onChange={e=>{if(e.target.value!==row.providerId)select(e.target.value,row.id);}}>
   {!active.some(p=>p.id===row.providerId)&&<option value={row.providerId}>{providerLabel({name:row.providerName,referenceName:row.referenceName})}</option>}
   {active.map(p=><option key={p.id} value={p.id}>{providerLabel(p)}</option>)}
  </select></Field><button type="button" className="table-action provider-remove" title={`Remover ${row.providerName}`} aria-label={`Remover ${row.providerName}`} disabled={disabled} onClick={()=>onChange(services.filter(s=>s.id!==row.id))}>×</button></div>)}
  {showBlank&&services.length<30&&<div className="provider-selector"><Field label={`Prestador ${services.length+1}`}><select value="" autoFocus={services.length>0} disabled={disabled||api.loading||Boolean(api.error)} onChange={e=>select(e.target.value)}><option value="">{api.loading?'Carregando prestadores…':'Selecione um prestador'}</option>{active.map(p=><option key={p.id} value={p.id}>{providerLabel(p)}</option>)}</select></Field></div>}
  <button type="button" className="button secondary provider-add" title="Adicionar prestador" aria-label="Adicionar prestador" disabled={disabled||showBlank||services.length>=30||api.loading||Boolean(api.error)} onClick={()=>setAdding(true)}>+</button>
 </div>{api.error&&<p className="form-error" role="alert">{api.error}</p>}</div>;
 if(!services.length)return null;
 return <section className="form-stack"><div className="section-divider">Prestadores</div><p className="fleet-update-note">Informe o valor a pagar para cada prestador. Os valores compõem os custos da operação; não repita o mesmo lançamento nos custos avulsos.</p><div className="provider-cost-grid">{services.map((row,index)=><div key={row.id} className="provider-cost-item">
  <ProviderAmount key={`${row.id}:${row.providerId}`} row={row} label={`Prestador ${index+1} · ${row.providerName} (R$)`} disabled={disabled} onChange={amountCents=>onChange(services.map(s=>s.id===row.id?{...s,amountCents}:s))} />
  <Field label="Serviço"><select value={row.kind} disabled={disabled} onChange={e=>onChange(services.map(s=>s.id===row.id?{...s,kind:e.target.value as ProviderService['kind']}:s))}>{PROVIDER_SERVICE_KINDS.map(k=><option key={k} value={k}>{providerKindLabel(k)}</option>)}</select></Field>
 </div>)}</div></section>;
}
function ProviderAmount({row,label,onChange,disabled}:{row:ProviderService;label:string;onChange:(value:number)=>void;disabled:boolean}){
 const [value,setValue]=useState((row.amountCents/100).toFixed(2).replace('.',','));
 return <Field label={label} hint={row.referenceName??undefined}><input value={value} inputMode="decimal" disabled={disabled} required pattern="[0-9.]+(,[0-9]{1,2})?" title="Informe um valor positivo, usando vírgula para centavos." onChange={e=>{setValue(e.target.value);try{const cents=moneyInputToCents(e.target.value||'0');if(cents<0||cents>9_000_000_000_000)throw new Error('Valor fora do limite.');e.target.setCustomValidity('');onChange(cents);}catch{e.target.setCustomValidity('Informe um valor válido entre zero e R$ 90 bilhões.');}}} /></Field>;
}
