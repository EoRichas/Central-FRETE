"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  CostRecord,
  CurrentUser,
  SaleRecord,
} from "@/lib/contracts";
import {
  costCategoryLabel,
  isEditableOperationCostCategory,
  isOperationPaymentCategory,
  isPaymentControlCostCategory,
} from "@/lib/domain/operations";
import {
  formatDate,
  formatMoney,
  formatPercent,
  moneyInputToCents,
} from "@/lib/format";
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

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function SaleDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const saleApi = useApi<{ sale: SaleRecord }>(`/api/sales/${id}`);
  const meApi = useApi<{ user: CurrentUser }>("/api/me");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [providerSlot, setProviderSlot] = useState<number | null>(null);
  const [providerStatus, setProviderStatus] = useState<"EM_ABERTO" | "PAGO">(
    "EM_ABERTO",
  );
  const [operationCost, setOperationCost] = useState<CostRecord | null>(null);
  const [operationCostStatus, setOperationCostStatus] = useState<
    "EM_ABERTO" | "CONFIRMADO"
  >("EM_ABERTO");
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sale = saleApi.data?.sale;
  const user = meApi.data?.user;
  const canManageProviders =
    user?.role === "ADMIN" || user?.role === "FINANCEIRO";
  const canManagePayments = canManageProviders;
  const canManageOperationCosts = canManageProviders;
  const canEditSale = user?.role === "ADMIN";
  const canDeleteSale = user?.role === "ADMIN";
  const canAttach =
    user?.role === "ADMIN" || user?.role === "FINANCEIRO";

  async function registerPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      form.set("amountCents", String(moneyInputToCents(form.get("amount"))));
      form.delete("amount");
      await apiMutation(`/api/sales/${id}/payments`, {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: form,
      });
      setPaymentOpen(false);
      saleApi.refresh();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Erro ao registrar recebimento.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function reversePayment(paymentId: string) {
    if (!window.confirm("Confirmar o estorno? O lançamento original será preservado.")) {
      return;
    }
    setError(null);
    try {
      await apiMutation(`/api/payments/${paymentId}/reverse`, { method: "POST" });
      saleApi.refresh();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Erro ao estornar.",
      );
    }
  }

  function openProviderCost(slot: number, cost: CostRecord | undefined) {
    setError(null);
    setProviderStatus(cost?.paymentStatus === "PAGO" ? "PAGO" : "EM_ABERTO");
    setProviderSlot(slot);
  }

  async function saveProviderCost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!providerSlot) return;
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiMutation(`/api/sales/${id}/provider-costs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerSlot,
          providerName: form.get("providerName"),
          pixDetails: form.get("pixDetails"),
          amountCents: moneyInputToCents(form.get("amount")),
          paymentStatus: providerStatus,
          paidAt: providerStatus === "PAGO" ? form.get("paidAt") : null,
        }),
      });
      setProviderSlot(null);
      saleApi.refresh();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Erro ao salvar o custo do prestador.",
      );
    } finally {
      setSaving(false);
    }
  }

  function openOperationCost(cost: CostRecord) {
    setError(null);
    setOperationCostStatus(cost.confirmed ? "CONFIRMADO" : "EM_ABERTO");
    setOperationCost(cost);
  }

  async function saveOperationCost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!operationCost) return;
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiMutation(`/api/sales/${id}/operation-costs`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          costId: operationCost.id,
          description: form.get("description"),
          pixDetails: isEditableOperationCostCategory(operationCost.category)
            ? form.get("pixDetails")
            : operationCost.pixDetails,
          occurredOn: form.get("occurredOn") || null,
          amountCents: moneyInputToCents(form.get("amount")),
          status: operationCostStatus,
        }),
      });
      setOperationCost(null);
      saleApi.refresh();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Erro ao salvar o custo da operação.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadAttachment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiMutation(`/api/sales/${id}/attachments`, {
        method: "POST",
        body: form,
      });
      setAttachmentOpen(false);
      saleApi.refresh();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Erro ao anexar o comprovante.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteSale() {
    if (!sale) return;
    const confirmed = window.confirm(
      `Excluir definitivamente a venda ${sale.saleNumber}? Esta ação removerá custos, recebimentos e anexos vinculados.`,
    );
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await apiMutation(`/api/sales/${sale.id}`, { method: "DELETE" });
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

  if (saleApi.loading) return <LoadingState label="Carregando a venda…" />;
  if (saleApi.error) {
    return <ErrorState message={saleApi.error} retry={saleApi.refresh} />;
  }
  if (!sale) return null;

  const legacyProviderCosts = sale.costs.filter(
    (cost) =>
      cost.category === "PRESTADOR_SERVICO" && cost.providerSlot === null,
  );
  const providerCosts = [1, 2, 3].map((slot) =>
    sale.costs.find(
      (cost) =>
        cost.category === "PRESTADOR_SERVICO" && cost.providerSlot === slot,
    ) ?? legacyProviderCosts[slot - 1],
  );
  const operationPaymentCosts = sale.costs.filter((cost) =>
    isOperationPaymentCategory(cost.category),
  );
  const paymentControlOrder = [
    "ICMS",
    "PATIO_DESTINO",
    "SEGURO_ALLIANZ",
    "PATIO_ORIGEM",
  ];
  const paymentControlCosts = sale.costs
    .filter(
      (cost) =>
        isPaymentControlCostCategory(cost.category) &&
        !isOperationPaymentCategory(cost.category),
    )
    .sort(
      (a, b) =>
        paymentControlOrder.indexOf(a.category) -
        paymentControlOrder.indexOf(b.category),
    );
  const regularCosts = sale.costs.filter((cost) =>
    cost.category === "OUTRAS_DESPESAS",
  );
  const selectedProviderCost = providerSlot
    ? providerCosts[providerSlot - 1]
    : undefined;

  return (
    <>
      <PageHeader
        eyebrow={`Venda ${sale.saleNumber}`}
        title={`${sale.origin} → ${sale.destination}`}
        description={`${sale.sellerName} · ${formatDate(sale.saleDate)} · ${sale.vehicle ?? "VEÍCULO NÃO INFORMADO"}${sale.plate ? ` / ${sale.plate}` : ""}`}
        actions={
          <>
            <Link className="button secondary" href="/vendas">
              Voltar
            </Link>
            {canEditSale && (
              <Link className="button secondary" href={`/vendas/${sale.id}/editar`}>
                Editar venda
              </Link>
            )}
            {canDeleteSale && (
              <button
                type="button"
                className="button danger"
                disabled={deleting}
                onClick={deleteSale}
              >
                {deleting ? "Excluindo venda…" : "Excluir venda"}
              </button>
            )}
            {canManagePayments && (
              <button
                className="button primary"
                onClick={() => {
                  setError(null);
                  setPaymentOpen(true);
                }}
              >
                <Icons.plus /> Registrar recebimento
              </button>
            )}
          </>
        }
      />
      {error && <p className="form-error" role="alert">{error}</p>}

      <section className="detail-status-strip">
        <div><span>Status operacional</span><StatusBadge status={sale.operationalStatus} /></div>
        <div><span>Status financeiro</span><StatusBadge status={sale.financial.status} partial={sale.financial.isPartial} /></div>
        <div><span>Margem</span><strong>{formatMoney(sale.financial.marginCents)} · {formatPercent(sale.financial.marginBasisPoints)}</strong><small>{sale.costsPending ? "PROVISÓRIA" : "FINAL"}</small></div>
      </section>

      <section className="detail-grid">
        <article className="panel detail-card">
          <header><div><span className="eyebrow">Cadastro</span><h2>Dados da operação</h2></div></header>
          <dl className="details-list">
            <div><dt>Cliente</dt><dd>{sale.clientName ?? "CLIENTE NÃO INFORMADO"}</dd></div>
            <div><dt>Prestador inicial</dt><dd>{sale.initialProviderName ?? "—"}</dd></div>
            <div><dt>Coleta</dt><dd>{sale.pickupAddressSnapshot ?? sale.origin}</dd></div>
            <div><dt>Entrega</dt><dd>{sale.deliveryAddressSnapshot ?? sale.destination}</dd></div>
            <div><dt>Prazo operacional</dt><dd>{sale.operationalDeadlineDays ? `${sale.operationalDeadlineDays} dias` : "—"}</dd></div>
            <div><dt>Entrada no pátio de origem</dt><dd>{formatDate(sale.originYardEntryDate)}</dd></div>
            <div><dt>Chegada prevista no destino</dt><dd>{formatDate(sale.deliveryDeadline)}</dd></div>
            <div><dt>Vencimento da cobrança</dt><dd>{formatDate(sale.financialDueDate)}</dd></div>
            <div className="full"><dt>Observações</dt><dd>{sale.notes ?? "—"}</dd></div>
          </dl>
        </article>
        <article className="panel financial-card">
          <header><div><span className="eyebrow">Resultado</span><h2>Composição financeira</h2></div></header>
          <div className="money-breakdown">
            <div><span>Valor do frete</span><strong>{formatMoney(sale.freightAmountCents)}</strong></div>
            <div><span>Comissão ({formatPercent(sale.commissionBasisPoints)})</span><strong>− {formatMoney(sale.financial.commissionCents)}</strong></div>
            <div><span>Demais despesas</span><strong>− {formatMoney(sale.financial.transportCostCents - sale.financial.commissionCents)}</strong></div>
            <div className="total"><span>Margem da Central</span><strong>{formatMoney(sale.financial.marginCents)}</strong></div>
          </div>
        </article>
      </section>

      <section className="panel provider-cost-panel">
        <header>
          <div><span className="eyebrow">Pagamentos</span><h2>Pagamentos da operação</h2><p>Controle prestadores, ICMS, seguro, pátios, coleta e entrega; itens em aberto aguardam confirmação do Financeiro.</p></div>
        </header>
        <div className="responsive-table">
          <table>
            <thead><tr><th>Linha</th><th>Referência</th><th>Situação</th><th>Data</th><th>Valor</th><th><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {providerCosts.map((cost, index) => {
                const slot = index + 1;
                return (
                  <tr key={cost?.id ?? `provider-slot-${slot}`}>
                    <td data-label="Linha"><strong>Prestador {slot}</strong></td>
                    <td data-label="Referência">
                      <strong>{cost?.providerName ?? "NÃO CADASTRADO"}</strong>
                      {cost && <small>{cost.pixDetails ? `PIX: ${cost.pixDetails}` : "PIX NÃO INFORMADO"}</small>}
                    </td>
                    <td data-label="Situação">{cost ? <StatusBadge status={cost.paymentStatus} /> : "—"}</td>
                    <td data-label="Data">{formatDate(cost?.paidAt)}</td>
                    <td data-label="Valor"><strong>{cost ? formatMoney(cost.amountCents) : "—"}</strong></td>
                    <td data-label="Ações">
                      {canManageProviders && (
                        <button className="button secondary compact-button" onClick={() => openProviderCost(slot, cost)}>
                          {cost ? "Editar / baixar" : "Cadastrar"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {paymentControlCosts.map((cost) => (
                <tr key={cost.id}>
                  <td data-label="Linha"><strong>{costCategoryLabel(cost.category)}</strong></td>
                  <td data-label="Referência">
                    <strong>{cost.description ?? costCategoryLabel(cost.category)}</strong>
                    <small>{cost.pixDetails ? `PIX: ${cost.pixDetails}` : "PIX NÃO INFORMADO"}</small>
                  </td>
                  <td data-label="Situação"><StatusBadge status={cost.confirmed ? "CONFIRMADO" : "EM_ABERTO"} /></td>
                  <td data-label="Data">{formatDate(cost.occurredOn)}</td>
                  <td data-label="Valor"><strong>{formatMoney(cost.amountCents)}</strong></td>
                  <td data-label="Ações">
                    {canManageOperationCosts && (
                      <button className="button secondary compact-button" onClick={() => openOperationCost(cost)}>Editar</button>
                    )}
                  </td>
                </tr>
              ))}
              {operationPaymentCosts.map((cost) => (
                <tr key={cost.id}>
                  <td data-label="Linha"><strong>{costCategoryLabel(cost.category)}</strong></td>
                  <td data-label="Referência">
                    <strong>{cost.description ?? "—"}</strong>
                    <small>{cost.pixDetails ? `PIX: ${cost.pixDetails}` : "PIX NÃO INFORMADO"}</small>
                  </td>
                  <td data-label="Situação"><StatusBadge status={cost.confirmed ? "CONFIRMADO" : "EM_ABERTO"} /></td>
                  <td data-label="Data">{formatDate(cost.occurredOn)}</td>
                  <td data-label="Valor"><strong>{formatMoney(cost.amountCents)}</strong></td>
                  <td data-label="Ações">
                    {canManageOperationCosts && (
                      <button className="button secondary compact-button" onClick={() => openOperationCost(cost)}>Editar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <header>
          <div><span className="eyebrow">Custos</span><h2>Demais despesas da operação</h2></div>
          <span className={`status-badge ${sale.costsPending ? "status-em_aberto" : "status-pago"}`}>{sale.costsPending ? "CUSTOS EM ABERTO" : "CUSTOS CONFIRMADOS"}</span>
        </header>
        <div className="responsive-table">
          <table>
            <thead><tr><th>Categoria</th><th>Referência</th><th>Data</th><th>Situação</th><th>Valor</th><th><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {regularCosts.length ? regularCosts.map((cost) => (
                <tr key={cost.id}>
                  <td data-label="Categoria"><strong>{costCategoryLabel(cost.category)}</strong></td>
                  <td data-label="Referência">{cost.description ?? "—"}</td>
                  <td data-label="Data">{formatDate(cost.occurredOn)}</td>
                  <td data-label="Situação"><StatusBadge status={cost.confirmed ? "CONFIRMADO" : "EM_ABERTO"} /></td>
                  <td data-label="Valor"><strong>{formatMoney(cost.amountCents)}</strong></td>
                  <td data-label="Ações">
                    {canManageOperationCosts && isEditableOperationCostCategory(cost.category) && (
                      <button className="button secondary compact-button" onClick={() => openOperationCost(cost)}>Editar</button>
                    )}
                  </td>
                </tr>
              )) : <tr><td colSpan={6} className="empty-cell">Nenhuma outra despesa cadastrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel attachments-panel">
        <header>
          <div><span className="eyebrow">Documentos</span><h2>Comprovantes da venda</h2><p>Anexe documentos gerais da operação em PDF, JPG ou PNG.</p></div>
          {canAttach && <button className="button secondary" onClick={() => { setError(null); setAttachmentOpen(true); }}><Icons.plus /> Anexar comprovante</button>}
        </header>
        {sale.attachments.length ? (
          <div className="attachment-list">
            {sale.attachments.map((attachment) => (
              <article key={attachment.id} className="attachment-row">
                <div className="file-icon"><Icons.receipt /></div>
                <div><strong>{attachment.fileName}</strong><span>{attachment.description ?? "SEM DESCRIÇÃO"}</span><small>{formatFileSize(attachment.sizeBytes)} · {attachment.uploadedByName ?? "USUÁRIO"} · {formatDate(attachment.uploadedAt)}</small></div>
                <a className="button secondary compact-button" href={`/api/sales/${sale.id}/attachments/${attachment.id}`} target="_blank" rel="noreferrer">Abrir</a>
              </article>
            ))}
          </div>
        ) : <p className="empty-inline">Nenhum comprovante anexado à venda.</p>}
      </section>

      <section className="panel receivables-panel">
        <header>
          <div><span className="eyebrow">Financeiro</span><h2>Recebimentos</h2></div>
          {canManagePayments && <button className="button primary" onClick={() => { setError(null); setPaymentOpen(true); }}><Icons.plus /> Novo recebimento</button>}
        </header>
        <div className="receivable-summary">
          <div><span>Valor previsto</span><strong>{formatMoney(sale.freightAmountCents)}</strong></div>
          <div><span>Total recebido</span><strong className="positive">{formatMoney(sale.financial.totalReceivedCents)}</strong></div>
          <div><span>Em aberto</span><strong>{formatMoney(sale.financial.balanceCents)}</strong></div>
          {sale.financial.customerCreditCents > 0 && <div><span>Crédito do cliente</span><strong>{formatMoney(sale.financial.customerCreditCents)}</strong></div>}
        </div>
        <div className="responsive-table">
          <table>
            <thead><tr><th>Data</th><th>Tipo</th><th>Forma</th><th>Situação</th><th>Observação</th><th>Valor</th><th><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {sale.payments.length ? sale.payments.map((payment) => (
                <tr key={payment.id}>
                  <td data-label="Data">{formatDate(payment.occurredAt)}</td>
                  <td data-label="Tipo">{payment.type}</td>
                  <td data-label="Forma">{payment.paymentMethod}</td>
                  <td data-label="Situação"><StatusBadge status={payment.status} /></td>
                  <td data-label="Observação">{payment.notes ?? "—"}{payment.proofName && <> · <a href={`/api/payments/${payment.id}/proof`} target="_blank" rel="noreferrer">Comprovante</a></>}</td>
                  <td data-label="Valor" className={payment.type === "ESTORNO" ? "negative" : "positive"}><strong>{payment.type === "ESTORNO" ? "− " : ""}{formatMoney(payment.amountCents)}</strong></td>
                  <td data-label="Ações">{canManagePayments && payment.canReverse && <button className="text-button danger" onClick={() => reversePayment(payment.id)}>Estornar</button>}</td>
                </tr>
              )) : <tr><td colSpan={7} className="empty-cell">Nenhum recebimento registrado.</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="receivable-equation">
          <span>Total a receber <strong>{formatMoney(sale.freightAmountCents)}</strong></span><b>−</b>
          <span>Total recebido <strong className="positive">{formatMoney(sale.financial.totalReceivedCents)}</strong></span><b>=</b>
          <span>Total em aberto <strong>{formatMoney(sale.financial.balanceCents)}</strong></span>
        </footer>
      </section>

      <Modal open={paymentOpen} onClose={() => setPaymentOpen(false)} title="Registrar recebimento" description="Somente lançamentos confirmados afetam o caixa e o saldo.">
        <form className="modal-body form-stack" onSubmit={registerPayment}>
          <input type="hidden" name="type" value="RECEBIMENTO" />
          <div className="form-grid two">
            <Field label="Situação"><select name="status" defaultValue="CONFIRMADO"><option value="CONFIRMADO">Confirmado</option><option value="PENDENTE">Pendente</option></select></Field>
            <Field label="Valor"><input name="amount" inputMode="decimal" placeholder="0,00" required /></Field>
            <Field label="Data"><input name="occurredAt" type="date" defaultValue={todaySaoPaulo()} required /></Field>
            <Field label="Forma de pagamento"><select name="paymentMethod" defaultValue="PIX"><option value="BOLETO">Boleto</option><option value="DINHEIRO">Dinheiro</option><option value="CREDITO">Crédito</option><option value="DEBITO">Débito</option><option value="PIX">PIX</option><option value="FATURADO">Faturado</option></select></Field>
          </div>
          <Field label="Observação"><textarea name="notes" rows={3} /></Field>
          <Field label="Comprovante do recebimento (opcional)" hint="PDF, JPG ou PNG; máximo 10 MB."><input name="proof" type="file" accept="application/pdf,image/jpeg,image/png" /></Field>
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer className="modal-actions"><button type="button" className="button secondary" onClick={() => setPaymentOpen(false)}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? "Registrando…" : "Registrar"}</button></footer>
        </form>
      </Modal>

      <Modal open={operationCost !== null} onClose={() => setOperationCost(null)} title={operationCost ? costCategoryLabel(operationCost.category) : "Editar custo"} description="Atualize os dados e escolha entre confirmado ou em aberto.">
        {operationCost && (
          <form key={operationCost.id} className="modal-body form-stack" onSubmit={saveOperationCost}>
            <Field label="Referência"><input name="description" defaultValue={operationCost.description ?? ""} /></Field>
            {isEditableOperationCostCategory(operationCost.category) && (
              <Field label="Dados PIX" hint="Informe a chave PIX, o tipo da chave e o titular para o pagamento da coleta ou entrega.">
                <textarea name="pixDetails" rows={3} defaultValue={operationCost.pixDetails ?? ""} placeholder="Ex.: CHAVE: 11 99999-9999 · TIPO: TELEFONE · TITULAR: EMPRESA" />
              </Field>
            )}
            <div className="form-grid two">
              <Field label="Valor"><div className="money-field"><span>R$</span><input name="amount" inputMode="decimal" defaultValue={centsToInput(operationCost.amountCents)} placeholder="0,00" required /></div></Field>
              <Field label="Data"><input name="occurredOn" type="date" defaultValue={operationCost.occurredOn ?? ""} /></Field>
              <Field label="Situação"><select value={operationCostStatus} onChange={(event) => setOperationCostStatus(event.target.value as "EM_ABERTO" | "CONFIRMADO")}><option value="EM_ABERTO">Em aberto</option><option value="CONFIRMADO">Confirmado</option></select></Field>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <footer className="modal-actions"><button type="button" className="button secondary" onClick={() => setOperationCost(null)}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? "Salvando…" : "Salvar custo"}</button></footer>
          </form>
        )}
      </Modal>

      <Modal open={providerSlot !== null} onClose={() => setProviderSlot(null)} title={`Prestador ${providerSlot ?? ""}`} description="Edite o valor e mantenha em aberto até o Financeiro confirmar o pagamento.">
        <form key={`${providerSlot}-${selectedProviderCost?.id ?? "new"}`} className="modal-body form-stack" onSubmit={saveProviderCost}>
          <Field label="Nome / referência do prestador"><input name="providerName" defaultValue={selectedProviderCost?.providerName ?? (providerSlot === 1 ? sale.initialProviderName ?? "" : "")} required /></Field>
          <Field label="Dados PIX" hint="Informe a chave PIX, o tipo da chave e o titular para facilitar o pagamento."><textarea name="pixDetails" rows={3} defaultValue={selectedProviderCost?.pixDetails ?? ""} placeholder="Ex.: CPF 123.456.789-00 · TITULAR: NOME DO PRESTADOR" /></Field>
          <Field label="Valor"><div className="money-field"><span>R$</span><input name="amount" inputMode="decimal" defaultValue={selectedProviderCost ? centsToInput(selectedProviderCost.amountCents) : ""} placeholder="0,00" required /></div></Field>
          <Field label="Situação financeira"><select value={providerStatus} onChange={(event) => setProviderStatus(event.target.value as "EM_ABERTO" | "PAGO")}><option value="EM_ABERTO">Em aberto</option><option value="PAGO">Pago</option></select></Field>
          {providerStatus === "PAGO" && <Field label="Data do pagamento"><input name="paidAt" type="date" defaultValue={selectedProviderCost?.paidAt?.slice(0, 10) ?? todaySaoPaulo()} required /></Field>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer className="modal-actions"><button type="button" className="button secondary" onClick={() => setProviderSlot(null)}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? "Salvando…" : "Salvar prestador"}</button></footer>
        </form>
      </Modal>

      <Modal open={attachmentOpen} onClose={() => setAttachmentOpen(false)} title="Anexar comprovante" description="O arquivo ficará vinculado à venda e disponível para consulta.">
        <form className="modal-body form-stack" onSubmit={uploadAttachment}>
          <Field label="Arquivo" hint="PDF, JPG ou PNG; máximo 10 MB."><input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required /></Field>
          <Field label="Descrição"><textarea name="description" rows={3} placeholder="Ex.: comprovante da coleta, recibo do pátio…" /></Field>
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer className="modal-actions"><button type="button" className="button secondary" onClick={() => setAttachmentOpen(false)}>Cancelar</button><button className="button primary" disabled={saving}>{saving ? "Anexando…" : "Anexar"}</button></footer>
        </form>
      </Modal>
    </>
  );
}
