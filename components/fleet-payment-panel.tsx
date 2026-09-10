"use client";

import { useState } from "react";
import { apiMutation, useApi } from "@/components/use-api";
import { ProofUpload } from "@/components/proof-upload";
import { Field } from "@/components/ui";
import { todaySaoPaulo } from "@/lib/domain/dates";

export function FleetPaymentPanel({ id, status, paidAt, proofAttachmentId, canManagePayments, onSaved }: {
  id: string; status: string; paidAt: string | null; proofAttachmentId: string | null;
  canManagePayments: boolean; onSaved: () => void;
}) {
  const api = useApi<{ attachments: { id: string; fileName: string }[] }>(`/api/fleet/freights/${id}/attachments`);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState(status);
  const [paymentDate, setPaymentDate] = useState(paidAt?.slice(0, 10) ?? todaySaoPaulo());
  const [proofId, setProofId] = useState(proofAttachmentId ?? "");

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await apiMutation<{id: string}>(`/api/fleet/freights/${id}/attachments`, { method: "POST", body: new FormData(event.currentTarget) });
      setProofId(result.id); setUploadKey((key) => key + 1); api.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha no envio."); }
    finally { setBusy(false); }
  }

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await apiMutation(`/api/fleet/freights/${id}/payment`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: paymentStatus, paidAt: paymentDate, proofId }),
      });
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao confirmar."); }
    finally { setBusy(false); }
  }

  return <section className="modal-body form-stack">
    <h3>Comprovante e pagamento</h3>
    {canManagePayments && <Field label="Data do pagamento"><input type="date" form={`fleet-payment-${id}`} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required={paymentStatus === "PAGO"} disabled={busy} /></Field>}
    <form onSubmit={upload} className="form-stack">
      <ProofUpload key={uploadKey} required disabled={busy} />
      <button className="button secondary" disabled={busy}>{busy ? "Enviando…" : "Salvar comprovante"}</button>
    </form>
    <div className="form-stack">{api.data?.attachments.map((attachment) => <a key={attachment.id} href={`/api/fleet/freights/${id}/attachments/${attachment.id}`}>{attachment.fileName}</a>)}</div>
    {canManagePayments && <form id={`fleet-payment-${id}`} onSubmit={confirm} className="form-stack">
      <div className="form-grid two">
        <Field label="Situação"><select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)} disabled={busy}><option value="EM_ABERTO">Em aberto</option><option value="PAGO">Pago</option></select></Field>
        <Field label="Comprovante para a baixa"><select value={proofId} onChange={(event) => setProofId(event.target.value)} disabled={busy} required={paymentStatus === "PAGO"}><option value="">Selecione</option>{api.data?.attachments.map((attachment) => <option key={attachment.id} value={attachment.id}>{attachment.fileName}</option>)}</select></Field>
      </div>
      <button className="button primary" disabled={busy}>Salvar situação</button>
    </form>}
    {(error || api.error) && <p role="alert" className="form-error">{error || api.error}</p>}
  </section>;
}
