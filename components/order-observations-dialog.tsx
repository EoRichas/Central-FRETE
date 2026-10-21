"use client";

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { FleetClientReport, FleetClientReportData } from '@/lib/domain/fleet-client-report';
import { formatDate } from '@/lib/format';
import { useApi } from './use-api';
import { EmptyState, ErrorState, LoadingState, Modal } from './ui';
import styles from './fleet-client-report.module.css';

export type OrderObservationContext = {clientId: string; from: string; to: string; rowId?: string};
type Props = {context: OrderObservationContext; onClose: () => void; onGenerated: (blob: Blob, filename: string) => void};

export function OrderObservationsDialog({context, onClose, onGenerated}: Props) {
  const query = new URLSearchParams(context).toString();
  const api = useApi<FleetClientReportData>(`/api/fleet/client-report?${query}`);
  return <Modal open onClose={onClose} title="Adicionar Observação" description="Escolha se deseja incluir observações e quais vendas terão texto no PDF." wide>
    {api.loading ? <LoadingState label="Consultando vendas para observações…" /> : api.error ? <ErrorState message={api.error} retry={api.refresh} /> : api.data?.report?.rows.length
      ? <OrderObservationForm key={query} report={api.data.report} query={query} single={Boolean(context.rowId)} onClose={onClose} onGenerated={onGenerated} />
      : <EmptyState title="Nenhuma venda disponível" description="Confira o cliente e o período da relação." />}
  </Modal>;
}

export function OrderObservationForm({report, query, single, onClose, onGenerated}: {
  report: FleetClientReport; query: string; single: boolean; onClose: () => void; onGenerated: Props['onGenerated'];
}) {
  const [include, setInclude] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>(() => Object.fromEntries(report.rows.map(row => [row.id, Boolean(row.notes.trim())])));
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(report.rows.map(row => [row.id, row.notes])));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function generate(event: FormEvent) {
    event.preventDefault(); if (pending.current) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError('');
    try {
      const response = await fetch(`/api/fleet/client-report?${query}`, {method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: {'content-type': 'application/json'}, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
        body: JSON.stringify({includeObservations: include, observations: include ? report.rows.filter(row => selected[row.id]).map(row => ({saleId: row.id, text: notes[row.id] ?? ''})) : []})});
      if (!response.ok) throw new Error((await response.json()).error || 'Não foi possível gerar o PDF.');
      const blob = await response.blob(); if (controller.signal.aborted) return;
      const number = report.rows[0].saleNumber.replace(/[^a-zA-Z0-9-]/g, '_');
      onGenerated(blob, single ? `OS-Central-${number}.pdf` : `Relatorio-Vendas-Frota-${report.from}-${report.to}.pdf`);
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Não foi possível gerar o PDF.'); }
    finally { if (pending.current === controller) pending.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  return <form className="modal-body form-stack" onSubmit={generate}>
    <p><strong>{report.client.name}</strong> · {formatDate(report.from)} a {formatDate(report.to)} · {report.rows.length} venda(s)</p>
    <fieldset className={styles.choices} disabled={busy}><legend>Incluir observações da venda?</legend>
      <label><input type="radio" name="includeNotes" checked={!include} onChange={() => setInclude(false)} />Não</label>
      <label><input type="radio" name="includeNotes" checked={include} onChange={() => setInclude(true)} />Sim</label>
    </fieldset>
    {include && <div className={styles.observations}>{report.rows.map(row => <div key={row.id}>
      <label className={styles.choice}><input type="checkbox" checked={Boolean(selected[row.id])} disabled={busy} onChange={e => setSelected(s => ({...s, [row.id]: e.target.checked}))} /><span>Venda {row.saleNumber} · {row.vehicles.map(v => v.plate || v.model).join(', ')}</span></label>
      <label className="field"><span>Observação da venda {row.saleNumber}</span><textarea rows={3} maxLength={6000} value={notes[row.id] ?? ''} disabled={busy || !selected[row.id]} onChange={e => setNotes(n => ({...n, [row.id]: e.target.value}))} placeholder={row.notes || 'Sem observação cadastrada. Se desejar, escreva para este PDF.'} /></label>
    </div>)}<p className="report-basis">Ajustes de texto valem somente para este PDF. As observações originais da venda e os totais permanecem iguais.</p></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? 'Gerando…' : 'Visualizar PDF'}</button></footer>
  </form>;
}
