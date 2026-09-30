"use client";

import { useState } from "react";
import type { SaleRecord } from "@/lib/contracts";
import { OPERATIONAL_STATUS_OPTIONS } from "@/lib/domain/operations";
import { Field, Modal } from "@/components/ui";
import { apiMutation } from "@/components/use-api";

export function SaleBillingAction({ sale, onSaved }: { sale: SaleRecord; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true); setError("");
    try {
      await apiMutation(`/api/sales/${sale.id}/billing`, {method: "PATCH", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({operationalStatus: form.get("operationalStatus"), billingDate: form.get("billingDate") || null})});
      setOpen(false); onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar o faturamento."); }
    finally { setSaving(false); }
  }
  return <>
    <button className="button secondary" onClick={() => {setError(""); setOpen(true);}}>Atualizar faturamento</button>
    <Modal open={open} onClose={() => {if (!saving) setOpen(false);}} title="Faturamento da venda">
      <form className="modal-body form-stack" onSubmit={save}>
        <Field label="Status operacional"><select name="operationalStatus" defaultValue={sale.operationalStatus} disabled={saving}>
          {OPERATIONAL_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></Field>
        <Field label="Data do faturamento"><input name="billingDate" type="date" defaultValue={sale.billingDate ?? ""} disabled={saving}/></Field>
        {error && <p role="alert" className="form-error">{error}</p>}
        <button className="button primary" disabled={saving}>{saving ? "Salvando…" : "Salvar faturamento"}</button>
      </form>
    </Modal>
  </>;
}
