"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { SalesReport } from "@/lib/domain/reports";
import type { FleetFreight } from "@/lib/domain/fleet";
import { FleetFreightDetail } from "@/components/fleet-freight-detail";
import { Modal } from "@/components/ui";
import { currentCompetency } from "@/lib/domain/dates";
import { costCategoryLabel } from "@/lib/domain/operations";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { Icons } from "@/components/icons";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/ui";
import { useApi } from "@/components/use-api";

export function FinanceScreen() {
  const [competency, setCompetency] = useState(currentCompetency);
  const [channel, setChannel] = useState("");
  const [selectedFreight, setSelectedFreight] = useState<string | null>(null);
  const detail = useApi<{freight:FleetFreight}>(selectedFreight ? `/api/fleet/freights/${selectedFreight}` : null);
  const api = useApi<{ report: SalesReport; showCommission: boolean }>(`/api/reports/sales?competency=${competency}&saleChannel=${channel}`);
  const showCommission = Boolean(api.data?.showCommission);
  const sales = useMemo(() => api.data?.report.sales ?? [], [api.data]);
  const totals = useMemo(
    () =>
      sales.reduce(
        (acc, sale) => {
          acc.freight += sale.freightAmountCents;
          acc.costs += sale.financial.transportCostCents;
          acc.commissions += sale.financial.commissionCents ?? 0;
          return acc;
        },
        { freight: 0, costs: 0, commissions: 0 },
      ),
    [sales],
  );

  return (
    <>
      <PageHeader
        eyebrow="Custos das vendas"
        title="Financeiro"
        description="Vendas Cegonha e fretes da Frota, pela data da venda ou da coleta, sem duplicar vínculos."
      />
      <section className="filter-panel compact">
        <label>
          <span>Competência</span>
          <input
            type="month"
            value={competency}
            onChange={(event) => setCompetency(event.target.value || currentCompetency())}
          />
        </label>
        <label><span>Canal</span><select value={channel} onChange={e=>setChannel(e.target.value)}><option value="">Frota e Cegonha</option><option value="FROTA">Frota</option><option value="CEGONHA">Cegonha</option></select></label>
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
          {api.data?.report.pendingCosts ? <p className="fleet-update-note">{api.data.report.pendingCosts} venda(s) com custos pendentes ou combustível estimado.</p> : null}
          <section className="receivable-summary large finance-three-metrics">
            <div>
              <span>Valor total dos fretes</span>
              <strong>{formatMoney(totals.freight)}</strong>
            </div>
            {showCommission && <div>
              <span>Comissões dos vendedores</span>
              <strong>{formatMoney(totals.commissions)}</strong>
            </div>}
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
                    <th>Canal</th><th>Data</th>
                    <th>Vendedor(a)</th>
                    <th>Rota</th>
                    <th>Valor do frete</th>
                    {showCommission && <th>Comissão</th>}
                    <th>Custos da venda</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => {
                    const details = sale.costs
                      .map(
                        (cost) =>
                          `${costCategoryLabel(cost.category)} ${formatMoney(cost.amountCents)}`,
                      )
                      .join(" · ") || "SEM OUTRAS DESPESAS";
                    return (
                      <tr key={sale.id}>
                        <td data-label="Venda">
                          <strong>{sale.saleNumber}</strong>
                          <small>{sale.clientName ?? "CLIENTE NÃO INFORMADO"}</small>
                        </td>
                        <td data-label="Canal">{sale.saleChannel === "FROTA" ? "Frota" : "Cegonha"}</td><td data-label="Data">{formatDate(sale.saleDate)}</td>
                        <td data-label="Vendedor(a)"><strong>{sale.sellerName}</strong></td>
                        <td data-label="Rota">{sale.origin} → {sale.destination}</td>
                        <td data-label="Valor do frete"><strong>{formatMoney(sale.freightAmountCents)}</strong></td>
                        {showCommission && <td data-label="Comissão">
                          <strong>{formatMoney(sale.financial.commissionCents)}</strong>
                          <small>{formatPercent(sale.commissionBasisPoints)} DA VENDA</small>
                        </td>}
                        <td data-label="Custos da venda">
                          <strong>{formatMoney(sale.financial.transportCostCents)}</strong>
                          <small title={details}>{details}</small>
                        </td>
                        <td>{sale.id.startsWith("freight:") ? <button className="table-action" onClick={()=>setSelectedFreight(sale.id.slice(8))} aria-label={`Abrir frete ${sale.saleNumber}`}><Icons.chevron /></button> : <Link className="table-action" href={`/vendas/${sale.id}`} aria-label={`Abrir venda ${sale.saleNumber}`}><Icons.chevron /></Link>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      <Modal open={Boolean(selectedFreight)} onClose={()=>setSelectedFreight(null)} title="Detalhes do frete" wide><div className="modal-body">{detail.loading && <LoadingState label="Carregando frete…"/>}{detail.error && <ErrorState message={detail.error} retry={detail.refresh}/>} {!detail.loading && !detail.error && detail.data && <FleetFreightDetail freight={detail.data.freight}/>}</div></Modal>
    </>
  );
}
