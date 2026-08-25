"use client";

import { useMemo, useState } from "react";
import type {
  CurrentUser,
  SellerCommissionRecord,
  SellerCommissionStatus,
} from "@/lib/contracts";
import { competencyLabel, formatDate, formatMoney } from "@/lib/format";
import {
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { apiMutation, useApi } from "@/components/use-api";

function currentCompetency() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "08";
  return `${year}-${month}`;
}

function todaySaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function SellersScreen({
  initialCompetency,
}: {
  initialCompetency?: string;
}) {
  const [competency, setCompetency] = useState(() =>
    initialCompetency && /^\d{4}-(0[1-9]|1[0-2])$/.test(initialCompetency)
      ? initialCompetency
      : currentCompetency(),
  );
  const [savingSeller, setSavingSeller] = useState<string | null>(null);
  const [selectedCommission, setSelectedCommission] =
    useState<SellerCommissionRecord | null>(null);
  const [commissionStatus, setCommissionStatus] =
    useState<SellerCommissionStatus>("EM_ABERTO");
  const [commissionPaidAt, setCommissionPaidAt] = useState(todaySaoPaulo);
  const [sellerPixDetails, setSellerPixDetails] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const api = useApi<{
    competency: string;
    commissions: SellerCommissionRecord[];
  }>(`/api/sellers/commissions?competency=${competency}`);
  const meApi = useApi<{ user: CurrentUser }>("/api/me");
  const commissions = useMemo(
    () => api.data?.commissions ?? [],
    [api.data],
  );
  const totals = useMemo(
    () =>
      commissions.reduce(
        (sum, item) => ({
          sales: sum.sales + item.totalSalesCents,
          commission: sum.commission + item.commissionCents,
        }),
        { sales: 0, commission: 0 },
      ),
    [commissions],
  );
  const isAdmin = meApi.data?.user.role === "ADMIN";
  const canManage =
    isAdmin || meApi.data?.user.role === "FINANCEIRO";

  function openCommissionPayment(item: SellerCommissionRecord) {
    setMutationError(null);
    setSelectedCommission(item);
    setCommissionStatus(item.status);
    setCommissionPaidAt(item.paidAt?.slice(0, 10) ?? todaySaoPaulo());
    setSellerPixDetails(item.pixDetails ?? "");
  }

  async function saveCommissionPayment(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!selectedCommission) return;
    setSavingSeller(selectedCommission.sellerName);
    setMutationError(null);
    try {
      await apiMutation("/api/sellers/commissions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sellerName: selectedCommission.sellerName,
          competency,
          status: commissionStatus,
          paidAt: commissionStatus === "PAGO" ? commissionPaidAt : null,
          ...(isAdmin ? { pixDetails: sellerPixDetails } : {}),
        }),
      });
      setSelectedCommission(null);
      api.refresh();
    } catch (error) {
      setMutationError(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar a comissão.",
      );
    } finally {
      setSavingSeller(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Gestão comercial"
        title="Vendedores(a)"
        description="Acompanhe o total vendido e a comissão fixa de 7% de cada vendedor."
        actions={
          <label className="compact-filter">
            <span>Competência</span>
            <input
              type="month"
              value={competency}
              onChange={(event) => setCompetency(event.target.value)}
            />
          </label>
        }
      />
      {mutationError && (
        <p className="form-error" role="alert">{mutationError}</p>
      )}
      {api.loading && <LoadingState label="Calculando as comissões…" />}
      {api.error && <ErrorState message={api.error} retry={api.refresh} />}
      {!api.loading && !api.error && !commissions.length && (
        <EmptyState
          title="Nenhuma venda nesta competência"
          description={`Não há comissão calculada para ${competencyLabel(competency)}.`}
        />
      )}
      {commissions.length > 0 && (
        <div className="seller-commission-stack">
          <section className="kpi-grid seller-commission-kpis">
            <article className="kpi-card">
              <span>Valor total das vendas</span>
              <strong>{formatMoney(totals.sales)}</strong>
              <small>{competencyLabel(competency)}</small>
            </article>
            <article className="kpi-card accent">
              <span>Comissão total dos vendedores</span>
              <strong>{formatMoney(totals.commission)}</strong>
              <small>7% sobre as vendas exibidas</small>
            </article>
          </section>
          <section className="panel table-panel">
            <div className="responsive-table">
              <table>
                <thead>
                  <tr>
                    <th>Vendedor(a)</th>
                    <th>Venda</th>
                    <th>Data</th>
                    <th>Cliente</th>
                    <th>Valor da venda</th>
                    <th>Comissão 7%</th>
                    <th>PIX</th>
                    <th>Situação</th>
                    <th>Data do pagamento</th>
                    <th><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((item) => (
                    <tr key={`${item.sellerName}-${item.saleId ?? item.saleNumber ?? item.saleDate}`}>
                      <td data-label="Vendedor(a)"><strong>{item.sellerName}</strong></td>
                      <td data-label="Venda"><strong>{item.saleNumber ?? "—"}</strong></td>
                      <td data-label="Data">{item.saleDate ? formatDate(item.saleDate) : "—"}</td>
                      <td data-label="Cliente">{item.clientName ?? "—"}</td>
                      <td data-label="Valor da venda"><strong>{formatMoney(item.totalSalesCents)}</strong></td>
                      <td data-label="Comissão 7%"><strong>{formatMoney(item.commissionCents)}</strong></td>
                      <td data-label="PIX">{item.pixDetails ?? "—"}</td>
                      <td data-label="Situação"><StatusBadge status={item.status} /></td>
                      <td data-label="Data do pagamento">
                        <strong>{item.paidAt ? formatDate(item.paidAt) : "—"}</strong>
                        {item.paidByName && <small>BAIXADO POR {item.paidByName}</small>}
                      </td>
                      <td data-label="Ações">
                        {canManage ? (
                          <button
                            type="button"
                            className="button secondary compact-button"
                            disabled={savingSeller === item.sellerName}
                            onClick={() => openCommissionPayment(item)}
                          >
                            Editar pagamento
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
      <Modal
        open={selectedCommission !== null}
        onClose={() => setSelectedCommission(null)}
        title="Pagamento da comissão"
        description={selectedCommission ? `${selectedCommission.sellerName} · ${competencyLabel(competency)}` : undefined}
      >
        <form className="modal-body form-stack" onSubmit={saveCommissionPayment}>
          {selectedCommission && (
            <Field
              label="Dados do PIX"
              hint={
                isAdmin
                  ? "Você pode cadastrar ou corrigir o PIX aqui. O dado fica salvo para este vendedor."
                  : "PIX cadastrado pelo ADMIN para pagamento da comissão."
              }
            >
              <textarea
                rows={2}
                value={sellerPixDetails}
                onChange={(event) => setSellerPixDetails(event.target.value)}
                placeholder={
                  isAdmin
                    ? "Ex.: chave PIX, tipo da chave e titular"
                    : "PIX não informado"
                }
                readOnly={!isAdmin}
              />
            </Field>
          )}
          <Field label="Situação">
            <select
              value={commissionStatus}
              onChange={(event) => setCommissionStatus(event.target.value as SellerCommissionStatus)}
            >
              <option value="EM_ABERTO">Em aberto</option>
              <option value="PAGO">Pago</option>
            </select>
          </Field>
          {commissionStatus === "PAGO" && (
            <Field label="Data do pagamento">
              <input
                type="date"
                value={commissionPaidAt}
                onChange={(event) => setCommissionPaidAt(event.target.value)}
                required
              />
            </Field>
          )}
          {mutationError && <p className="form-error" role="alert">{mutationError}</p>}
          <footer className="modal-actions">
            <button type="button" className="button secondary" onClick={() => setSelectedCommission(null)}>Cancelar</button>
            <button className="button primary" disabled={savingSeller !== null}>{savingSeller ? "Salvando…" : "Salvar pagamento"}</button>
          </footer>
        </form>
      </Modal>
    </>
  );
}
