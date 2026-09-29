"use client";

import { AddressFields, ActiveSelect, ClientChannelSelect } from "@/components/registry-fields";
import { addressFromForm, type ClientChannel } from "@/lib/domain/registry";
import { useState } from "react";
import { apiMutation } from "@/components/use-api";
import { Field, Modal } from "@/components/ui";

export function ClientFormModal({
  open,
  defaultChannel = "AMBOS",
  onClose,
  onCreated,
}: {
  open: boolean;
  defaultChannel?: ClientChannel;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function closeModal() { setError(null); onClose(); }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSaving(true);
    setError(null);
    const form = new FormData(formElement);
    try {
      const result = await apiMutation<{ id: string }>("/api/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: form.get("type"),
          saleChannel: form.get("saleChannel"), active: form.get("active") === "true",
          legalName: form.get("legalName"),
          cpfCnpj: form.get("cpfCnpj"),
          notes: form.get("notes"),
          contacts: [
            {
              name: form.get("legalName"),
              phone: form.get("phone"),
              whatsapp: form.get("whatsapp"),
              email: form.get("email"),
              isPrimary: true,
            },
          ],
          addresses: [
            {
              type: "EMPRESA",
              label: "ENDEREÇO DA EMPRESA",
              contactName: form.get("legalName"),
              phone: form.get("phone"),
              ...addressFromForm(form),
              isPrimary: true,
            },
          ],
        }),
      });
      formElement.reset();
      onCreated(result.id);
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Erro ao cadastrar cliente.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={closeModal}
      title="Cadastro rápido de cliente"
      description="Cadastre os dados essenciais do cliente e o endereço principal da empresa."
      wide
    >
      <form className="modal-body form-stack" onSubmit={submit}>
        <div className="form-grid three">
          <Field label="Tipo">
            <select name="type" defaultValue="PJ">
              <option value="PJ">Pessoa jurídica</option>
              <option value="PF">Pessoa física</option>
            </select>
          </Field>
          <Field label="Razão social / Nome">
            <input name="legalName" required />
          </Field>
          <Field label="CPF / CNPJ">
            <input name="cpfCnpj" inputMode="numeric" />
          </Field>
          <Field label="Telefone">
            <input name="phone" inputMode="tel" />
          </Field>
          <Field label="WhatsApp">
            <input name="whatsapp" inputMode="tel" />
          </Field>
          <Field label="E-mail">
            <input name="email" type="email" />
          </Field>
        </div>
        <div className="form-grid two"><ClientChannelSelect value={defaultChannel}/><ActiveSelect/></div>
        <div className="section-divider">Endereço da empresa</div>
        <AddressFields/>
        <Field label="Observações">
          <textarea name="notes" rows={3} />
        </Field>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button type="button" className="button secondary" onClick={closeModal}>
            Cancelar
          </button>
          <button className="button primary" disabled={saving}>
            {saving ? "Salvando…" : "Cadastrar cliente"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
