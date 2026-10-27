"use client";

import { AddressFields, ClientChannelSelect } from "@/components/registry-fields";
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
  const [editOpen, setEditOpen] = useState(false);
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

  async function saveClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = api.data?.client;
    if (!client) return;
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiMutation(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: form.get("type"), legalName: form.get("legalName"), tradeName: form.get("tradeName"), cpfCnpj: form.get("cpfCnpj"), stateRegistration: form.get("stateRegistration"),
          contacts: client.contacts.map(c=>({...c,...Object.fromEntries(['name','phone','whatsapp','email'].map(k=>[k,form.get(`contact_${c.id}_${k}`)]))})),
          addresses: client.addresses.map(a=>({...a,...Object.fromEntries(['type','label','contactName','phone','cep','street','number','complement','district','city','state'].map(k=>[k,form.get(`address_${a.id}_${k}`)]))})),
          notes: form.get("notes"),
          saleChannel: form.get("saleChannel"),
          active: form.get("active") === "true",
        }),
      });
      setEditOpen(false);
      await api.refresh();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Erro ao atualizar o cliente.",
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
            {["ADMIN","VENDEDOR"].includes(meApi.data?.user.role ?? "") && (
              <button
                type="button"
                className="table-action"
                aria-label="Editar cliente"
                title="Editar cliente"
                onClick={() => {
                  setError(null);
                  setEditOpen(true);
                }}
              >
                <Icons.chevron />
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
            <div><dt>Tipo</dt><dd>{client.type === "PF" ? "Pessoa física" : "Pessoa jurídica"}</dd></div>
            <div><dt>Nome fantasia</dt><dd>{client.tradeName || "—"}</dd></div>
            <div><dt>Inscrição estadual</dt><dd>{client.stateRegistration || "—"}</dd></div>
            <div><dt>Canal de atendimento</dt><dd>{{ FROTA: "Frota", CEGONHA: "Cegonha", AMBOS: "Ambos" }[client.saleChannel]}</dd></div>
          </dl>
          {client.contacts.length ? client.contacts.map((item) => (
            <dl key={item.id}>
              <div><dt>{item.isPrimary ? "Responsável / contato principal" : "Responsável / contato adicional"}</dt><dd>{item.name || "—"}</dd></div>
              <div><dt>E-mail</dt><dd>{item.email || "—"}</dd></div>
              <div><dt>Telefone</dt><dd>{item.phone || "—"}</dd></div>
              <div><dt>WhatsApp</dt><dd>{item.whatsapp || "—"}</dd></div>
            </dl>
          )) : <dl><div><dt>Contatos</dt><dd>Nenhum contato cadastrado.</dd></div></dl>}
          <dl>
            <div style={{ gridColumn: "1 / -1" }}><dt>Observações</dt><dd style={{ whiteSpace: "pre-wrap" }}>{client.notes || "—"}</dd></div>
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
          <button className="button secondary create-sale-action" onClick={() => setAddressOpen(true)}><Icons.plus /> Novo endereço</button>
        </header>
        {client.addresses.length ? (
          <div className="address-grid">
            {client.addresses.map((address) => {
              const full = `${address.street}, ${address.number}${address.complement ? `, ${address.complement}` : ""} - ${address.district}, ${address.city}/${address.state} ${address.cep ?? ""}`;
              return (
                <article className="address-card" key={address.id}>
                  <div><StatusBadge status={address.type} />{address.isPrimary && <span className="primary-tag">PRINCIPAL</span>}</div>
                  <h3>{address.label ?? address.type}</h3>
                  <dl className="details-list">
                    <div><dt>CEP</dt><dd>{address.cep || "—"}</dd></div>
                    <div><dt>Logradouro</dt><dd>{address.street || "—"}</dd></div>
                    <div><dt>Número</dt><dd>{address.number || "—"}</dd></div>
                    <div><dt>Complemento</dt><dd>{address.complement || "—"}</dd></div>
                    <div><dt>Bairro</dt><dd>{address.district || "—"}</dd></div>
                    <div><dt>Cidade</dt><dd>{address.city || "—"}</dd></div>
                    <div><dt>UF</dt><dd>{address.state || "—"}</dd></div>
                    <div><dt>Contato no local</dt><dd>{address.contactName || contact?.name || "—"}</dd></div>
                    <div><dt>Telefone do local</dt><dd>{address.phone || "—"}</dd></div>
                  </dl>
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

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar cliente" description="Atualize os dados cadastrais, contatos e endereços do cliente." wide>
        <form className="modal-body form-stack" onSubmit={saveClient}>
          <div className="form-grid three">
            <Field label="Tipo"><select name="type" defaultValue={client.type}><option value="PF">Pessoa física</option><option value="PJ">Pessoa jurídica</option></select></Field>
            <Field label="Razão social / Nome"><input name="legalName" defaultValue={client.legalName} required /></Field>
            <Field label="Nome fantasia"><input name="tradeName" defaultValue={client.tradeName??''} /></Field>
            <Field label="CPF / CNPJ"><input name="cpfCnpj" defaultValue={client.cpfCnpj??''} inputMode="numeric" /></Field>
            <Field label="Inscrição estadual"><input name="stateRegistration" defaultValue={client.stateRegistration??''} /></Field>
          </div>
          {client.contacts.map((c,index)=><fieldset className="form-stack" key={c.id}><legend>Contato {index+1}</legend><div className="form-grid two">{([['name','Nome do contato'],['phone','Telefone'],['whatsapp','WhatsApp'],['email','E-mail']] as const).map(([key,label])=><Field key={key} label={label}><input name={`contact_${c.id}_${key}`} defaultValue={c[key]??''} type={key==='email'?'email':'text'} required={key==='name'} /></Field>)}</div></fieldset>)}
          {client.addresses.map((a,index)=><fieldset className="form-stack" key={a.id}><legend>Endereço {index+1}</legend><div className="form-grid three"><Field label="Tipo de endereço"><select name={`address_${a.id}_type`} defaultValue={a.type}><option value="EMPRESA">Empresa</option><option value="COLETA">Coleta</option><option value="ENTREGA">Entrega</option></select></Field>{([['label','Referência'],['contactName','Contato no local'],['phone','Telefone do local'],['cep','CEP'],['street','Logradouro'],['number','Número'],['complement','Complemento'],['district','Bairro'],['city','Cidade'],['state','UF']] as const).map(([key,label])=><Field key={key} label={label}><input name={`address_${a.id}_${key}`} defaultValue={a[key]??''} maxLength={key==='state'?2:200} /></Field>)}</div></fieldset>)}
          <ClientChannelSelect value={client.saleChannel}/>
          <Field label="Situação">
            <select name="active" defaultValue={client.active ? "true" : "false"}>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </Field>
          <Field label="Observações">
            <textarea name="notes" rows={4} defaultValue={client.notes ?? ""} />
          </Field>
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer className="modal-actions">
            {meApi.data?.user.role==='ADMIN' && <button type="button" className="button danger" disabled={deleting || saving} onClick={deleteClient}>
              {deleting ? "Excluindo cliente…" : "Excluir cliente"}
            </button>}
            <button type="button" className="button secondary" onClick={() => setEditOpen(false)}>Cancelar</button>
            <button className="button primary" disabled={saving || deleting}>{saving ? "Salvando…" : "Salvar cliente"}</button>
          </footer>
        </form>
      </Modal>

      <Modal open={addressOpen} onClose={() => setAddressOpen(false)} title="Novo endereço" description="Cadastre o endereço da empresa ou um ponto específico da operação." wide>
        <form className="modal-body form-stack" onSubmit={addAddress}>
          <div className="form-grid three">
            <Field label="Tipo"><select name="type" defaultValue="EMPRESA"><option value="EMPRESA">EMPRESA</option><option value="COLETA">COLETA</option><option value="ENTREGA">ENTREGA</option></select></Field>
            <Field label="Nome de referência" hint="Ex.: matriz, depósito ou obra."><input name="label" /></Field>
            <Field label="Contato no local"><input name="contactName" /></Field>
            <Field label="Telefone do local"><input name="phone" inputMode="tel" /></Field>
          </div>
          <AddressFields/>
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
