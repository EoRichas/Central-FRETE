"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClientRecord, CurrentUser, SaleRecord } from "@/lib/contracts";
import { formatDate, formatMoney } from "@/lib/format";
import { Icons } from "@/components/icons";
import {
  ErrorState,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { apiMutation, useApi } from "@/components/use-api";

function formatDocument(value: string | null) {
  if (!value) return "SEM DOCUMENTO";
  if (value.length === 11) {
    return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (value.length === 14) {
    return value.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      "$1.$2.$3/$4-$5",
    );
  }
  return value;
}

export function ClientDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const api = useApi<{ client: ClientRecord; sales: SaleRecord[] }>(
    `/api/clients/${id}`,
  );
  const meApi = useApi<{ user: CurrentUser }>("/api/me");
  const [addressOpen, setAddressOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiMutation(`/api/clients/${id}/addresses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      setAddressOpen(false);
      await api.refresh();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Erro ao cadastrar endereço.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteClient() {
    const client = api.data?.client;
    if (!client) return;
    const confirmed = window.confirm(
      `Excluir definitivamente o cliente ${client.legalName}? As vendas já cadastradas serão preservadas, mas deixarão de ficar vinculadas a este cliente.`,
    );
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await apiMutation(`/api/clients/${client.id}`, { method: "DELETE" });
      router.replace("/clientes");
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Erro ao excluir o cliente.",
      );
      setDeleting(false);
    }
  }

  if (api.loading) return <LoadingState label="Carregando cadastro…" />;
  if (api.error) return <ErrorState message={api.error} retry={api.refresh} />;
  if (!api.data) return null;

  const { client, sales } = api.data;
  const contact =
    client.contacts.find((item) => item.isPrimary) ?? client.contacts[0];
  const summary = client.summary!;

  return (
    <>
      <PageHeader
        eyebrow="Detalhes do cadastro"
        title={client.legalName}
        description={`${formatDocument(client.cpfCnpj)}${
          client.tradeName ? ` · ${client.tradeName}` : ""
        }`}
        actions={
          <>
            <Link className="button secondary" href="/clientes">Voltar</Link>
            {meApi.data?.user.role === "ADMIN" && (
              <button
                type="button"
                className="button danger"
                disabled={deleting}
                onClick={deleteClient}
              >
                {deleting ? "Excluindo cliente…" : "Excluir cliente"}
              </button>
            )}
          </>
        }
      />
      {error && <p className="form-error" role="alert">{error}</p>}
      <section className="client-summary-grid">
        <article className="panel identity-card">
          <div className="client-avatar large">{client.legalName.slice(0, 2)}</div>
          <div>
            <StatusBadge status={client.active ? "ATIVO" : "INATIVO"} />
            <h2>{client.legalName}</h2>
            <p>{formatDocument(client.cpfCnpj)}</p>
          </div>
          <dl>
            <div><dt>Responsável</dt><dd>{contact?.name ?? "—"}</dd></div>
            <div><dt>E-mail</dt><dd>{contact?.email ?? "—"}</dd></div>
            <div><dt>Telefone</dt><dd>{contact?.phone ?? "—"}</dd></div>
            <div><dt>WhatsApp</dt><dd>{contact?.whatsapp ?? "—"}</dd></div>
          </dl>
        </article>
        <article className="client-metrics">
          <div><span>Vendas</span><strong>{summary.salesCount}</strong></div>
          <div><span>Valor dos fretes</span><strong>{formatMoney(summary.freightAmountCents)}</strong></div>
          <div><span>Total recebido</span><strong className="positive">{formatMoney(summary.receivedCents)}</strong></div>
          <div><span>Em haver</span><strong>{formatMoney(summary.balanceCents)}</strong></div>
          <div className="overdue"><span>Vencido</span><strong>{formatMoney(summary.overdueCents)}</strong></div>
        </article>
      </section>

      <section className="panel">
        <header>
          <div><span className="eyebrow">Logística</span><h2>Endereços da empresa, coleta e entrega</h2></div>
          <button className="button secondary" onClick={() => setAddressOpen(true)}><Icons.plus /> Novo endereço</button>
        </header>
        {client.addresses.length ? (
          <div className="address-grid">
            {client.addresses.map((address) => {
              const full = `${address.street}, ${address.number}${address.complement ? `, ${address.complement}` : ""} - ${address.district}, ${address.city}/${address.state} ${address.cep ?? ""}`;
              return (
                <article className="address-card" key={address.id}>
                  <div><StatusBadge status={address.type} />{address.isPrimary && <span className="primary-tag">PRINCIPAL</span>}</div>
                  <h3>{address.label ?? address.type}</h3>
                  <p>{full}</p>
                  <small>{address.contactName ?? contact?.name ?? "SEM CONTATO"}{address.phone ? ` · ${address.phone}` : ""}</small>
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full)}`} target="_blank" rel="noreferrer"><Icons.map /> Exibir no mapa</a>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="inline-empty">Nenhum endereço cadastrado. Adicione o endereço da empresa e, quando necessário, endereços específicos de coleta ou entrega.</p>
        )}
      </section>

      <section className="panel">
        <header><div><span className="eyebrow">Histórico</span><h2>Vendas e cobranças</h2></div></header>
        <div className="responsive-table">
          <table>
            <thead><tr><th>Venda</th><th>Data</th><th>Rota</th><th>Frete</th><th>Recebido</th><th>Em haver</th><th>Situação</th><th></th></tr></thead>
            <tbody>
              {sales.length ? sales.map((sale) => (
                <tr key={sale.id}>
                  <td data-label="Venda"><strong>{sale.saleNumber}</strong></td><td data-label="Data">{formatDate(sale.saleDate)}</td><td data-label="Rota">{sale.origin} → {sale.destination}</td><td data-label="Frete">{formatMoney(sale.freightAmountCents)}</td><td data-label="Recebido" className="positive">{formatMoney(sale.financial.totalReceivedCents)}</td><td data-label="Em haver">{formatMoney(sale.financial.balanceCents)}</td><td data-label="Situação"><StatusBadge status={sale.financial.status} partial={sale.financial.isPartial} /></td><td><Link className="table-action" href={`/vendas/${sale.id}`}><Icons.chevron /></Link></td>
                </tr>
              )) : <tr><td colSpan={8} className="empty-cell">Nenhuma venda vinculada.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={addressOpen} onClose={() => setAddressOpen(false)} title="Novo endereço" description="Cadastre o endereço da empresa ou um ponto específico da operação." wide>
        <form className="modal-body form-stack" onSubmit={addAddress}>
          <div className="form-grid three">
            <Field label="Tipo"><select name="type" defaultValue="EMPRESA"><option value="EMPRESA">EMPRESA</option><option value="COLETA">COLETA</option><option value="ENTREGA">ENTREGA</option></select></Field>
            <Field label="Nome de referência" hint="Ex.: matriz, depósito ou obra."><input name="label" /></Field>
            <Field label="CEP"><input name="cep" inputMode="numeric" /></Field>
            <Field label="Logradouro"><input name="street" required /></Field>
            <Field label="Número"><input name="number" required /></Field>
            <Field label="Complemento"><input name="complement" /></Field>
            <Field label="Bairro"><input name="district" required /></Field>
            <Field label="Cidade"><input name="city" required /></Field>
            <Field label="UF"><input name="state" maxLength={2} required /></Field>
            <Field label="Contato no local"><input name="contactName" /></Field>
            <Field label="Telefone do local"><input name="phone" inputMode="tel" /></Field>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer className="modal-actions">
            <button type="button" className="button secondary" onClick={() => setAddressOpen(false)}>Cancelar</button>
            <button className="button primary" disabled={saving}>{saving ? "Salvando…" : "Cadastrar endereço"}</button>
          </footer>
        </form>
      </Modal>
    </>
  );
}
