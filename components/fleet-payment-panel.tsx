"use client";
import { useState } from "react";
import { apiMutation, useApi } from "@/components/use-api";
export function FleetPaymentPanel({ id, status, onSaved }: { id: string; status: string; onSaved: () => void }) {
 const api = useApi<{ attachments: { id: string; fileName: string }[] }>(`/api/fleet/freights/${id}/attachments`);
 const [error, setError] = useState("");
 const [busy, setBusy] = useState(false);
 async function upload(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault(); const form = event.currentTarget; setBusy(true); setError("");
  try { await apiMutation(`/api/fleet/freights/${id}/attachments`, { method: "POST", body: new FormData(form) }); form.reset(); api.refresh(); }
  catch(e) { setError(e instanceof Error ? e.message : "Falha no envio."); } finally { setBusy(false); }
 }
 async function confirm(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
  try { await apiMutation(`/api/fleet/freights/${id}/payment`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: form.get("status"), proofId: form.get("proofId") }) }); onSaved(); }
  catch(e) { setError(e instanceof Error ? e.message : "Falha ao confirmar."); } finally { setBusy(false); }
 }
 return <section className="modal-body form-stack">
  <h3>Comprovante e pagamento</h3>
  <form onSubmit={upload} className="form-stack"><label>Comprovante PDF (até 10 MB)<input type="file" name="file" accept="application/pdf" required /></label><button className="button secondary" disabled={busy}>Anexar comprovante</button></form>
  {api.data?.attachments.map(a => <a key={a.id} href={`/api/fleet/freights/${id}/attachments/${a.id}`}>{a.fileName}</a>)}
  <form onSubmit={confirm} className="form-stack"><label>Situação<select name="status" defaultValue={status}><option value="EM_ABERTO">Em aberto</option><option value="PAGO">Pago</option></select></label><label>Comprovante para a baixa<select name="proofId"><option value="">Selecione</option>{api.data?.attachments.map(a => <option key={a.id} value={a.id}>{a.fileName}</option>)}</select></label><button className="button primary" disabled={busy}>Salvar situação</button></form>
  {(error || api.error) && <p role="alert" className="form-error">{error || api.error}</p>}
 </section>;
}
