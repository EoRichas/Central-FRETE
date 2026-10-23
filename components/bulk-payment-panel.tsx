"use client";
import { useRef,useState } from 'react';
import type { SalesReport } from '@/lib/domain/reports';
import { todaySaoPaulo } from '@/lib/domain/dates';
import { formatMoney } from '@/lib/format';
import { apiMutation,useApi } from './use-api';
import { Field,Modal } from './ui';

export function BulkPaymentPanel({sales,onSaved}:{sales:SalesReport['sales'];onSaved:()=>void}){
 const me=useApi<{user:{role:string}}>('/api/me');
 const [open,setOpen]=useState(false),[clientId,setClient]=useState(''),[selected,setSelected]=useState<string[]>([]);
 const [paidAt,setDate]=useState(todaySaoPaulo),[paymentMethod,setMethod]=useState('PIX'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const attempt=useRef<{body:string;key:string}|null>(null);
 const clients=[...new Map(sales.filter(s=>s.clientId).map(s=>[s.clientId!,s.clientName||'Cliente sem nome'])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
 const available=sales.filter(s=>s.clientId===clientId&&(s.financial.balanceCents??0)>0);
 const chosen=available.filter(s=>selected.includes(s.id));
 const total=chosen.reduce((sum,s)=>sum+(s.financial.balanceCents??0),0);
 async function submit(event:React.FormEvent){event.preventDefault();if(!chosen.length)return;setBusy(true);setError('');
  const body=JSON.stringify({clientId,paidAt,paymentMethod,items:chosen.map(s=>({sourceKind:s.id.startsWith('freight:')?'freight':'sale',id:s.id.startsWith('freight:')?s.id.slice(8):s.id,expectedBalanceCents:s.financial.balanceCents}))});
  if(attempt.current?.body!==body)attempt.current={body,key:crypto.randomUUID()};
  try{await apiMutation('/api/finance/payments/batch',{method:'POST',headers:{'content-type':'application/json','idempotency-key':attempt.current.key},body});setOpen(false);setSelected([]);attempt.current=null;onSaved();}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível registrar a baixa.');}finally{setBusy(false);}
 }
 if(!['ADMIN','FINANCEIRO'].includes(me.data?.user.role??''))return null;
 return <><div className="order-actions"><button type="button" className="button primary" onClick={()=>{setError('');setOpen(true);}}>Baixa em lote</button></div><Modal open={open} onClose={()=>{if(!busy)setOpen(false);}} title="Baixa financeira por cliente" wide><form className="modal-body form-stack" onSubmit={submit}>
  <div className="form-grid three"><Field label="Cliente"><select required value={clientId} disabled={busy} onChange={e=>{setClient(e.target.value);setSelected([]);}}><option value="">Selecione</option>{clients.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></Field><Field label="Data do recebimento"><input type="date" value={paidAt} required disabled={busy} onChange={e=>setDate(e.target.value)} /></Field><Field label="Forma de pagamento"><select value={paymentMethod} disabled={busy} onChange={e=>setMethod(e.target.value)}>{['PIX','BOLETO','DINHEIRO','CREDITO','DEBITO','FATURADO'].map(m=><option key={m}>{m}</option>)}</select></Field></div>
  <p>Selecione até 50 vendas do mesmo cliente na competência e no canal consultados. Será baixado o saldo restante de cada venda. Comprovantes são opcionais e podem ser anexados nos detalhes de cada venda.</p>
  {clientId&&<><label className="fleet-check-field"><input className="selection-checkbox" type="checkbox" disabled={busy||available.length===0||available.length>50} checked={available.length>0&&chosen.length===available.length} onChange={e=>setSelected(e.target.checked?available.map(s=>s.id):[])} /> Selecionar todas ({available.length})</label><div className="responsive-table"><table><thead><tr><th>Selecionar</th><th>Venda</th><th>Canal</th><th>Saldo a baixar</th></tr></thead><tbody>{available.map(s=><tr key={s.id}><td><input className="selection-checkbox" type="checkbox" aria-label={`Baixar venda ${s.saleNumber}`} checked={selected.includes(s.id)} disabled={busy||(!selected.includes(s.id)&&chosen.length>=50)} onChange={e=>setSelected(current=>e.target.checked?[...current,s.id]:current.filter(id=>id!==s.id))} /></td><td>{s.saleNumber}</td><td>{s.saleChannel}</td><td>{formatMoney(s.financial.balanceCents??0)}</td></tr>)}</tbody></table></div>{!available.length&&<p>Nenhuma venda com saldo disponível para este cliente.</p>}</>}
  <p><strong>{chosen.length} venda(s) · {formatMoney(total)}</strong></p>{error&&<><p className="form-error" role="alert">{error}</p><button type="button" className="button secondary" disabled={busy} onClick={()=>{setSelected([]);setError('');onSaved();}}>Atualizar saldos</button></>}<button className="button primary" disabled={busy||!chosen.length}>{busy?'Registrando…':'Confirmar baixa'}</button>
 </form></Modal></>;
}
