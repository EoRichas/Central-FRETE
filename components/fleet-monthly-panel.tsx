"use client";
import { useApi } from '@/components/use-api';
import { LoadingState, ErrorState } from '@/components/ui';
import { calculateMonthlyResult, type MonthlyReport } from '@/lib/domain/fleet-results';
import { competencyLabel, formatMoney } from '@/lib/format';

export function FleetMonthlyPanel({ competency }: { competency: string }) {
  const api = useApi<MonthlyReport>(`/api/fleet/monthly?competency=${competency}`);
  if (api.loading) return <LoadingState label="Apurando o mês…" />;
  if (api.error) return <ErrorState message={api.error} retry={api.refresh} />;
  if (!api.data) return null;
  // A closed month keeps showing its immutable snapshot; open months use the live source.
  // The closing/history controls remain intentionally outside this simplified screen.
  const closed = api.data.history.find((entry) => !entry.reopenedAt);
  const source = closed?.snapshot ?? api.data.current;
  const totals = calculateMonthlyResult(source);
  return <section className="panel table-panel">
    <header className="fleet-panel-header"><div><h2>Composição do resultado mensal</h2><p>{competencyLabel(competency)} · {closed ? "Fechamento preservado" : "Apuração atual"}. Vendas pela competência da venda; Frota pelo faturamento; custos compartilhados pela data da viagem.</p>
      {source.sales && <p>{totals.salesCount} venda(s) e {source.freights.length} frete(s) da Frota. As receitas dos dois cadastros são somadas automaticamente.</p>}
      {closed && !source.sales && <p role="status">Este fechamento anterior não incluía Vendas/Fretes. Os valores históricos foram preservados; a consolidação vale para novas apurações.</p>}
      {source.entries.some(entry => entry.kind === 'REVENUE' || entry.kind === 'VARIABLE') && source.sales && <p role="status">Confira os lançamentos manuais: receitas e custos das vendas já estão incluídos automaticamente e não devem ser repetidos em outras receitas ou custos variáveis.</p>}
      {totals.pendingFuelCount > 0 && <p className="form-error" role="status">Resultado parcial: {totals.pendingFuelCount} frete(s) sem combustível realizado.</p>}
      {totals.pendingSalesCount > 0 && <p className="form-error" role="status">Resultado parcial: {totals.pendingSalesCount} venda(s) com custos pendentes.</p>}
      {source.unbilledCount > 0 && <p role="status">{source.unbilledCount} frete(s) sem faturamento ainda não integra(m) esta apuração.</p>}
    </div></header>
    <div className="responsive-table"><table><thead><tr><th>Composição</th><th>Valor</th></tr></thead><tbody>
      {([
        ['Receita de Vendas/Fretes',totals.salesRevenueCents],
        ['Fretes faturados da Frota',totals.fleetRevenueCents],
        ['Outras receitas (lançamentos manuais)',totals.otherRevenueCents],
        ['Faturamento consolidado',totals.revenueCents],
        ['Vendas: comissões e demais custos',-totals.salesCostCents],
        ['Frota: comissões e despesas diretas',-totals.directCostCents],
        ['Frota: combustível, pedágio e outros custos de viagem',-totals.transportCostCents],
        ['Outros custos variáveis',-totals.otherVariableCents],
        ['Custos fixos',-totals.fixedCostCents],
        ['Resultado mensal',totals.resultCents],
      ] as const).map(([label,value]) => <tr key={label}><td data-label="Composição">{label === 'Resultado mensal' || label === 'Faturamento consolidado' ? <strong>{label}</strong> : label}</td><td data-label="Valor">{!source.sales && (label === 'Receita de Vendas/Fretes' || label === 'Vendas: comissões e demais custos') ? "Não incluído nesta versão" : label === 'Resultado mensal' || label === 'Faturamento consolidado' ? <strong>{formatMoney(value)}</strong> : formatMoney(value)}</td></tr>)}
    </tbody></table></div>
  </section>;
}
