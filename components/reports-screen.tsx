"use client";
import { currentCompetency } from "@/lib/domain/dates";

import { useState } from "react";
import type { SaleRecord } from "@/lib/contracts";
import type { SalesReport } from "@/lib/domain/reports";
import { PdfDownloadButton } from "@/components/pdf-download-button";
import {
  competencyLabel,
  formatDate,
  formatMoney,
  formatPercent,
} from "@/lib/format";
import { Icons } from "@/components/icons";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/ui";
import { useApi } from "@/components/use-api";

type GroupRow = SalesReport['clients'][number];

export function ReportsScreen() {
  const [competency, setCompetency] = useState(currentCompetency);
  const [saleChannel,setSaleChannel] = useState('');
  const query = `competency=${competency}${saleChannel ? `&saleChannel=${saleChannel}` : ''}`;
  const api = useApi<{report: SalesReport}>(`/api/reports/sales?${query}`);
  const sales = api.data?.report.sales ?? [];
  const totals = api.data?.report.totals ?? {freight:0,cost:0,margin:0,marginBps:0};
  const clients = api.data?.report.clients ?? [];
  const expenses = api.data?.report.expenses ?? [];
  const maxExpense = Math.max(1, ...expenses.map((item) => item.value));

  return (
    <>
      <PageHeader
        eyebrow="Análise gerencial"
        title="Relatórios"
        description="Faturamento, comissão, custo e margem reconciliados pelos mesmos registros do dashboard."
        actions={
          <>
            <a
              className="button secondary"
              href={`/api/exports/sales.csv?${query}`}
            >
              <Icons.receipt /> Exportar Excel
            </a>
            <PdfDownloadButton url={`/api/reports/sales?${query}&format=pdf`} filename={`Relatorio-Central-${saleChannel || 'Todos'}-${competency}.pdf`} />
          </>
        }
      />
      <section className="filter-panel compact no-print">
        <label>
          <span>Competência</span>
          <input
            type="month"
            value={competency}
            onChange={(event) => setCompetency(event.target.value || currentCompetency())}
          />
        </label>
        <label><span>Canal</span><select value={saleChannel} onChange={e=>setSaleChannel(e.target.value)}><option value="">Todos</option><option value="FROTA">Frota</option><option value="CEGONHA">Cegonha</option></select></label>
      </section>
      {api.loading && <LoadingState label="Montando relatórios…" />}
      {api.error && <ErrorState message={api.error} retry={api.refresh} />}
      {!api.loading && !api.error && !sales.length && (
        <EmptyState
          title="Sem dados para o relatório"
          description="Selecione outra competência ou cadastre uma venda."
        />
      )}
      {sales.length > 0 && (
        <div className="report-stack">
          <div className="print-report-heading">
            <span>Central Express</span>
            <h1>Relatório gerencial · {competencyLabel(competency)}</h1>
          </div>
          {Boolean(api.data?.report.pendingCosts) && <p className="form-error" role="status">Resultado parcial: {api.data?.report.pendingCosts} venda(s) com custos pendentes.</p>}
          <section className="kpi-grid report-kpis">
            <article className="kpi-card">
              <span>Faturamento</span>
              <strong>{formatMoney(totals.freight)}</strong>
            </article>
            <article className="kpi-card">
              <span>Custo total</span>
              <strong>{formatMoney(totals.cost)}</strong>
            </article>
            <article className="kpi-card accent">
              <span>Margem sobre faturamento</span>
              <strong>
                {formatMoney(totals.margin)}
                <em>{formatPercent(totals.marginBps)}</em>
              </strong>
            </article>
          </section>
          <section className="panel">
            <header>
              <div>
                <span className="eyebrow">Carteira</span>
                <h2>Detalhamento de cada venda</h2>
                <p>O percentual e o valor da comissão correspondem ao cadastro de cada venda.</p>
              </div>
            </header>
            <PortfolioSalesTable sales={sales} />
          </section>
          <section className="panel">
            <header>
              <div>
                <span className="eyebrow">Consolidado</span>
                <h2>Resultado por cliente</h2>
              </div>
            </header>
            <ClientReportTable rows={clients} />
          </section>
          <section className="panel chart-panel">
            <header>
              <div>
                <span className="eyebrow">Estrutura de custo</span>
                <h2>Despesas por categoria</h2>
              </div>
            </header>
            <div className="expense-bars">
              {expenses.map((expense) => (
                <div key={expense.name}>
                  <div>
                    <span>{expense.name}</span>
                    <strong>{formatMoney(expense.value)}</strong>
                  </div>
                  <div className="bar-track">
                    <span
                      style={{ width: `${(expense.value / maxExpense) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function PortfolioSalesTable({ sales }: { sales: SaleRecord[] }) {
  return (
    <div className="responsive-table">
      <table>
        <thead>
          <tr>
            <th>Venda</th>
            <th>Data</th>
            <th>Cliente</th>
            <th>Vendedor(a)</th>
            <th>Percentual</th>
            <th>Comissão</th>
            <th>Faturamento</th>
            <th>Margem</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((sale) => (
            <tr key={sale.id}>
              <td data-label="Venda"><strong>{sale.saleNumber}</strong></td>
              <td data-label="Data">{formatDate(sale.saleDate)}</td>
              <td data-label="Cliente">{sale.clientName ?? "—"}</td>
              <td data-label="Vendedor(a)"><strong>{sale.sellerName}</strong></td>
              <td data-label="Percentual"><strong>{formatPercent(sale.commissionBasisPoints)}</strong></td>
              <td data-label="Comissão">{formatMoney(sale.financial.commissionCents)}</td>
              <td data-label="Faturamento">{formatMoney(sale.freightAmountCents)}</td>
              <td data-label="Margem">{formatMoney(sale.financial.marginCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClientReportTable({ rows }: { rows: GroupRow[] }) {
  return (
    <div className="responsive-table">
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Vendas</th>
            <th>Faturamento</th>
            <th>Custo</th>
            <th>Margem</th>
            <th>Margem %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td data-label="Nome"><strong>{row.name}</strong></td>
              <td data-label="Vendas">{row.sales}</td>
              <td data-label="Faturamento">{formatMoney(row.freight)}</td>
              <td data-label="Custo">{formatMoney(row.cost)}</td>
              <td data-label="Margem">{formatMoney(row.margin)}</td>
              <td data-label="Margem %"><strong>{formatPercent(row.marginBps)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
