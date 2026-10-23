"use client";
import type { ProviderService } from '@/lib/domain/provider-services';
import { providerKindLabel,PROVIDER_SERVICE_KINDS } from '@/lib/domain/provider-services';
import { moneyInputToCents } from '@/lib/format';
import { Field } from './ui';
import { useApi } from './use-api';
import { useState } from 'react';

type Provider={id:string;name:string;referenceName:string|null;active:boolean};
export function ProviderServicesEditor({services,onChange,mode,disabled=false}:{services:ProviderService[];onChange:(rows:ProviderService[])=>void;mode:'identification'|'costs';disabled?:boolean}){
 const api=useApi<{providers:Provider[]}>(mode==='identification'?'/api/providers':null);
 const [selected,setSelected]=useState('');
 function add(){const p=api.data?.providers.find(p=>p.id===selected);if(!p)return;onChange([...services,{id:crypto.randomUUID(),providerId:p.id,providerName:p.name,referenceName:p.referenceName,kind:'OUTRO',amountCents:0}]);setSelected('');}
 if(mode==='identification')return <div className="form-stack"><div className="form-grid three"><Field label="Prestador"><select value={selected} onChange={e=>setSelected(e.target.value)} disabled={disabled}><option value="">Selecione um prestador</option>{api.data?.providers.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name}{p.referenceName?` · ${p.referenceName}`:''}</option>)}</select></Field><div className="form-actions"><button type="button" className="button secondary" aria-label="Adicionar prestador" disabled={disabled||!selected||services.length>=30} onClick={add}>+ Adicionar prestador</button></div></div>{api.error&&<p className="form-error" role="alert">{api.error}</p>}{services.map(row=><div key={row.id} className="order-actions"><span>{row.providerName}{row.referenceName?` · ${row.referenceName}`:''}</span><button type="button" className="table-action" disabled={disabled} aria-label={`Remover ${row.providerName}`} onClick={()=>onChange(services.filter(s=>s.id!==row.id))}>Remover</button></div>)}</div>;
 if(!services.length)return null;
 return <section className="form-stack"><div className="section-divider">Prestadores</div><p className="fleet-update-note">Informe o serviço e o valor combinado para este frete. Esses valores são somados aos custos da operação; não repita o mesmo lançamento nos custos avulsos.</p>{services.map(row=><div key={row.id} className="form-grid three"><Field label="Prestador / identificação"><input readOnly value={`${row.providerName}${row.referenceName?` · ${row.referenceName}`:''}`} /></Field><Field label="Serviço"><select value={row.kind} disabled={disabled} onChange={e=>onChange(services.map(s=>s.id===row.id?{...s,kind:e.target.value as ProviderService['kind']}:s))}>{PROVIDER_SERVICE_KINDS.map(k=><option key={k} value={k}>{providerKindLabel(k)}</option>)}</select></Field><ProviderAmount key={`${row.id}:${row.providerId}`} row={row} disabled={disabled} onChange={amountCents=>onChange(services.map(s=>s.id===row.id?{...s,amountCents}:s))} /></div>)}</section>;
}
function ProviderAmount({row,onChange,disabled}:{row:ProviderService;onChange:(value:number)=>void;disabled:boolean}){
 const [value,setValue]=useState((row.amountCents/100).toFixed(2).replace('.',','));
 return <Field label="Valor (R$)"><input value={value} inputMode="decimal" disabled={disabled} required pattern="[0-9.]+(,[0-9]{1,2})?" title="Informe um valor positivo, usando vírgula para centavos." onChange={e=>{setValue(e.target.value);try{const cents=moneyInputToCents(e.target.value||'0');if(cents<0||cents>9_000_000_000_000)throw new Error('Valor fora do limite.');e.target.setCustomValidity('');onChange(cents);}catch{e.target.setCustomValidity('Informe um valor válido entre zero e R$ 90 bilhões.');}}} /></Field>;
}
