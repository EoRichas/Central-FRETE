"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type {
  ClientAddressRecord,
  ClientRecord,
  CostRecord,
  CurrentUser,
  SaleRecord,
} from "@/lib/contracts";
import { commissionCents } from "@/lib/domain/finance";
import {
  calculateDestinationArrivalDate,
  FIXED_COST_ROWS,
  normalizeCostCategory,
  OPERATIONAL_STATUS_OPTIONS,
} from "@/lib/domain/operations";
import { formatMoney, moneyInputToCents } from "@/lib/format";
import { ClientFormModal } from "@/components/client-form-modal";
import { Icons } from "@/components/icons";
import { ErrorState, Field, LoadingState, PageHeader } from "@/components/ui";
import { apiMutation, useApi } from "@/components/use-api";

type CostDraft = {
  key: string;
  category: string;
  label: string;
  amount: string;
  providerName: string;
  description: string;
  occurredOn: string;
  confirmed: boolean;
};

function todaySaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function addressText(address: ClientAddressRecord | undefined) {
  if (!address) return "";
  return [
    address.street,
    address.number,
    address.complement,
    address.district,
    `${address.city}/${address.state}`,
    address.cep,
  ]
    .filter(Boolean)
    .join(", ");
}

function emptyCostDrafts(): CostDraft[] {
  return FIXED_COST_ROWS.map((row) => ({
    ...row,
    amount: "",
    providerName: "",
    description: row.label,
    occurredOn: "",
    confirmed: false,
  }));
}

function hydrateCostDrafts(existing: CostRecord[]) {
  const drafts = emptyCostDrafts();
  for (const cost of existing) {
    const category = normalizeCostCategory(cost.category);
    const candidates = drafts.filter((draft) => draft.category === category);
    const target =
      category === "PRESTADOR_SERVICO" && cost.providerSlot
        ? drafts.find((draft) => draft.key === `PRESTADOR_SERVICO_${cost.providerSlot}`)
        : candidates.find((draft) => !draft.amount) ??
          candidates[candidates.length - 1];
    if (!target) continue;
    const hadAmount = Boolean(target.amount);
    const current = hadAmount ? moneyInputToCents(target.amount) : 0;
    target.amount = centsToInput(current + cost.amountCents);
    target.providerName ||= cost.providerName ?? "";
    target.description =
      category === "ICMS" ? "ICMS" : cost.description ?? target.description;
    target.occurredOn ||= cost.occurredOn ?? "";
    target.confirmed = hadAmount
      ? target.confirmed && cost.confirmed
      : cost.confirmed;
  }
  return drafts;
}

export function SaleEditScreen({ id }: { id: string }) {
  const api = useApi<{ sale: SaleRecord }>(`/api/sales/${id}`);
  if (api.loading) return <LoadingState label="Carregando venda para edição…" />;
  if (api.error) return <ErrorState message={api.error} retry={api.refresh} />;
  if (!api.data) return null;
  return <SaleFormScreen initialSale={api.data.sale} />;
}

