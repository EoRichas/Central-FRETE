"use client";


import { useState } from "react";
import type { ReportSale } from "@/lib/domain/reports";
import type { SalesReport } from "@/lib/domain/reports";
import { PdfDownloadButton } from "@/components/pdf-download-button";
import {
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
  const [draft,setDraft]=useState({from:'',to:'',saleChannel:'',seller:''});
  const [filters,setFilters]=useState(draft);
  const [page,setPage]=useState(0);
  const query=new URLSearchParams(Object.entries(filters).filter(([,value])=>Boolean(value))).toString();
  const api=useApi<{report:SalesReport;showCommission:boolean;sellers:{id:string;name:string}[]}>(`/api/reports/sales?${query}`);
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
        description="Todas as vendas da Frota e da Cegonha, com resultado e comissões por vendedor."
        actions={
          <>
            <a
              className="button secondary"
              href={`/api/reports/sales?${query}&format=csv`}
            >
              <Icons.receipt /> Exportar CSV
            </a>
            <PdfDownloadButton url={`/api/reports/sales?${query}&format=pdf`} filename="Relatorio-Vendas-Central.pdf" />
          </>
        }
      />
      <form className="filter-panel report-filters no-print" onSubmit={event=>{event.preventDefault();setFilters({...draft});setPage(0);}}>
        <label><span>De</span><input type="date" value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})} /></label>
        <label><span>Até</span><input type="date" min={draft.from || undefined} value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})} /></label>
        <label><span>Canal</span><select value={draft.saleChannel} onChange={e=>setDraft({...draft,saleChannel:e.target.value,seller:''})}><option value="">Frota e Cegonha</option><option value="FROTA">Frota</option><option value="CEGONHA">Cegonha</option></select></label>
        <label><span>Vendedor</span><select value={draft.seller} onChange={e=>setDraft({...draft,seller:e.target.value})}><option value="">Todos</option>{api.data?.sellers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <button className="button primary" type="submit">Aplicar filtros</button>
        <button className="button secondary" type="button" onClick={()=>{const empty={from:'',to:'',saleChannel:'',seller:''};setDraft(empty);setFilters(empty);setPage(0);}}>Limpar</button>
      </form>
      <p className="report-basis">Sem datas, inclui todo o histórico. Base: data da venda na Cegonha e data de coleta nos fretes da Frota. Exportações seguem os filtros aplicados.</p>
      {api.loading && <LoadingState label="Montando relatórios…" />}
      {api.error && <ErrorState message={api.error} retry={api.refresh} />}
      {!api.loading && !api.error && !sales.length && (
        <EmptyState
          title="Sem dados para o relatório"
          description="Ajuste os filtros ou cadastre uma venda."
        />
      )}
      {!api.loading && !api.error && sales.length > 0 && (
        <div className="report-stack">
          <div className="print-report-heading">
            <span>Central Express</span>
            <h1>Relatório geral de vendas</h1>
          </div>
          {Boolean(api.data?.report.pendingCosts) && <p className="form-error" role="status">Resultado parcial: {api.data?.report.pendingCosts} registro(s) com custos pendentes ou combustível estimado.</p>}
          <section className="kpi-grid report-kpis">
            <article className="kpi-card">
              <span>Receita das vendas</span>
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
            {api.data?.showCommission && <article className="kpi-card"><span>Comissões dos vendedores</span><strong>{formatMoney(api.data.report.commissions)}</strong></article>}
          </section>
          <section className="panel table-panel"><header className="fleet-panel-header"><div><span className="eyebrow">Comparativo</span><h2>Resultado por vendedor</h2><p>{sales.length} vendas selecionadas. Os totais incluem todas as páginas.</p></div></header>
            <div className="responsive-table"><table><thead><tr><th>Vendedor</th><th>Vendas</th><th>Receita</th><th>Custo</th><th>Margem</th>{api.data?.showCommission && <th>Comissão</th>}</tr></thead><tbody>{api.data?.report.sellers.map(s=><tr key={s.id}><td data-label="Vendedor"><strong>{s.name}</strong></td><td data-label="Vendas">{s.sales}</td><td data-label="Receita">{formatMoney(s.freight)}</td><td data-label="Custo">{formatMoney(s.cost)}</td><td data-label="Margem">{formatMoney(s.margin)}</td>{api.data?.showCommission && <td data-label="Comissão">{formatMoney(s.commission??0)}</td>}</tr>)}</tbody></table></div>
          </section>
          <section className="panel">
            <header>
              <div>
                <span className="eyebrow">Carteira</span>
                <h2>Detalhamento de cada venda</h2>
                <p>Frota e Cegonha na mesma relação, sem repetir vendas Frota vinculadas aos fretes.</p>
              </div>
            </header>
            <PortfolioSalesTable sales={sales.slice(page*100,(page+1)*100)} showCommission={api.data?.showCommission ?? false} />
          </section>
          {sales.length>100 && <nav className="table-summary" aria-label="Páginas do relatório"><button className="button secondary" disabled={page===0} onClick={()=>setPage(page-1)}>Anterior</button><span>Página {page+1} de {Math.ceil(sales.length/100)}</span><button className="button secondary" disabled={(page+1)*100>=sales.length} onClick={()=>setPage(page+1)}>Próxima</button></nav>}
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

function PortfolioSalesTable({ sales,showCommission }: { sales: ReportSale[];showCommission:boolean }) {
  return (
    <div className="responsive-table">
      <table>
        <thead>
          <tr>
            <th>Venda</th>
            <th>Canal</th>
            <th>Data</th>
            <th>Cliente</th>
            <th>Vendedor(a)</th>
            {showCommission && <><th>Percentual</th><th>Comissão</th></>}
            <th>Receita</th>
            <th>Margem</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((sale) => (
            <tr key={sale.id}>
              <td data-label="Venda"><strong>{sale.saleNumber}</strong></td>
              <td data-label="Canal">{sale.saleChannel === "FROTA" ? "Frota" : "Cegonha"}</td>
              <td data-label="Data">{formatDate(sale.saleDate)}</td>
              <td data-label="Cliente">{sale.clientName ?? "—"}</td>
              <td data-label="Vendedor(a)"><strong>{sale.sellerName}</strong></td>
              {showCommission && <><td data-label="Percentual"><strong>{formatPercent(sale.commissionBasisPoints)}</strong></td>
              <td data-label="Comissão">{formatMoney(sale.financial.commissionCents)}</td></>}
              <td data-label="Receita">{formatMoney(sale.freightAmountCents)}</td>
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
            <th>Receita</th>
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
              <td data-label="Receita">{formatMoney(row.freight)}</td>
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
