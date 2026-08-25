"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { SaleRecord } from "@/lib/contracts";
import { costCategoryLabel } from "@/lib/domain/operations";
import { formatDate, formatMoney } from "@/lib/format";
import { Icons } from "@/components/icons";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/ui";
import { useApi } from "@/components/use-api";

export function FinanceScreen() {
  const [competency, setCompetency] = useState("");
  const url = `/api/sales?limit=500${
    competency ? `&competency=${competency}` : ""
  }`;
  const api = useApi<{ sales: SaleRecord[] }>(url);
  const sales = useMemo(() => api.data?.sales ?? [], [api.data]);
  const totals = useMemo(
    () =>
      sales.reduce(
        (acc, sale) => {
          acc.freight += sale.freightAmountCents;
          acc.costs += sale.financial.transportCostCents;
          return acc;
        },
        { freight: 0, costs: 0 },
      ),
    [sales],
  );

  return (
    <>
      <PageHeader
        eyebrow="Custos das vendas"
        title="Financeiro"
        description="Visão direta do valor do frete e do custo total de cada venda."
      />
      <section className="filter-panel compact">
        <label>
          <span>Competência (opcional)</span>
          <input
            type="month"
            value={competency}
            onChange={(event) => setCompetency(event.target.value)}
          />
        </label>
        <div className="filter-stat">
          <strong>{sales.length}</strong>
          <span>vendas exibidas</span>
        </div>
      </section>

      {api.loading && <LoadingState label="Calculando fretes e custos…" />}
      {api.error && <ErrorState message={api.error} retry={api.refresh} />}
      {!api.loading && !api.error && !sales.length && (
        <EmptyState
          title="Nenhuma venda encontrada"
          description="Não há vendas para a competência selecionada."
        />
      )}
      {sales.length > 0 && (
        <>
          <section className="receivable-summary large finance-two-metrics">
            <div>
              <span>Valor total dos fretes</span>
              <strong>{formatMoney(totals.freight)}</strong>
            </div>
            <div>
              <span>Custo total das vendas</span>
              <strong>{formatMoney(totals.costs)}</strong>
            </div>
          </section>
          <section className="panel table-panel">
            <div className="responsive-table">
              <table>
                <thead>
                  <tr>
                    <th>Venda</th>
                    <th>Data</th>
                    <th>Rota</th>
                    <th>Valor do frete</th>
                    <th>Custos da venda</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => {
                    const details = [
                      `COMISSÃO ${formatMoney(sale.financial.commissionCents)}`,
                      ...sale.costs.map(
                        (cost) =>
                          `${costCategoryLabel(cost.category)} ${formatMoney(cost.amountCents)}`,
                      ),
                    ].join(" · ");
                    return (
                      <tr key={sale.id}>
                        <td data-label="Venda">
                          <strong>{sale.saleNumber}</strong>
                          <small>{sale.clientName ?? "CLIENTE NÃO INFORMADO"}</small>
                        </td>
                        <td data-label="Data">{formatDate(sale.saleDate)}</td>
                        <td data-label="Rota">{sale.origin} → {sale.destination}</td>
                        <td data-label="Valor do frete"><strong>{formatMoney(sale.freightAmountCents)}</strong></td>
                        <td data-label="Custos da venda">
                          <strong>{formatMoney(sale.financial.transportCostCents)}</strong>
                          <small title={details}>{details}</small>
                        </td>
                        <td><Link className="table-action" href={`/vendas/${sale.id}`} aria-label={`Abrir venda ${sale.saleNumber}`}><Icons.chevron /></Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
