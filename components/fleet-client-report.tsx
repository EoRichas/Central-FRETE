"use client";

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { FleetClientReportData } from '@/lib/domain/fleet-client-report';
import { currentCompetency, todaySaoPaulo } from '@/lib/domain/dates';
import { formatDate, formatMoney } from '@/lib/format';
import { useApi } from './use-api';
import { EmptyState, ErrorState, LoadingState, Modal } from './ui';
import styles from './fleet-client-report.module.css';

export function FleetClientReportPanel() {
  const [clientId, setClientId] = useState(''), [from, setFrom] = useState(() => `${currentCompetency()}-01`), [to, setTo] = useState(todaySaoPaulo);
  const [query, setQuery] = useState('');
  const api = useApi<FleetClientReportData>(`/api/fleet/client-report${query ? `?${query}` : ''}`);
  const report = api.data?.report;
  const [choosing, setChoosing] = useState(false), [include, setInclude] = useState(false), [selected, setSelected] = useState<Record<string, boolean>>({}), [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [preview, setPreview] = useState<string | null>(null);
  const previewUrl = useRef<string | null>(null), generation = useRef(0);
  useEffect(() => () => { generation.current++; if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);
  function search(event: FormEvent) {
    event.preventDefault(); setError('');
    const next = new URLSearchParams({clientId, from, to}).toString();
    if (next === query) api.refresh(); else setQuery(next);
  }
  function choose() {
    setSelected(Object.fromEntries((report?.rows ?? []).map(row => [row.id, Boolean(row.notes.trim())])));
    setNotes(Object.fromEntries((report?.rows ?? []).map(row => [row.id, row.notes])));
    setInclude(false); setError(''); setChoosing(true);
  }
  async function generate(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    const revision = ++generation.current;
    try {
      const response = await fetch(`/api/fleet/client-report?${query}`, {method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: {'content-type': 'application/json'}, body: JSON.stringify({includeObservations: include,
          observations: include ? report?.rows.filter(row => selected[row.id]).map(row => ({saleId: row.id, text: notes[row.id] ?? ''})) : []}),
        signal: AbortSignal.timeout(60000)});
      if (!response.ok) throw new Error((await response.json()).error || 'Não foi possível gerar o PDF.');
      const blob = await response.blob(); if (revision !== generation.current) return;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(blob); setPreview(previewUrl.current); setChoosing(false);
    } catch (e) { if (revision === generation.current) setError(e instanceof Error ? e.message : 'Não foi possível gerar o PDF.'); }
    finally { if (revision === generation.current) setBusy(false); }
  }
  function closePreview() { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); previewUrl.current = null; setPreview(null); }
  return <section className={styles.report} aria-label="Relatório de vendas por cliente">
    <header className="fleet-panel-header"><div><h2>Relatório de vendas</h2><p>Controle por cliente, exclusivamente das vendas do Frota. O período considera a data de criação em São Paulo.</p></div></header>
    <form className="filter-panel report-filters" onSubmit={search}>
      <label><span>Cliente</span><select value={clientId} onChange={e => setClientId(e.target.value)} required><option value="">Selecione um cliente</option>{api.data?.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label><span>Criada de</span><input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} required /></label>
      <label><span>Até</span><input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} required /></label>
      <button className="button primary" disabled={api.loading}>Consultar</button>
    </form>
    {api.loading ? <LoadingState label="Consultando vendas do Frota…" /> : api.error ? <ErrorState message={api.error} retry={api.refresh} /> : report ? <>
      <div className={styles.heading}><div><h3>{report.client.name}</h3><p>{formatDate(report.from)} a {formatDate(report.to)} · {report.totals.sales} vendas · {report.totals.vehicles} veículos</p></div><button type="button" className="button secondary" disabled={!report.rows.length} onClick={choose}>Gerar PDF para o cliente</button></div>
      <section className="receivable-summary large"><div><span>Total dos serviços</span><strong>{formatMoney(report.totals.amountCents)}</strong></div><div><span>Total recebido</span><strong>{formatMoney(report.totals.receivedCents)}</strong></div><div><span>Valor pendente</span><strong>{formatMoney(report.totals.balanceCents)}</strong></div></section>
      <p className="report-basis">Recebimento: valor das baixas e pagamentos confirmados, descontados os estornos. A forma de pagamento não altera o relatório. Datas ausentes não são estimadas.</p>
      {!report.rows.length ? <EmptyState title="Nenhuma venda neste período" description="Confira o cliente e as datas de criação selecionadas." /> : <div className="panel table-panel"><div className="responsive-table"><table><thead><tr><th>Venda / criação</th><th>Veículo / placa</th><th>Motorista</th><th>Situação</th><th>Valor</th><th>Recebimento</th><th>Data de recebimento</th><th>Data de saída</th><th>Pago</th><th>Detalhes</th></tr></thead><tbody>
        {report.rows.map(row => <tr key={row.id}>
          <td data-label="Venda / criação"><strong>{row.saleNumber}</strong><small>{formatDate(row.createdDate)}</small></td>
          <td data-label="Veículo / placa">{row.vehicles.map((v, i) => <div key={i}>{v.model || 'Não informado'}<small>{v.plate || v.identification || 'Placa não informada'}</small></div>)}</td>
          <td data-label="Motorista">{row.driverName || 'Não informado'}</td><td data-label="Situação">{row.situation}</td>
          <td data-label="Valor">{formatMoney(row.amountCents)}</td><td data-label="Recebimento">{formatMoney(row.receivedCents)}</td>
          <td data-label="Data de recebimento">{row.receivedDates.length ? row.receivedDates.map(d => formatDate(d)).join(', ') : 'Não informada'}</td>
          <td data-label="Data de saída">{row.departureDate ? formatDate(row.departureDate) : 'Não informada'}<small>Coleta</small></td><td data-label="Pago">{row.paid}</td>
          <td data-label="Detalhes">{row.id.startsWith('sale:') ? <Link className="text-button" href={`/vendas/${row.id.slice(5)}`}>Abrir venda</Link> : <Link className="text-button" href={`/frota/fretes/${row.id.slice(8)}/os`}>Visualizar OS</Link>}
            {row.notes && <details><summary>Observação</summary><p className={styles.note}>{row.notes}</p></details>}</td>
        </tr>)}
      </tbody></table></div></div>}
    </> : <EmptyState title="Consulte as vendas de um cliente" description="Escolha o cliente e o intervalo de criação para visualizar o relatório e gerar o PDF." />}
    <Modal open={choosing} onClose={() => { if (!busy) setChoosing(false); }} title="Incluir observações no relatório?" description="As observações ficam em uma seção separada do PDF. Nenhuma venda ou total será retirado pela escolha de observações." wide>
      <form className="modal-body form-stack" onSubmit={generate}>
        <fieldset className={styles.choices} disabled={busy}><legend>Incluir observações?</legend><label><input type="radio" name="includeNotes" checked={!include} onChange={() => setInclude(false)} />Não</label><label><input type="radio" name="includeNotes" checked={include} onChange={() => setInclude(true)} />Sim</label></fieldset>
        {include && <div className={styles.observations}>{report?.rows.map(row => <div key={row.id}><label className={styles.choice}><input type="checkbox" checked={Boolean(selected[row.id])} onChange={e => setSelected(s => ({...s, [row.id]: e.target.checked}))} disabled={busy} /><span>Venda {row.saleNumber} · {row.vehicles.map(v => v.plate || v.model).join(', ')}</span></label>
          <label className="field"><span>Observação da venda {row.saleNumber}</span><textarea rows={3} maxLength={6000} value={notes[row.id] ?? ''} disabled={busy || !selected[row.id]} onChange={e => setNotes(n => ({...n, [row.id]: e.target.value}))} placeholder={row.notes || 'Sem observação cadastrada. Se desejar, escreva para este relatório.'} /></label></div>)}<p className="report-basis">O texto existente pode ser ajustado para este PDF. As alterações não modificam a observação original da venda.</p></div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setChoosing(false)}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? 'Gerando…' : 'Visualizar PDF'}</button></footer>
      </form>
    </Modal>
    <Modal open={Boolean(preview)} onClose={closePreview} title="Relatório para o cliente" wide>
      {preview && <div className="modal-body form-stack"><a className="button primary" href={preview} download={`Relatorio-Vendas-Frota-${report?.from}-${report?.to}.pdf`}>Baixar PDF</a><iframe className={styles.preview} title="Prévia do relatório de vendas" src={preview} /></div>}
    </Modal>
  </section>;
}
