"use client";
import { useState } from 'react';
import { useApi } from '@/components/use-api';
import { LoadingState, ErrorState } from '@/components/ui';
import { calculateMonthlyResult, type MonthlyReport } from '@/lib/domain/fleet-results';
import { competencyLabel, formatMoney, formatDate } from '@/lib/format';

export function FleetMonthlyPanel({ competency, onCompetencyChange }: { competency: string; onCompetencyChange: (value: string) => void }) {
  const [selectedVersion, setSelectedVersion] = useState("live");
  const api = useApi<MonthlyReport>(`/api/fleet/monthly?competency=${competency}`);
  if (api.loading) return <LoadingState label="Apurando o mês…" />;
  if (api.error) return <ErrorState message={api.error} retry={api.refresh} />;
  if (!api.data) return null;
  const closed = api.data.history.find((entry) => !entry.reopenedAt);
  const selectedClosing = api.data.history.find(entry => entry.id === selectedVersion);
  const source = selectedClosing?.snapshot ?? api.data.current;
  const periods = [...new Set([competency, ...api.data.periods.map(period => period.competency)])].sort().reverse();
  const totals = calculateMonthlyResult(source);
  return <div className="fleet-stack">
    <section className="filter-panel fleet-monthly-filters">
      <label><span>Meses registrados</span><select value={competency} onChange={event => onCompetencyChange(event.target.value)}>
        {periods.map(month => { const period = api.data!.periods.find(item => item.competency === month); return <option key={month} value={month}>{competencyLabel(month)}{period?.closed ? " · Fechado" : period?.hasVehicleHistory ? " · Histórico cadastrado" : ""}</option>; })}
      </select></label>
      <label><span>Versão da apuração</span><select value={selectedVersion} onChange={event => setSelectedVersion(event.target.value)}>
        <option value="live">Apuração atual{closed ? " (consulta)" : ""}</option>
        {api.data.history.map(entry => <option key={entry.id} value={entry.id}>Fechado em {new Date(entry.closedAt).toLocaleString("pt-BR", {timeZone: "America/Sao_Paulo"})}{entry.reopenedAt ? " · Reaberto" : " · Vigente"}</option>)}
      </select></label>
    </section>
    <section className="panel table-panel">
    <header className="fleet-panel-header"><div><h2>Composição do resultado</h2><p>{competencyLabel(competency)} · {selectedClosing ? "Fechamento preservado" : "Apuração atual"} por faturamento; custos históricos compartilhados pela data da viagem.</p>
      {selectedClosing && <p>Fechado por {selectedClosing.closedByName} em {new Date(selectedClosing.closedAt).toLocaleString("pt-BR", {timeZone: "America/Sao_Paulo"})}.{selectedClosing.reopenedAt && ` Reaberto: ${selectedClosing.reopenReason || "Motivo não informado"}.`}</p>}
      {closed && !selectedClosing && <p>Existe um fechamento salvo. Esta consulta mostra os dados atuais; selecione o fechamento para conferir os valores preservados.</p>}
      {!api.data.history.length && <p>Não há fechamento salvo para este mês.</p>}
      {totals.pendingFuelCount > 0 && <p className="form-error" role="status">Resultado parcial: {totals.pendingFuelCount} frete(s) sem combustível realizado.</p>}
      {totals.pendingSalesCount > 0 && <p className="form-error" role="status">Resultado parcial: {totals.pendingSalesCount} venda(s) com custos pendentes.</p>}
      {source.sales === undefined && selectedClosing && <p>Este fechamento antigo foi preservado e não inclui a consolidação automática de Vendas. Selecione a apuração atual para comparar.</p>}
      {source.sales !== undefined && source.entries.some(e => e.kind !== "FIXED") && <p>Confira os lançamentos manuais para evitar repetir receitas e despesas já importadas de Vendas e Frota.</p>}
      {source.unbilledCount > 0 && <p role="status">{source.unbilledCount} frete(s) sem data de faturamento. {source.dateBasis ? "Incluídos provisoriamente pelo mês da coleta; corrija antes de fechar." : "Não incluídos neste fechamento antigo."}</p>}
    </div></header>
    <div className="responsive-table"><table><thead><tr><th>Composição</th><th>Valor</th></tr></thead><tbody>
      {([['Fretes da Frota',totals.fleetRevenueCents],['Vendas Frota sem vínculo operacional',totals.fleetSalesRevenueCents],['Demais vendas sem vínculo operacional',totals.salesRevenueCents-totals.fleetSalesRevenueCents],['Outras receitas',totals.otherRevenueCents],['Faturamento consolidado',totals.revenueCents],['Custos e comissões de Vendas',-totals.salesCostCents],['Comissões dos motoristas',-totals.driverCommissionCents],['Demais despesas diretas dos fretes',-(totals.directCostCents-totals.driverCommissionCents)],['Combustível, pedágio e outros custos de viagem',-totals.transportCostCents],['Outros custos variáveis',-totals.otherVariableCents],['Custos fixos',-totals.fixedCostCents],['Resultado mensal',totals.resultCents]] as const).map(([label,value]) => <tr key={label}><td data-label="Composição">{label === "Resultado mensal" ? <strong>{label}</strong> : label}</td><td data-label="Valor">{label === "Resultado mensal" ? <strong>{formatMoney(value)}</strong> : formatMoney(value)}</td></tr>)}
    </tbody></table></div>
  </section>
  <section className="panel table-panel">
    <header className="fleet-panel-header"><div><h2>Fretes e vendas incluídos</h2><p>{source.freights.length} fretes da Frota e {source.sales?.length ?? 0} vendas sem vínculo operacional. Cada registro entra uma vez.</p></div></header>
    <div className="responsive-table"><table><thead><tr><th>Venda</th><th>Origem do registro</th><th>Data</th><th>Cliente</th><th>Receita</th><th>Comissão do motorista</th></tr></thead><tbody>
      {source.freights.map(f => <tr key={`freight:${f.id}`}><td>{f.saleNumber || 'Não disponível'}</td><td>Frete Frota</td><td>{formatDate(f.date ?? null)}</td><td>{f.client}</td><td>{formatMoney(f.revenueCents)}</td><td>{f.driverCommissionCents === undefined ? 'Não detalhada neste fechamento' : formatMoney(f.driverCommissionCents)}</td></tr>)}
      {source.sales?.map(s => <tr key={`sale:${s.id}`}><td>{s.saleNumber || 'Não disponível'}</td><td>{s.saleChannel === 'FROTA' ? 'Venda Frota' : s.saleChannel === 'CEGONHA' ? 'Venda Cegonha' : 'Venda'}</td><td>{formatDate(s.date ?? null)}</td><td>{s.client || 'Não informado'}</td><td>{formatMoney(s.revenueCents)}</td><td>Não se aplica</td></tr>)}
      {!source.freights.length && !source.sales?.length && <tr><td colSpan={6}>Nenhum frete ou venda nesta competência.</td></tr>}
    </tbody></table></div>
  </section>
  {api.data.vehicleHistory.length > 0 && <section className="panel table-panel">
    <header className="fleet-panel-header"><div><h2>Histórico mensal dos veículos</h2><p>Valores já cadastrados para {competencyLabel(competency)}. São referências de custo por quilômetro e não são descontados novamente do resultado acima.</p></div></header>
    <div className="responsive-table"><table><thead><tr><th>Veículo</th><th>Quilometragem</th><th>Custo registrado</th><th>Custo por km</th></tr></thead><tbody>
      {api.data.vehicleHistory.map(item => <tr key={item.id}><td data-label="Veículo">{item.vehiclePlate}</td><td data-label="Quilometragem">{(item.distanceMeters / 1000).toLocaleString("pt-BR")} km</td><td data-label="Custo registrado">{formatMoney(item.monthlyCostCents)}</td><td data-label="Custo por km">{item.distanceMeters > 0 ? formatMoney(Math.round(item.monthlyCostCents * 1000 / item.distanceMeters)) : "Não disponível"}</td></tr>)}
    </tbody></table></div>
  </section>}
  </div>;
}
