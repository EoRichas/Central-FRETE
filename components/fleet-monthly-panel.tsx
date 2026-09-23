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
    <header className="fleet-panel-header"><div><h2>Composição do resultado</h2><p>{competencyLabel(competency)} · {closed ? "Fechamento preservado" : "Apuração atual"} por faturamento; custos históricos compartilhados pela data da viagem.</p>
      {totals.pendingFuelCount > 0 && <p className="form-error" role="status">Resultado parcial: {totals.pendingFuelCount} frete(s) sem combustível realizado.</p>}
      {source.unbilledCount > 0 && <p role="status">{source.unbilledCount} frete(s) sem faturamento ainda não integra(m) esta apuração.</p>}
    </div></header>
    <div className="responsive-table"><table><thead><tr><th>Composição</th><th>Valor</th></tr></thead><tbody>
      {([['Fretes faturados da Frota',totals.fleetRevenueCents],['Outras receitas',totals.otherRevenueCents],['Comissões e despesas diretas dos fretes',-totals.directCostCents],['Combustível, pedágio e outros custos de viagem',-totals.transportCostCents],['Outros custos variáveis',-totals.otherVariableCents],['Custos fixos',-totals.fixedCostCents],['Resultado mensal',totals.resultCents]] as const).map(([label,value],index) => <tr key={label}><td data-label="Composição">{index === 6 ? <strong>{label}</strong> : label}</td><td data-label="Valor">{index === 6 ? <strong>{formatMoney(value)}</strong> : formatMoney(value)}</td></tr>)}
    </tbody></table></div>
  </section>;
}
