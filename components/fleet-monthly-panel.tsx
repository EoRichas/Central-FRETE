"use client";
import { useState } from 'react';
import { apiMutation, useApi } from '@/components/use-api';
import { Field, LoadingState, ErrorState } from '@/components/ui';
import { calculateMonthlyResult, MONTHLY_ENTRY_LABELS, type MonthlyReport } from '@/lib/domain/fleet-results';
import { competencyLabel, formatMoney, moneyInputToCents } from '@/lib/format';

export function FleetMonthlyPanel({ competency }: { competency: string }) {
  const api = useApi<MonthlyReport>(`/api/fleet/monthly?competency=${competency}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [reason, setReason] = useState('');
  const report = api.data;
  const closed = report?.history.find(h => !h.reopenedAt);
  const source = closed?.snapshot ?? report?.current;
  const totals = source ? calculateMonthlyResult(source) : null;
  const changed = closed && report && JSON.stringify(closed.snapshot) !== JSON.stringify(report.current);
  async function mutate(payload: object) {
    setBusy(true); setError(''); setSuccess('');
    try {
      await apiMutation('/api/fleet/monthly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, competency }) });
      setSuccess('Operação concluída.'); setReviewed(false); api.refresh(); return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir.'); return false; }
    finally { setBusy(false); }
  }
  async function addEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    try {
      const amountCents = moneyInputToCents(String(form.get('amount')));
      if (await mutate({ action: 'ENTRY', kind: form.get('kind'), description: form.get('description'), amountCents })) formElement.reset();
    } catch (e) { setError(e instanceof Error ? e.message : 'Valor inválido.'); }
  }
  if (api.loading) return <LoadingState label="Apurando o mês…" />;
  if (api.error) return <ErrorState message={api.error} retry={api.refresh} />;
  if (!report || !source || !totals) return null;
  return <section className="fleet-stack">
    <header className="fleet-panel-header"><div><h2>Fechamento mensal: {competencyLabel(competency)}</h2><p>{closed ? `Fechado por ${closed.closedByName}. Valores preservados na data do fechamento.` : 'Em apuração. Confira as receitas e despesas antes de fechar.'}</p></div></header>
    <p className="fleet-update-note">Receitas da Frota pela data de faturamento; custos diretos acompanham esses fretes. Diesel, pedágio e outros custos compartilhados entram pela data de apuração da viagem. Vendas e outras receitas devem ser lançadas abaixo somente quando ainda não estiverem nos fretes da Frota.</p>
    {source.unbilledCount > 0 && <p role="status">{source.unbilledCount} frete(s) coletado(s) neste mês ainda sem faturamento, fora desta apuração.</p>}
    {totals.pendingFuelCount > 0 && <p className="form-error" role="status">{totals.pendingFuelCount} frete(s) avulso(s) sem diesel realizado. O resultado está incompleto. Informe o valor no frete, inclusive zero quando não houver custo, para permitir o fechamento.</p>}
    {changed && <p className="form-error" role="status">Há alterações nos dados de origem após este fechamento. Os valores fechados continuam preservados. Reabra o mês para conferir e gerar uma nova versão.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}{success && <p className="success-banner" role="status">{success}</p>}
    <div className="kpi-grid fleet-kpis"><article className="kpi-card"><span>Faturamento</span><strong>{formatMoney(totals.revenueCents)}</strong></article><article className="kpi-card"><span>Custos variáveis e fixos</span><strong>{formatMoney(totals.variableCostCents + totals.fixedCostCents)}</strong></article><article className="kpi-card accent"><span>Resultado da empresa{totals.pendingFuelCount ? ' (parcial)' : ''}</span><strong>{formatMoney(totals.resultCents)}</strong></article></div>
    <div className="panel responsive-table"><table><thead><tr><th>Composição do resultado</th><th>Valor</th></tr></thead><tbody>
      {([['Fretes faturados da Frota',totals.fleetRevenueCents],['Outras receitas',totals.otherRevenueCents],['Comissões e despesas diretas dos fretes',-totals.directCostCents],['Diesel, pedágio e outros custos de viagem',-totals.transportCostCents],['Outros custos variáveis',-totals.otherVariableCents],['Custos fixos',-totals.fixedCostCents],['Resultado mensal',totals.resultCents]] as const).map(([label,value]) => <tr key={label}><td data-label="Composição">{label}</td><td data-label="Valor">{formatMoney(value)}</td></tr>)}
    </tbody></table></div>
    <details className="panel"><summary>Conferir fretes e viagens da apuração</summary><div className="responsive-table"><table><thead><tr><th>Origem</th><th>Receita</th><th>Custos</th></tr></thead><tbody>
      {source.freights.map(f => <tr key={f.id}><td data-label="Frete">{f.client} <small>Frete {f.id.slice(0,8)}</small></td><td data-label="Receita">{formatMoney(f.revenueCents)}</td><td data-label="Custos">{formatMoney(f.directCostCents + f.standaloneCostCents)}{f.fuelPending && ' + diesel pendente'}</td></tr>)}
      {source.trips.map(t => <tr key={t.id}><td data-label="Viagem">{t.name}</td><td data-label="Receita">Incluída nos fretes faturados</td><td data-label="Custos">{formatMoney(t.costCents)}</td></tr>)}
    </tbody></table></div></details>
    <section className="panel table-panel"><header className="fleet-panel-header"><div><h3>Lançamentos complementares</h3><p>Inclua aluguel, salários fixos, seguros, despesas administrativas, tributos e demais valores ainda não registrados nos fretes ou viagens. Não repita o diesel, os pedágios ou as comissões já incluídos.</p></div></header>
      <div className="responsive-table"><table><thead><tr><th>Tipo</th><th>Descrição</th><th>Valor</th><th>Ações</th></tr></thead><tbody>{source.entries.map(e => <tr key={e.id}><td data-label="Tipo">{MONTHLY_ENTRY_LABELS[e.kind]}</td><td data-label="Descrição">{e.description}</td><td data-label="Valor">{formatMoney(e.amountCents)}</td><td data-label="Ações">{!closed && report.canManage && <button className="button danger" disabled={busy} onClick={() => { if (window.confirm('Excluir este lançamento?')) void mutate({ action: 'DELETE_ENTRY', id: e.id }); }}>Excluir</button>}</td></tr>)}{!source.entries.length && <tr><td colSpan={4}>Nenhum lançamento complementar.</td></tr>}</tbody></table></div>
      {!closed && report.canManage && <form className="modal-body form-stack" onSubmit={addEntry}><div className="form-grid three"><Field label="Tipo"><select name="kind">{Object.entries(MONTHLY_ENTRY_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Descrição"><input name="description" required maxLength={200} /></Field><Field label="Valor (R$)"><input name="amount" inputMode="decimal" required placeholder="0,00" /></Field></div><button className="button secondary" disabled={busy}>Adicionar lançamento</button></form>}
    </section>
    {report.canManage && <section className="panel modal-body form-stack">{closed ? <><Field label="Motivo da reabertura"><textarea value={reason} onChange={e => setReason(e.target.value)} minLength={5} maxLength={1000} /></Field><button className="button secondary" disabled={busy || reason.trim().length < 5} onClick={() => mutate({ action: 'REOPEN', id: closed.id, reason })}>Reabrir mês</button></> : <><label className="fleet-check-field"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} /><span>Conferi todas as receitas, custos variáveis e custos fixos, sem duplicidades, inclusive valores de outras áreas da empresa.</span></label><button className="button primary" disabled={busy || !reviewed || totals.pendingFuelCount > 0} onClick={() => mutate({ action: 'CLOSE', reviewed })}>Fechar mês</button></>}</section>}
    {!!report.history.length && <details className="panel"><summary>Histórico de fechamentos ({report.history.length})</summary>{report.history.map(h => <p key={h.id}>{new Date(h.closedAt).toLocaleString('pt-BR')} · {h.closedByName} · Resultado: {formatMoney(calculateMonthlyResult(h.snapshot).resultCents)}{h.reopenedAt ? ` · Reaberto: ${h.reopenReason}` : ' · Fechamento vigente'}</p>)}</details>}
  </section>;
}
