"use client";

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { FleetClientReportData } from '@/lib/domain/fleet-client-report';
import { currentCompetency, todaySaoPaulo } from '@/lib/domain/dates';
import { formatDate, formatMoney } from '@/lib/format';
import { useApi } from './use-api';
import { EmptyState, ErrorState, LoadingState, Modal } from './ui';
import { FleetReportSaleDetail } from './fleet-report-sale-detail';
import { providerKindLabel } from "@/lib/domain/provider-services";
import { Icons } from './icons';
import styles from './fleet-client-report.module.css';

export function FleetClientReportPanel() {
  const [clientId, setClientId] = useState(''), [from, setFrom] = useState(() => `${currentCompetency()}-01`), [to, setTo] = useState(todaySaoPaulo);
  const [query, setQuery] = useState('');
  const api = useApi<FleetClientReportData>(`/api/fleet/client-report${query ? `?${query}` : ''}`);
  const report = api.data?.report;
  const [pdf, setPdf] = useState<{url: string; filename: string} | null>(null);
  const [generating, setGenerating] = useState(false), [pdfError, setPdfError] = useState('');
  const previewUrl = useRef<string | null>(null), pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);
  function closePreview() { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); previewUrl.current = null; setPdf(null); }
  async function generateReport() {
    if (!report?.rows.length || pending.current) return;
    const controller = new AbortController(); pending.current = controller; setGenerating(true); setPdfError('');
    try {
      const response = await fetch(`/api/fleet/client-report?${query}`, {method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},
        signal:AbortSignal.any([controller.signal,AbortSignal.timeout(60000)]),body:JSON.stringify({useOrderObservations:true,includeProviders:false})});
      if (!response.ok) throw new Error((await response.json()).error || 'Não foi possível gerar o relatório.');
      const blob = await response.blob(); if (controller.signal.aborted) return;
      closePreview(); const url = URL.createObjectURL(blob); previewUrl.current = url;
      setPdf({url,filename:`Relatorio-Vendas-Frota-${report.from}-${report.to}.pdf`});
    } catch (e) { if (!controller.signal.aborted) setPdfError(e instanceof Error ? e.message : 'Não foi possível gerar o relatório.'); }
    finally { if (pending.current === controller) pending.current = null; if (!controller.signal.aborted) setGenerating(false); }
  }
  const [viewingId, setViewingId] = useState<string | null>(null);
  function search(event: FormEvent) {
    event.preventDefault();
    pending.current?.abort(); pending.current = null; setGenerating(false); setPdfError(''); closePreview();
    const next = new URLSearchParams({clientId, from, to}).toString();
    if (next === query) api.refresh(); else setQuery(next);
  }
  if (viewingId) return <FleetReportSaleDetail key={viewingId} id={viewingId} onBack={() => setViewingId(null)} />;
  return <section className={styles.report} aria-label="Relatório de vendas por cliente">
    <header className="fleet-panel-header"><div><h2>Relatório de vendas</h2><p>Controle por cliente, exclusivamente das vendas do Frota. O período considera a data de criação em São Paulo.</p></div></header>
    <form className="filter-panel report-filters" onSubmit={search}>
      <label><span>Cliente</span><select value={clientId} onChange={e => setClientId(e.target.value)} required><option value="">Selecione um cliente</option><option value="*">Todos os clientes</option>{api.data?.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label><span>Criada de</span><input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} required /></label>
      <label><span>Até</span><input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} required /></label>
      <button className="button primary" disabled={api.loading}>Consultar</button>
    </form>
    {api.loading ? <LoadingState label="Consultando vendas do Frota…" /> : api.error ? <ErrorState message={api.error} retry={api.refresh} /> : report ? <>
      <div className={styles.heading}><div><h3>{report.client.name}</h3><p>{formatDate(report.from)} a {formatDate(report.to)} · {report.totals.sales} vendas · {report.totals.vehicles} veículos</p></div><a className="button secondary" href={`/api/fleet/client-report?${query}&format=xlsx`}>Exportar Excel</a><button type="button" className="button secondary" disabled={generating || !report.rows.length} onClick={generateReport}>{generating ? 'Gerando…' : 'Gerar relatório de vendas'}</button></div>
      {pdfError && <p className="form-error" role="alert">{pdfError}</p>}
      <section className="receivable-summary large"><div><span>Total dos serviços</span><strong>{formatMoney(report.totals.amountCents)}</strong></div><div><span>Total recebido</span><strong>{formatMoney(report.totals.receivedCents)}</strong></div><div><span>Valor pendente</span><strong>{formatMoney(report.totals.balanceCents)}</strong></div></section>
      <p className="report-basis">Recebimento: valor das baixas e pagamentos confirmados, descontados os estornos. A forma de pagamento não altera o relatório. Datas ausentes não são estimadas.</p>
      {!report.rows.length ? <EmptyState title="Nenhuma venda neste período" description="Confira o cliente e as datas de criação selecionadas." /> : <div className="panel table-panel"><div className="responsive-table"><table className="sales-table"><thead><tr><th>Venda / criação</th><th>Veículo / placa</th><th>Motorista</th><th>Situação</th><th>Valor</th><th>Recebimento</th><th>Data de recebimento</th><th>Data de saída</th><th>Pago</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>
        {report.rows.map(row => <tr key={row.id}>
          <td data-label="Venda / criação"><strong>{row.saleNumber}</strong><small>{formatDate(row.createdDate)}</small></td>
          <td data-label="Veículo / placa">{row.vehicles.map((v, i) => <div key={i}>{v.model || 'Não informado'}<small>{v.plate || v.identification || 'Placa não informada'}</small></div>)}</td>
          <td data-label="Motorista">{row.driverName || 'Não informado'}</td><td data-label="Situação">{row.situation}</td>
          <td data-label="Valor">{formatMoney(row.amountCents)}</td><td data-label="Recebimento">{formatMoney(row.receivedCents)}</td>
          <td data-label="Data de recebimento">{row.receivedDates.length ? row.receivedDates.map(d => formatDate(d)).join(', ') : 'Não informada'}</td>
          <td data-label="Data de saída">{row.departureDate ? formatDate(row.departureDate) : 'Não informada'}<small>Coleta</small></td><td data-label="Pago">{row.paid}</td>
          <td data-label="Detalhes"><div className="table-actions"><button type="button" className="table-action" onClick={() => setViewingId(row.id)} aria-label={`Abrir venda ${row.saleNumber}`}><Icons.chevron /></button></div>
            {!!row.providerServices?.length && <details><summary>Prestadores</summary>{row.providerServices.map(p=><p key={p.id}>{p.providerName}{p.referenceName?` · ${p.referenceName}`:''} · {providerKindLabel(p.kind)}: {formatMoney(p.amountCents)}</p>)}</details>}
            {row.notes && <details><summary>Observação</summary><p className={styles.note}>{row.notes}</p></details>}</td>
        </tr>)}
      </tbody></table></div></div>}
    </> : <EmptyState title="Consulte as vendas de um cliente" description="Escolha o cliente e o intervalo de criação para visualizar o relatório." />}

    <Modal open={Boolean(pdf)} onClose={closePreview} title="Relatório de vendas" description="Todos os serviços do cliente e período consultados, com as observações salvas nas OS individuais." wide>
      {pdf && <div className="modal-body form-stack"><div className="order-actions"><a className="button secondary" href={pdf.url} target="_blank" rel="noreferrer">Visualizar / imprimir</a><a className="button secondary" href={pdf.url} download={pdf.filename}>Salvar PDF</a><button type="button" className="button secondary" onClick={closePreview}>Fechar</button></div><iframe className="order-preview" title="Relatório de vendas" src={pdf.url} /></div>}
    </Modal>
  </section>;
}
