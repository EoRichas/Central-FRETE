"use client";

import { useRef,useState } from "react";
import { apiMutation,useApi } from "@/components/use-api";
import { Field } from "@/components/ui";
import { Icons } from "@/components/icons";
import { PROOF_ACCEPT,PROOF_FORMATS } from "@/lib/domain/proof-files";
import { todaySaoPaulo } from "@/lib/domain/dates";

export function FleetPaymentPanel({id,status,paidAt,proofAttachmentId,canManagePayments,onSaved}:{
 id:string;status:string;paidAt:string|null;proofAttachmentId:string|null;canManagePayments:boolean;onSaved:()=>void;
}){
 const api=useApi<{attachments:{id:string;fileName:string}[]}>(`/api/fleet/freights/${id}/attachments`);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[paymentStatus,setPaymentStatus]=useState(status),[paymentDate,setPaymentDate]=useState(paidAt?.slice(0,10)??todaySaoPaulo());
 const [proofId,setProofId]=useState<string|null>(proofAttachmentId),[pending,setPending]=useState<File|null>(null),[open,setOpen]=useState(false);
 const input=useRef<HTMLInputElement>(null),inFlight=useRef(false);
 const attachments=api.data?.attachments??[];
 const effectiveProof=proofId??(attachments.length===1?attachments[0].id:'');
 async function save(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');
  try{
   let selected=effectiveProof;
   if(pending){
    const form=new FormData();form.set('file',pending);
    const result=await apiMutation<{id:string}>(`/api/fleet/freights/${id}/attachments`,{method:'POST',body:form});
    selected=result.id;setProofId(result.id);setPending(null);if(input.current)input.current.value='';api.refresh();
    // Keep the uploaded ID if the subsequent payment fails, so retry never uploads twice.
   }
   if(canManagePayments)await apiMutation(`/api/fleet/freights/${id}/payment`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:paymentStatus,paidAt:paymentDate,proofId:selected})});
   onSaved();
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.');setOpen(true);}
  finally{inFlight.current=false;setBusy(false);}
 }
 return <section className="modal-body form-stack fleet-payment-panel"><h3>Comprovante e pagamento</h3>
  <form onSubmit={save} className="form-stack">
   <details open={open} onToggle={event=>setOpen(event.currentTarget.open)} className="payment-proof-disclosure">
    <summary><Icons.receipt/><strong>Comprovantes <span>(opcional)</span></strong><small>{api.loading?'Carregando…':pending?'1 arquivo selecionado · a salvar':`${attachments.length} arquivo(s) salvo(s)${effectiveProof?' · usado na baixa':''}`}</small><Icons.chevron/></summary>
    <div className="payment-proof-content">
     {api.error&&<><p className="form-error" role="alert">{api.error}</p><button type="button" className="button secondary" onClick={api.refresh}>Tentar novamente</button></>}
     {attachments.map(a=><div className="payment-proof-file" key={a.id}><a href={`/api/fleet/freights/${id}/attachments/${a.id}`} target="_blank" rel="noreferrer">{a.fileName}</a>{a.id===effectiveProof&&<small>Usado na baixa</small>}</div>)}
     {attachments.length>1&&canManagePayments&&<Field label="Comprovante para a baixa"><select value={effectiveProof} disabled={busy} onChange={e=>setProofId(e.target.value)}><option value="">Sem comprovante (opcional)</option>{attachments.map(a=><option key={a.id} value={a.id}>{a.fileName}</option>)}</select></Field>}
     <Field label="Anexar comprovante (opcional)" hint={PROOF_FORMATS}><input ref={input} name="file" type="file" accept={PROOF_ACCEPT} disabled={busy} onChange={e=>setPending(e.target.files?.[0]??null)}/></Field>
     {pending&&<p className="form-hint" role="status">{pending.name} · será salvo ao confirmar abaixo.</p>}
    </div>
   </details>
   {canManagePayments&&<div className="form-grid two"><Field label="Situação"><select value={paymentStatus} onChange={e=>setPaymentStatus(e.target.value)} disabled={busy}><option value="EM_ABERTO">Em aberto</option><option value="PAGO">Pago</option></select></Field><Field label="Data do pagamento"><input type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)} required={paymentStatus==='PAGO'} disabled={busy||paymentStatus!=='PAGO'}/></Field></div>}
   {error&&<p role="alert" className="form-error">{error}</p>}
   <div className="payment-proof-footer"><small>Comprovante opcional. Arquivo existente aproveitado na baixa.</small><button className="button primary" disabled={busy||api.loading||Boolean(api.error)||(!canManagePayments&&!pending)}>{busy?'Salvando…':canManagePayments&&paymentStatus==='PAGO'?'Confirmar pagamento':'Salvar alterações'}</button></div>
  </form>
 </section>;
}
