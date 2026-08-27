"use client";

import { useMemo, useState } from "react";
import type { SaleRecord } from "@/lib/contracts";
import { weightedMarginBasisPoints } from "@/lib/domain/finance";
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

type GroupRow = {
  name: string;
  sales: number;
  freight: number;
  cost: number;
  margin: number;
  marginBps: number;
};

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

function groupSales(
  sales: SaleRecord[],
  key: (sale: SaleRecord) => string,
): GroupRow[] {
  const map = new Map<string, SaleRecord[]>();
  for (const sale of sales) {
    const name = key(sale);
    map.set(name, [...(map.get(name) ?? []), sale]);
  }
  return [...map.entries()]
    .map(([name, items]) => ({
      name,
      sales: items.length,
      freight: items.reduce((sum, sale) => sum + sale.freightAmountCents, 0),
      cost: items.reduce(
        (sum, sale) => sum + sale.financial.transportCostCents,
        0,
      ),
      margin: items.reduce(
        (sum, sale) => sum + sale.financial.marginCents,
        0,
      ),
      marginBps: weightedMarginBasisPoints(
        items.map((sale) => ({
          freightAmountCents: sale.freightAmountCents,
          marginCents: sale.financial.marginCents,
        })),
      ),
    }))
    .sort((left, right) => right.freight - left.freight);
}

function saleNumberAscending(left: SaleRecord, right: SaleRecord) {
  return left.saleNumber.localeCompare(right.saleNumber, "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

export function ReportsScreen() {
  const [competency, setCompetency] = useState(currentCompetency);
  const api = useApi<{ sales: SaleRecord[] }>(
    `/api/sales?competency=${competency}`,
  );
  const sales = useMemo(
    () => [...(api.data?.sales ?? [])].sort(saleNumberAscending),
    [api.data],
  );
  const totals = useMemo(() => {
    const freight = sales.reduce(
      (sum, sale) => sum + sale.freightAmountCents,
      0,
    );
    const cost = sales.reduce(
      (sum, sale) => sum + sale.financial.transportCostCents,
      0,
    );
    const margin = sales.reduce(
      (sum, sale) => sum + sale.financial.marginCents,
      0,
    );
    return {
      freight,
      cost,
      margin,
      marginBps: weightedMarginBasisPoints(
        sales.map((sale) => ({
          freightAmountCents: sale.freightAmountCents,
          marginCents: sale.financial.marginCents,
        })),
      ),
    };
  }, [sales]);
  const clients = useMemo(
    () =>
      groupSales(
        sales,
        (sale) => sale.clientName ?? "CLIENTE NÃO INFORMADO",
      ),
    [sales],
  );
  const expenses = useMemo(() => {
    const map = new Map<string, number>();
    sales
      .flatMap((sale) => sale.costs)
      .forEach((cost) =>
        map.set(cost.category, (map.get(cost.category) ?? 0) + cost.amountCents),
      );
    return [...map.entries()]
      .map(([name, value]) => ({ name: name.replace(/_/g, " "), value }))
      .sort((left, right) => right.value - left.value);
  }, [sales]);
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
              href={`/api/exports/sales.csv?competency=${competency}`}
            >
              <Icons.receipt /> Exportar Excel
            </a>
            <button className="button primary" onClick={() => window.print()}>
              Salvar em PDF
            </button>
          </>
        }
      />
      <section className="filter-panel compact no-print">
        <label>
          <span>Competência</span>
          <input
            type="month"
            value={competency}
            onChange={(event) => setCompetency(event.target.value)}
          />
        </label>
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
