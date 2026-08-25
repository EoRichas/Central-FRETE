"use client";

import { useState } from "react";
import { apiMutation } from "@/components/use-api";
import { Field, Modal } from "@/components/ui";

type AddressDraft = {
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
};

const emptyAddress: AddressDraft = {
  cep: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
};

export function ClientFormModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [lookingUpCep, setLookingUpCep] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cepMessage, setCepMessage] = useState<string | null>(null);
  const [address, setAddress] = useState<AddressDraft>(emptyAddress);

  function updateAddress<K extends keyof AddressDraft>(key: K, value: AddressDraft[K]) {
    setAddress((current) => ({ ...current, [key]: value }));
  }

  function closeModal() {
    setError(null);
    setCepMessage(null);
    setAddress(emptyAddress);
    onClose();
  }

  async function lookupCep() {
    const cep = address.cep.replace(/\D/g, "");
    if (cep.length !== 8) {
      setCepMessage("Informe um CEP com 8 dígitos.");
      return;
    }
    setLookingUpCep(true);
    setCepMessage(null);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!response.ok) throw new Error("Falha na consulta do CEP.");
      const data = await response.json() as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
        complemento?: string;
      };
      if (data.erro) throw new Error("CEP não encontrado.");
      setAddress((current) => ({
        ...current,
        cep,
        street: data.logradouro || current.street,
        district: data.bairro || current.district,
        city: data.localidade || current.city,
        state: data.uf || current.state,
        complement: current.complement || data.complemento || "",
      }));
      setCepMessage("Endereço preenchido pelo CEP. Confira o número e o complemento.");
    } catch (lookupError) {
      setCepMessage(
        lookupError instanceof Error
          ? lookupError.message
          : "Não foi possível consultar o CEP.",
      );
    } finally {
      setLookingUpCep(false);
    }
  }

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
              cep: address.cep,
              street: address.street,
              number: address.number,
              complement: address.complement,
              district: address.district,
              city: address.city,
              state: address.state,
              isPrimary: true,
            },
          ],
        }),
      });
      formElement.reset();
      setAddress(emptyAddress);
      setCepMessage(null);
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
        <div className="section-divider">Endereço da empresa</div>
        <div className="form-grid three">
          <Field label="CEP" hint="Ao informar o CEP, o endereço é preenchido automaticamente.">
            <div className="cep-lookup-field">
              <input
                name="cep"
                inputMode="numeric"
                maxLength={9}
                value={address.cep}
                onChange={(event) => updateAddress("cep", event.target.value)}
                onBlur={() => {
                  if (address.cep.replace(/\D/g, "").length === 8) void lookupCep();
                }}
              />
              <button
                type="button"
                className="button secondary compact-button"
                disabled={lookingUpCep}
                onClick={() => void lookupCep()}
              >
                {lookingUpCep ? "Buscando…" : "Buscar CEP"}
              </button>
            </div>
          </Field>
          <Field label="Logradouro">
            <input name="street" value={address.street} onChange={(event) => updateAddress("street", event.target.value)} placeholder="Rua, avenida ou rodovia" required />
          </Field>
          <Field label="Número">
            <input name="number" value={address.number} onChange={(event) => updateAddress("number", event.target.value)} required />
          </Field>
          <Field label="Complemento">
            <input name="complement" value={address.complement} onChange={(event) => updateAddress("complement", event.target.value)} />
          </Field>
          <Field label="Bairro">
            <input name="district" value={address.district} onChange={(event) => updateAddress("district", event.target.value)} required />
          </Field>
          <Field label="Cidade">
            <input name="city" value={address.city} onChange={(event) => updateAddress("city", event.target.value)} required />
          </Field>
          <Field label="UF">
            <input name="state" maxLength={2} value={address.state} onChange={(event) => updateAddress("state", event.target.value.toUpperCase())} placeholder="SP" required />
          </Field>
        </div>
        {cepMessage && <p className="field-hint">{cepMessage}</p>}
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
