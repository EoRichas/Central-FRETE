"use client";

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { FleetClientReport, FleetClientReportData } from '@/lib/domain/fleet-client-report';
import { formatDate } from '@/lib/format';
import { useApi } from './use-api';
import { EmptyState, ErrorState, LoadingState, Modal } from './ui';
import styles from './fleet-client-report.module.css';

export type OrderObservationContext = {clientId: string; from: string; to: string; rowId: string};
type Props = {context: OrderObservationContext; onClose: () => void; onGenerated: (blob: Blob, filename: string) => void};

export function OrderObservationsDialog({context, onClose, onGenerated}: Props) {
  const query = new URLSearchParams(context).toString();
  const api = useApi<FleetClientReportData>(`/api/fleet/client-report?${query}`);
  return <Modal open onClose={onClose} title="Adicionar Observação" description="Escolha se deseja incluir uma observação nesta OS." wide>
    {api.loading ? <LoadingState label="Consultando a venda…" /> : api.error ? <ErrorState message={api.error} retry={api.refresh} /> : api.data?.report?.rows.length === 1 && api.data.report.rows[0].id === context.rowId
      ? <OrderObservationForm key={query} report={api.data.report} query={query} onClose={onClose} onGenerated={onGenerated} />
      : <EmptyState title="Nenhuma venda disponível" description="Atualize a OS e tente novamente." />}
  </Modal>;
}

export function OrderObservationForm({report, query, onClose, onGenerated}: {
  report: FleetClientReport; query: string; onClose: () => void; onGenerated: Props['onGenerated'];
}) {
  const [include, setInclude] = useState(false);
  const row = report.rows[0];
  const [notes, setNotes] = useState(row.notes);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function generate(event: FormEvent) {
    event.preventDefault(); if (pending.current) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError('');
    try {
      const response = await fetch(`/api/fleet/client-report?${query}`, {method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: {'content-type': 'application/json'}, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
        body: JSON.stringify({includeObservations: include, observations: include ? [{saleId: row.id, text: notes}] : []})});
      if (!response.ok) throw new Error((await response.json()).error || 'Não foi possível gerar o PDF.');
      const blob = await response.blob(); if (controller.signal.aborted) return;
      const number = row.saleNumber.replace(/[^a-zA-Z0-9-]/g, '_');
      onGenerated(blob, `OS-Central-${number}.pdf`);
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Não foi possível gerar o PDF.'); }
    finally { if (pending.current === controller) pending.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  return <form className="modal-body form-stack" onSubmit={generate}>
    <p><strong>{report.client.name}</strong> · {formatDate(report.from)} a {formatDate(report.to)} · Venda {row.saleNumber}</p>
    <fieldset className={styles.choices} disabled={busy}><legend>Incluir observações da venda?</legend>
      <label><input type="radio" name="includeNotes" checked={!include} onChange={() => setInclude(false)} />Não</label>
      <label><input type="radio" name="includeNotes" checked={include} onChange={() => setInclude(true)} />Sim</label>
    </fieldset>
    {include && <div className={styles.observations}><div>
      <label className="field"><span>Observação da venda {row.saleNumber}</span><textarea rows={3} maxLength={6000} value={notes} disabled={busy} onChange={e => setNotes(e.target.value)} placeholder={row.notes || 'Sem observação cadastrada. Se desejar, escreva para este PDF.'} /></label>
    </div><p className="report-basis">Ajustes de texto valem somente para este PDF. As observações originais da venda e os totais permanecem iguais.</p></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? 'Gerando…' : 'Visualizar PDF'}</button></footer>
  </form>;
}
