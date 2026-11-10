"use client";

import { useState, type FormEvent } from 'react';
import { cargoPlateKey } from '@/lib/domain/cargo-vehicles';
import { currentCompetency, todaySaoPaulo } from '@/lib/domain/dates';
import { FLEET_REPORT_PAYMENT_FILTERS, VEHICLE_REPORT_PAYMENT_LABELS, type FleetReportPaymentFilter, type FleetVehicleReport } from '@/lib/domain/fleet-client-report';
import { formatDate, formatMoney } from '@/lib/format';
import { FleetReportSaleDetail } from './fleet-report-sale-detail';
import { Icons } from './icons';
import { ReportPreviewButton } from './report-preview-button';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from './ui';
import { useApi } from './use-api';
import styles from './fleet-client-report.module.css';

export function FleetVehicleReportPanel() {
  const [draft,setDraft] = useState(() => ({
    plate:'',from:`${currentCompetency()}-01`,to:todaySaoPaulo(),payment:'TODOS' as FleetReportPaymentFilter,
  }));
  const [query,setQuery] = useState('');
  const [viewingId,setViewingId] = useState<string|null>(null);
  const options = useApi<{plates:string[]}>('/api/reports/vehicles?options=plates');
  const results = useApi<{report:FleetVehicleReport}>(query ? `/api/reports/vehicles?${query}` : null);
  const applied = new URLSearchParams(query);
  const result = results.data?.report;
  const report = !results.loading && !results.error && result && result.plate===applied.get('plate') && result.from===applied.get('from')
    && result.to===applied.get('to') && result.paymentFilter===applied.get('payment') ? result : undefined;
  function search(event: FormEvent) {
    event.preventDefault();
    if (!draft.plate) return;
    const next = new URLSearchParams(draft).toString();
    if (next===query) results.refresh(); else setQuery(next);
  }
  if (viewingId) return <FleetReportSaleDetail id={viewingId} onBack={()=>setViewingId(null)} />;
  return <section className={styles.report} aria-label="Relatório de Veículos">
    <header className="fleet-panel-header"><div><h2>Relatório de Veículos</h2><p>Vendas da Frota por placa do veículo transportado. O período considera a data de criação.</p></div></header>
    <form className="filter-panel report-filters report-search-filters" onSubmit={search}>
      <label><span>Placa do veículo</span><select required value={draft.plate} disabled={options.loading||Boolean(options.error)} onChange={e=>setDraft({...draft,plate:e.target.value})}>
        <option value="">{options.loading?'Carregando placas…':'Selecione uma placa'}</option><option value="*">Todas as placas</option>
        {options.data?.plates.map(plate=><option key={plate} value={plate}>{plate}</option>)}
      </select></label>
      <label><span>Criada de</span><input required type="date" value={draft.from} max={draft.to||undefined} onChange={e=>setDraft({...draft,from:e.target.value})} /></label>
      <label><span>Até</span><input required type="date" value={draft.to} min={draft.from||undefined} onChange={e=>setDraft({...draft,to:e.target.value})} /></label>
      <label><span>Situação do pagamento</span><select value={draft.payment} onChange={e=>setDraft({...draft,payment:e.target.value as FleetReportPaymentFilter})}>
        {FLEET_REPORT_PAYMENT_FILTERS.map(value=><option key={value} value={value}>{VEHICLE_REPORT_PAYMENT_LABELS[value]}</option>)}
      </select></label>
      <button className="button primary" disabled={!draft.plate||options.loading||Boolean(options.error)||Boolean(query&&results.loading)}>Consultar</button>
    </form>
    {options.error && <ErrorState message={options.error} retry={options.refresh} />}
    {query && !results.error && !report && <LoadingState label="Consultando veículos…" />}
    {query && results.error && <ErrorState message={results.error} retry={results.refresh} />}
    {report && (report.rows.length ? <>
      <div className={styles.heading}>
        <div><h3>{report.totals.sales} venda(s) · {report.plate==='*'?'Todas as placas':report.plate}</h3><p>{formatDate(report.from)} a {formatDate(report.to)} · {VEHICLE_REPORT_PAYMENT_LABELS[report.paymentFilter]}</p></div>
        <ReportPreviewButton key={query} url={`/api/reports/vehicles?${query}&format=pdf`} label="Visualizar relatório" title="Relatório de Veículos" filename="Relatorio-de-Veiculos.pdf" />
      </div>
      <div className="panel table-panel"><div className="responsive-table"><table className="sales-table">
        <thead><tr><th>Venda</th><th>Criação</th><th>Cliente</th><th>Veículo / placa</th><th>Valor</th><th>Pagamento da venda</th><th><span className="sr-only">Detalhes</span></th></tr></thead>
        <tbody>{report.rows.map(row=><tr key={row.id}>
          <td data-label="Venda"><strong>{row.saleNumber}</strong></td>
          <td data-label="Criação">{formatDate(row.createdDate)}</td>
          <td data-label="Cliente">{row.clientName}</td>
          <td data-label="Veículo / placa">{row.vehicles.map((v,i)=><div key={i}>{v.model||'Não informado'}<small>{cargoPlateKey(v.plate)}</small></div>)}</td>
          <td data-label="Valor">{formatMoney(row.amountCents)}</td>
          <td data-label="Pagamento da venda"><StatusBadge status={row.paid==='Sim'?'PAGO':'PENDENTE'} label={row.paid==='Sim'?'Pago':'Não pago'} />{row.paid==='Parcial'&&<small>Recebimento parcial</small>}</td>
          <td data-label="Detalhes"><button type="button" className="table-action" onClick={()=>setViewingId(row.id)} aria-label={`Abrir venda ${row.saleNumber}`}><Icons.chevron /></button></td>
        </tr>)}</tbody>
      </table></div></div>
    </> : <EmptyState title="Nenhuma venda encontrada" description="Confira a placa, o período e a situação do pagamento." />)}
    {!query && !options.loading && !options.error && <EmptyState title="Consulte as vendas por placa" description="Selecione a placa e o período para visualizar o relatório." />}
  </section>;
}