export function SaleFormScreen({ initialSale }: { initialSale?: SaleRecord }) {
  const router = useRouter();
  const editing = Boolean(initialSale);
  const clientsApi = useApi<{ clients: ClientRecord[] }>("/api/clients");
  const meApi = useApi<{ user: CurrentUser }>("/api/me");
  const [sellerName, setSellerName] = useState(initialSale?.sellerName ?? "");
  const [clientId, setClientId] = useState(initialSale?.clientId ?? "");
  const [pickupAddressId, setPickupAddressId] = useState("");
  const [deliveryAddressId, setDeliveryAddressId] = useState("");
  const [pickupAddress, setPickupAddress] = useState(
    initialSale?.pickupAddressSnapshot ?? "",
  );
  const [deliveryAddress, setDeliveryAddress] = useState(
    initialSale?.deliveryAddressSnapshot ?? "",
  );
  const [operationalDeadlineDays, setOperationalDeadlineDays] = useState(
    initialSale?.operationalDeadlineDays?.toString() ?? "",
  );
  const [originYardEntryDate, setOriginYardEntryDate] = useState(
    initialSale?.originYardEntryDate ?? "",
  );
  const [destinationArrivalDate, setDestinationArrivalDate] = useState(
    initialSale?.deliveryDeadline ?? "",
  );
  const [costs, setCosts] = useState<CostDraft[]>(() =>
    hydrateCostDrafts(initialSale?.costs ?? []),
  );
  const [freightValue, setFreightValue] = useState(
    initialSale ? centsToInput(initialSale.freightAmountCents) : "",
  );
  const [commissionPercent, setCommissionPercent] = useState(
    initialSale
      ? (initialSale.commissionBasisPoints / 100).toFixed(2).replace(".", ",")
      : "7",
  );
  const [clientModal, setClientModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedClient = clientsApi.data?.clients.find(
    (client) => client.id === clientId,
  );

  const sellerNameValue =
    !editing && meApi.data?.user.role === "VENDEDOR"
      ? meApi.data.user.name
      : sellerName;

  const preview = useMemo(() => {
    try {
      const freight = moneyInputToCents(freightValue || "0");
      const basisPoints = Math.round(
        Number(commissionPercent.replace(",", ".")) * 100,
      );
      const commission = commissionCents(freight, basisPoints);
      const expenses = costs.reduce(
        (sum, cost) =>
          sum + (cost.amount ? moneyInputToCents(cost.amount) : 0),
        0,
      );
      return {
        freight,
        commission,
        expenses,
        totalCost: commission + expenses,
        margin: freight - commission - expenses,
        marginPercent: freight
          ? Math.round(
              ((freight - commission - expenses) * 10_000) / freight,
            )
          : 0,
      };
    } catch {
      return {
        freight: 0,
        commission: 0,
        expenses: 0,
        totalCost: 0,
        margin: 0,
        marginPercent: 0,
      };
    }
  }, [freightValue, commissionPercent, costs]);

  function updateCost(key: string, amount: string) {
    setCosts((items) =>
      items.map((item) => (item.key === key ? { ...item, amount } : item)),
    );
  }

  function costPayload() {
    return costs
      .filter((cost) => cost.amount && moneyInputToCents(cost.amount) > 0)
      .map((cost) => ({
        category: cost.category,
        providerName: cost.providerName,
        description: cost.description,
        occurredOn: cost.occurredOn || null,
        amountCents: moneyInputToCents(cost.amount),
        confirmed: cost.confirmed,
        providerSlot:
          cost.category === "PRESTADOR_SERVICO"
            ? Number(cost.key.replace("PRESTADOR_SERVICO_", ""))
            : null,
      }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        saleNumber: form.get("saleNumber"),
        saleDate: form.get("saleDate"),
        sellerName: form.get("sellerName"),
        clientId: clientId || null,
        vehicle: form.get("vehicle"),
        plate: form.get("plate"),
        initialProviderName: form.get("initialProviderName"),
        origin: form.get("origin"),
        destination: form.get("destination"),
        pickupAddressSnapshot:
          addressText(
            selectedClient?.addresses.find(
              (address) => address.id === pickupAddressId,
            ),
          ) || pickupAddress,
        deliveryAddressSnapshot:
          addressText(
            selectedClient?.addresses.find(
              (address) => address.id === deliveryAddressId,
            ),
          ) || deliveryAddress,
        operationalDeadlineDays: operationalDeadlineDays || null,
        originYardEntryDate: originYardEntryDate || null,
        deliveryDeadline: destinationArrivalDate || null,
        financialDueDate: form.get("financialDueDate"),
        operationalStatus: form.get("operationalStatus"),
        notes: form.get("notes"),
        freightAmountCents: moneyInputToCents(freightValue),
        commissionBasisPoints: Math.round(
          Number(commissionPercent.replace(",", ".")) * 100,
        ),
        paymentMethod: form.get("paymentMethod"),
        costs: costPayload(),
      };

      const result = await apiMutation<{ id?: string }>(
        editing ? `/api/sales/${initialSale!.id}` : "/api/sales",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      router.push(`/vendas/${initialSale?.id ?? result.id}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Erro ao salvar venda.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteSale() {
    if (!initialSale) return;
    const confirmed = window.confirm(
      `Excluir definitivamente a venda ${initialSale.saleNumber}? Esta ação removerá custos, recebimentos e anexos vinculados.`,
    );
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await apiMutation(`/api/sales/${initialSale.id}`, { method: "DELETE" });
      router.replace("/vendas");
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Erro ao excluir a venda.",
      );
      setDeleting(false);
    }
  }

  const pickupOptions = selectedClient?.addresses.filter(
    (address) => address.type === "EMPRESA" || address.type === "COLETA",
  );
  const deliveryOptions = selectedClient?.addresses.filter(
    (address) => address.type === "EMPRESA" || address.type === "ENTREGA",
  );
  const paymentMethod = initialSale?.installments[0]?.paymentMethod ?? "PIX";
  const today = todaySaoPaulo();

  return (
    <>
      <PageHeader
        eyebrow={editing ? `Venda ${initialSale!.saleNumber}` : "Nova operação"}
        title={editing ? "Editar venda de frete" : "Cadastrar venda de frete"}
        description={
          editing
            ? "Todos os dados operacionais e financeiros da venda podem ser corrigidos; os recebimentos existentes são preservados."
            : "Dados operacionais, custos e cobrança são salvos juntos, com regras financeiras validadas no servidor."
        }
        actions={
          <Link
            className="button secondary"
            href={editing ? `/vendas/${initialSale!.id}` : "/vendas"}
          >
            Cancelar
          </Link>
        }
      />
      <form className="form-page" onSubmit={submit}>
        <section className="form-section">
          <header><span>01</span><div><h2>Cliente</h2><p>O endereço da empresa pode ser usado tanto na coleta quanto na entrega.</p></div></header>
          <div className="form-grid three">
            <Field label="Cliente">
              <select value={clientId} onChange={(event) => { setClientId(event.target.value); setPickupAddressId(""); setDeliveryAddressId(""); setPickupAddress(""); setDeliveryAddress(""); }}>
                <option value="">Cliente não informado</option>
                {clientsApi.data?.clients.map((client) => <option key={client.id} value={client.id}>{client.legalName}</option>)}
              </select>
            </Field>
            <div className="field-action"><span>Cadastro rápido</span><button type="button" className="button secondary" onClick={() => setClientModal(true)}><Icons.plus /> Novo cliente</button></div>
            {selectedClient && <div className="client-inline"><strong>{selectedClient.legalName}</strong><span>{selectedClient.cpfCnpj || "SEM DOCUMENTO"}</span><small>{selectedClient.contacts[0]?.name || "SEM CONTATO"} · {selectedClient.contacts[0]?.phone || "SEM TELEFONE"}</small></div>}
            <Field label="Endereço de coleta cadastrado">
              <select value={pickupAddressId} onChange={(event) => setPickupAddressId(event.target.value)}>
                <option value="">Informar manualmente</option>
                {pickupOptions?.map((address) => <option key={address.id} value={address.id}>{address.type} · {address.label || addressText(address)}</option>)}
              </select>
            </Field>
            <Field label="Endereço de entrega cadastrado">
              <select value={deliveryAddressId} onChange={(event) => setDeliveryAddressId(event.target.value)}>
                <option value="">Informar manualmente</option>
                {deliveryOptions?.map((address) => <option key={address.id} value={address.id}>{address.type} · {address.label || addressText(address)}</option>)}
              </select>
            </Field>
          </div>
        </section>

        <section className="form-section operation-form-section">
          <header><span>02</span><div><h2>Operação</h2><p>Use somente os estágios operacionais definidos para a Central Express.</p></div></header>
          <div className="operation-section-grid">
            <div className="form-grid four operation-identification-grid">
              <Field label="Número da venda"><input name="saleNumber" defaultValue={initialSale?.saleNumber ?? ""} required /></Field>
              <Field label="Data da venda"><input name="saleDate" type="date" defaultValue={initialSale?.saleDate ?? today} required /></Field>
              <Field label="Vendedor"><input name="sellerName" value={sellerNameValue} onChange={(event) => setSellerName(event.target.value)} readOnly={meApi.data?.user.role === "VENDEDOR"} required /></Field>
              <Field label="Status operacional"><select name="operationalStatus" defaultValue={initialSale?.operationalStatus ?? "CONFIRMAR"}>{OPERATIONAL_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
              <Field label="Veículo"><input name="vehicle" defaultValue={initialSale?.vehicle ?? ""} /></Field>
              <Field label="Placa"><input name="plate" maxLength={8} defaultValue={initialSale?.plate ?? ""} /></Field>
              <Field label="Prestador inicial"><input name="initialProviderName" defaultValue={initialSale?.initialProviderName ?? ""} /></Field>
              <Field label="Prazo operacional (dias)"><input type="number" min={1} max={365} inputMode="numeric" value={operationalDeadlineDays} onChange={(event) => { const value = event.target.value; setOperationalDeadlineDays(value); const calculated = calculateDestinationArrivalDate(originYardEntryDate, value); if (calculated) setDestinationArrivalDate(calculated); }} /></Field>
            </div>
            <div className="operation-timing-grid">
              <Field label="Entrada no pátio de origem"><input type="date" value={originYardEntryDate} onChange={(event) => { const value = event.target.value; setOriginYardEntryDate(value); const calculated = calculateDestinationArrivalDate(value, operationalDeadlineDays); if (calculated) setDestinationArrivalDate(calculated); }} /></Field>
              <Field label="Chegada prevista no destino" hint="Calculada pela entrada + prazo; pode ser ajustada."><input type="date" value={destinationArrivalDate} onChange={(event) => setDestinationArrivalDate(event.target.value)} /></Field>
            </div>
            <div className="route-pair-grid">
              <div className="route-side">
                <span className="route-side-label">Origem</span>
                <Field label="Cidade / UF"><input name="origin" defaultValue={initialSale?.origin ?? ""} required /></Field>
                <Field label="Endereço completo de coleta"><input value={pickupAddressId ? addressText(selectedClient?.addresses.find((address) => address.id === pickupAddressId)) : pickupAddress} onChange={(event) => setPickupAddress(event.target.value)} readOnly={Boolean(pickupAddressId)} /></Field>
              </div>
              <div className="route-side destination">
                <span className="route-side-label">Destino</span>
                <Field label="Cidade / UF"><input name="destination" defaultValue={initialSale?.destination ?? ""} required /></Field>
                <Field label="Endereço completo de entrega"><input value={deliveryAddressId ? addressText(selectedClient?.addresses.find((address) => address.id === deliveryAddressId)) : deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} readOnly={Boolean(deliveryAddressId)} /></Field>
              </div>
            </div>
          </div>
        </section>

        <section className="form-section">
          <header><span>03</span><div><h2>Valores e despesas</h2><p>Todos os custos ficam visíveis e cada linha aceita somente um valor em reais.</p></div></header>
          <div className="form-grid three">
            <Field label="Valor total do frete"><div className="money-field"><span>R$</span><input value={freightValue} onChange={(event) => setFreightValue(event.target.value)} placeholder="0,00" inputMode="decimal" required /></div></Field>
            <Field label="Comissão do vendedor (%)"><input value={commissionPercent} onChange={(event) => setCommissionPercent(event.target.value)} inputMode="decimal" required /></Field>
            <div className="calculation-summary"><span>Comissão calculada</span><strong>{formatMoney(preview.commission)}</strong></div>
          </div>
          <div className="cost-list">
            <div className="cost-list-head"><div><h3>Custos da operação</h3><p>Preencha apenas as linhas que possuem valor.</p></div><span className="cost-currency-tag">TODOS OS VALORES EM BRL</span></div>
            <div className="fixed-cost-grid">
              {costs.map((cost, index) => (
                <label className="fixed-cost-row" key={cost.key}>
                  <span className="cost-index">{String(index + 1).padStart(2, "0")}</span>
                  <strong>{cost.label}</strong>
                  <div className="money-field compact"><span>R$</span><input aria-label={`Valor de ${cost.label}`} inputMode="decimal" placeholder="0,00" value={cost.amount} onChange={(event) => updateCost(cost.key, event.target.value)} /></div>
                </label>
              ))}
            </div>
          </div>
          <div className="financial-preview">
            <div><span>Valor do frete</span><strong>{formatMoney(preview.freight)}</strong></div><b>−</b><div><span>Comissão + despesas</span><strong>{formatMoney(preview.totalCost)}</strong></div><b>=</b><div className={preview.margin < 0 ? "negative" : "positive"}><span>Margem da Central</span><strong>{formatMoney(preview.margin)} · {(preview.marginPercent / 100).toFixed(2).replace(".", ",")}%</strong></div>
          </div>
        </section>

        <section className="form-section">
          <header><span>04</span><div><h2>Cobrança</h2><p>Defina o vencimento e a forma de pagamento; recebimentos existentes são preservados.</p></div></header>
          <div className="form-grid two">
            <Field label="Vencimento da cobrança"><input name="financialDueDate" type="date" defaultValue={initialSale?.financialDueDate ?? ""} required /></Field>
            <Field label="Forma de pagamento"><select name="paymentMethod" defaultValue={paymentMethod}><option value="BOLETO">Boleto</option><option value="DINHEIRO">Dinheiro</option><option value="CREDITO">Crédito</option><option value="DEBITO">Débito</option><option value="PIX">PIX</option><option value="FATURADO">Faturado</option></select></Field>
          </div>
          <Field label="Observações"><textarea name="notes" rows={4} defaultValue={initialSale?.notes ?? ""} /></Field>
        </section>

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="sticky-form-actions">
          {editing && meApi.data?.user.role === "ADMIN" && (
            <button
              type="button"
              className="button danger delete-sale-button"
              disabled={saving || deleting}
              onClick={deleteSale}
            >
              {deleting ? "Excluindo venda…" : "Excluir venda"}
            </button>
          )}
          <Link href={editing ? `/vendas/${initialSale!.id}` : "/vendas"} className="button secondary">Cancelar</Link>
          <button className="button primary" disabled={saving || deleting}>{saving ? "Salvando venda…" : editing ? "Salvar alterações" : "Salvar venda"}</button>
        </div>
      </form>
      <ClientFormModal open={clientModal} onClose={() => setClientModal(false)} onCreated={(id) => { setClientId(id); clientsApi.refresh(); }} />
    </>
  );
}
