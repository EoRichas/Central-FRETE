"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DashboardData } from "@/lib/contracts";
import { competencyLabel, formatMoney, formatPercent } from "@/lib/format";
import { ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/ui";
import { Icons } from "@/components/icons";
import { sellerCommissionCents } from "@/lib/domain/commissions";
import { useApi } from "@/components/use-api";

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

const statusMeta = {
  EM_ABERTO: { label: "Em aberto", className: "open" },
  PAGO: { label: "Pago", className: "paid" },
  VENCIDO: { label: "Vencido", className: "overdue" },
} as const;

export function DashboardScreen() {
  const [competency, setCompetency] = useState(currentCompetency);
  const { data, loading, error, refresh } = useApi<{ data: DashboardData }>(
    `/api/dashboard?competency=${competency}`,
  );
  const dashboard = data?.data;
  const maxSeller = useMemo(
    () => Math.max(1, ...(dashboard?.bySeller.map((item) => item.freightAmountCents) ?? [1])),
    [dashboard],
  );

  return (
    <>
      <PageHeader
        eyebrow="Visão geral"
        title="Início"
        description="Acompanhe faturamento, recebimentos e comissões sem misturar operação e financeiro."
        actions={<label className="compact-filter"><span>Competência</span><input type="month" value={competency} onChange={(event) => setCompetency(event.target.value)} /></label>}
      />
      {loading && <LoadingState label="Calculando os indicadores…" />}
      {error && <ErrorState message={error} retry={refresh} />}
      {dashboard && (
        <div className="dashboard-stack">
          {dashboard.salesCount === 0 && (
            <div className="onboarding-banner"><div><span className="eyebrow">Primeiro uso</span><h2>Cadastre a primeira venda</h2><p>A competência {competencyLabel(competency)} ainda não possui vendas.</p></div><Link className="button primary" href="/vendas/nova">Nova venda</Link></div>
          )}
          <section className="status-grid" aria-label="Situação financeira">
            {(Object.keys(statusMeta) as Array<keyof typeof statusMeta>).map((status) => {
              const meta = statusMeta[status];
              const item = dashboard.statuses[status];
              return <Link key={status} href={`/vendas?competency=${competency}&financialStatus=${status}`} className={`status-card ${meta.className}`}><span>{meta.label}</span><strong>{item.count}</strong><small>{formatMoney(item.amountCents)}</small><Icons.chevron /></Link>;
            })}
          </section>
          <section className="kpi-grid dashboard-kpis">
            <article className="kpi-card"><span>Faturamento</span><strong>{formatMoney(dashboard.freightAmountCents)}</strong><small>{dashboard.salesCount} venda{dashboard.salesCount === 1 ? "" : "s"} no mês</small></article>
            <article className="kpi-card"><span>Recebido no período</span><strong>{formatMoney(dashboard.receivedInPeriodCents)}</strong><small>Caixa pela data do recebimento</small></article>
            <article className="kpi-card"><span>Saldo em haver</span><strong>{formatMoney(dashboard.totalBalanceCents)}</strong><small>Após pagamentos confirmados</small></article>
            <article className="kpi-card"><span>Custo de transporte</span><strong>{formatMoney(dashboard.transportCostCents)}</strong><small>Comissão + despesas</small></article>
            <article className="kpi-card accent"><span>Margem da empresa no mês</span><strong>{formatMoney(dashboard.marginCents)} <em>{formatPercent(dashboard.marginBasisPoints)}</em></strong><small>{dashboard.marginIsProvisional ? "PROVISÓRIA · há custos pendentes" : "FINAL · custos confirmados"}</small></article>
          </section>
          <section className="dashboard-columns">
            <article className="panel chart-panel"><header><div><span className="eyebrow">Desempenho comercial</span><h2>Resultado por vendedor</h2></div><span className="panel-period">{competencyLabel(competency)}</span></header>{dashboard.bySeller.length ? <div className="seller-bars">{dashboard.bySeller.map((seller) => <div className="seller-row" key={seller.name}><div><strong>{seller.name}</strong></div><div className="bar-track"><span style={{ width: `${Math.max(6, (seller.freightAmountCents / maxSeller) * 100)}%` }} /></div><b>{formatMoney(seller.freightAmountCents)}</b></div>)}</div> : <p className="panel-empty">Nenhuma venda no período.</p>}</article>
            <article className="panel operational-commission-panel"><header><div><span className="eyebrow">Comissão Setor Operacional</span><h2>3% do faturamento total</h2></div><Link href={`/vendedores?competency=${competency}`}>Ver vendedores</Link></header><div className="operational-commission-value"><span>Comissão no período</span><strong>{formatMoney(dashboard.operationalCommissionCents)}</strong><small>Base de cálculo: {formatMoney(dashboard.freightAmountCents)}</small></div></article>
          </section>
          <section className="panel dashboard-seller-commission-panel">
            <header>
              <div><span className="eyebrow">Vendedores(a) / Comissão</span><h2>Comissão comercial por vendedor</h2></div>
              <Link href={`/vendedores?competency=${competency}`}>Abrir controle</Link>
            </header>
            {dashboard.bySeller.length ? (
              <div className="responsive-table">
                <table>
                  <thead><tr><th>Vendedor(a)</th><th>Total vendido</th><th>Comissão 7%</th></tr></thead>
                  <tbody>
                    {dashboard.bySeller.map((seller) => (
                      <tr key={seller.name}>
                        <td data-label="Vendedor(a)"><strong>{seller.name}</strong></td>
                        <td data-label="Total vendido">{formatMoney(seller.freightAmountCents)}</td>
                        <td data-label="Comissão 7%"><strong>{formatMoney(sellerCommissionCents(seller.freightAmountCents))}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="panel-empty">Nenhuma venda no período.</p>}
          </section>
          <section className="panel cash-summary"><header><div><span className="eyebrow">Reconciliação</span><h2>Recebimentos e saldo</h2></div><StatusBadge status={dashboard.totalBalanceCents > 0 ? "EM_ABERTO" : "PAGO"} /></header><div className="equation-row"><div><span>Valor dos fretes</span><strong>{formatMoney(dashboard.freightAmountCents)}</strong></div><b>−</b><div><span>Total recebido</span><strong className="positive">{formatMoney(dashboard.totalReceivedCents)}</strong></div><b>=</b><div><span>Saldo em haver</span><strong>{formatMoney(dashboard.totalBalanceCents)}</strong></div></div>{dashboard.customerCreditCents > 0 && <p className="credit-note">Crédito de clientes: {formatMoney(dashboard.customerCreditCents)}</p>}</section>
        </div>
      )}
    </>
  );
}
