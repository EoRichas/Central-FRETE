"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { SaleRecord } from "@/lib/contracts";
import { OPERATIONAL_STATUS_OPTIONS } from "@/lib/domain/operations";
import { formatDate, formatMoney } from "@/lib/format";
import { Icons } from "@/components/icons";
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/ui";
import { useApi } from "@/components/use-api";

export function SalesScreen({
  initialCompetency,
  initialFinancialStatus,
}: {
  initialCompetency: string;
  initialFinancialStatus: string;
}) {
  const [competency, setCompetency] = useState(initialCompetency);
  const [query, setQuery] = useState("");
  const [financialStatus, setFinancialStatus] = useState(initialFinancialStatus);
  const [operationalStatus, setOperationalStatus] = useState("");
  const [sort, setSort] = useState("date-desc");
  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (competency) params.set("competency", competency);
    if (query) params.set("q", query);
    if (financialStatus) params.set("financialStatus", financialStatus);
    if (operationalStatus) params.set("operationalStatus", operationalStatus);
    return `/api/sales?${params}`;
  }, [competency, query, financialStatus, operationalStatus]);
  const { data, loading, error, refresh } = useApi<{ sales: SaleRecord[]; count: number }>(url);
  const sales = useMemo(() => {
    const values = [...(data?.sales ?? [])];
    return values.sort((a, b) => {
      if (sort === "value-desc") return b.freightAmountCents - a.freightAmountCents;
      if (sort === "value-asc") return a.freightAmountCents - b.freightAmountCents;
      if (sort === "date-asc") return a.saleDate.localeCompare(b.saleDate);
      return b.saleDate.localeCompare(a.saleDate);
    });
  }, [data, sort]);
  const totalFreight = sales.reduce((sum, sale) => sum + sale.freightAmountCents, 0);
  const totalBalance = sales.reduce((sum, sale) => sum + sale.financial.balanceCents, 0);

  return (
    <>
      <PageHeader eyebrow="Operação" title="Vendas e fretes" description="Consulte o ciclo operacional e a cobrança de cada frete em uma única visão." actions={<><a className="button secondary" href={`/api/exports/sales.csv?competency=${competency}`}><Icons.receipt /> Exportar Excel</a><Link className="button primary" href="/vendas/nova"><Icons.plus /> Nova venda</Link></>} />
      <section className="filter-panel">
        <label><span>Pesquisar</span><div className="search-input"><Icons.search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Venda, cliente, placa, origem…" /></div></label>
        <label><span>Competência</span><input type="month" value={competency} onChange={(event) => setCompetency(event.target.value)} /></label>
        <label><span>Status financeiro</span><select value={financialStatus} onChange={(event) => setFinancialStatus(event.target.value)}><option value="">Todos</option><option value="EM_ABERTO">Em aberto</option><option value="PAGO">Pago</option><option value="VENCIDO">Vencido</option></select></label>
        <label><span>Status operacional</span><select value={operationalStatus} onChange={(event) => setOperationalStatus(event.target.value)}><option value="">Todos</option>{OPERATIONAL_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label><span>Ordenar</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="date-desc">Mais recentes</option><option value="date-asc">Mais antigas</option><option value="value-desc">Maior valor</option><option value="value-asc">Menor valor</option></select></label>
      </section>
      {loading && <LoadingState label="Consultando vendas…" />}
      {error && <ErrorState message={error} retry={refresh} />}
      {!loading && !error && sales.length === 0 && <EmptyState title="Nenhuma venda encontrada" description="Ajuste os filtros ou cadastre a primeira venda." href="/vendas/nova" action="Nova venda" />}
      {sales.length > 0 && (
        <section className="panel table-panel">
          <div className="table-summary"><div><strong>{sales.length}</strong><span>registros filtrados</span></div><div><strong>{formatMoney(totalFreight)}</strong><span>valor dos fretes</span></div><div><strong>{formatMoney(totalBalance)}</strong><span>saldo em haver</span></div></div>
          <div className="responsive-table"><table><thead><tr><th>Venda</th><th>Cliente / rota</th><th>Operação</th><th>Vencimento</th><th>Frete</th><th>Recebido</th><th>Saldo</th><th>Situação</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{sales.map((sale) => <tr key={sale.id}><td data-label="Venda"><strong>{sale.saleNumber}</strong><small>{formatDate(sale.saleDate)} · {sale.sellerName}</small></td><td data-label="Cliente / rota"><strong>{sale.clientName ?? "CLIENTE NÃO INFORMADO"}</strong><small>{sale.origin} → {sale.destination}</small></td><td data-label="Operação"><StatusBadge status={sale.operationalStatus} /></td><td data-label="Vencimento">{formatDate(sale.financialDueDate)}</td><td data-label="Frete"><strong>{formatMoney(sale.freightAmountCents)}</strong></td><td data-label="Recebido" className="positive">{formatMoney(sale.financial.totalReceivedCents)}</td><td data-label="Saldo"><strong>{formatMoney(sale.financial.balanceCents)}</strong></td><td data-label="Situação"><StatusBadge status={sale.financial.status} partial={sale.financial.isPartial} /></td><td><Link className="table-action" href={`/vendas/${sale.id}`} aria-label={`Abrir venda ${sale.saleNumber}`}><Icons.chevron /></Link></td></tr>)}</tbody></table></div>
        </section>
      )}
    </>
  );
}
