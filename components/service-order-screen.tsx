"use client";
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { apiMutation, useApi } from '@/components/use-api';
import { ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { OrderObservationsDialog } from './order-observations-dialog';
import type { ServiceOrderReport } from '@/lib/domain/service-order';

export function ServiceOrderScreen({id, source = "sale", onBack}: {id:string; source?: "sale" | "fleet"; onBack?: () => void}) {
  const endpoint = source === "fleet" ? `/api/fleet/freights/${id}/service-order` : `/api/sales/${id}/service-order`;
  const api = useApi<ServiceOrderReport>(endpoint);
  const [customPreview,setCustomPreview] = useState<{url: string; filename: string} | null>(null);
  const previewUrl = useRef<string | null>(null);
  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);
  function clearPreview() { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); previewUrl.current = null; setCustomPreview(null); }
  function showPreview(blob: Blob, filename: string) {
    clearPreview(); const url = URL.createObjectURL(blob); previewUrl.current = url; setCustomPreview({url, filename}); setObservationsOpen(false);
  }
  const [observationsOpen,setObservationsOpen] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  async function issue() {
    setBusy(true);setError('');
    try { const result=await apiMutation<ServiceOrderReport>(endpoint,{method:'POST'});api.setData(result);clearPreview(); }
    catch(e) {setError(e instanceof Error ? e.message : 'Não foi possível gerar a OS.');}
    finally {setBusy(false);}
  }
  if(api.loading) return <LoadingState label="Carregando OS…" />;
  if(api.error) return <ErrorState message={api.error} retry={api.refresh} />;
  const report=api.data;
  const relation = source === "fleet" || Boolean(report?.latest?.snapshot?.fleetRelation);
  const row = report?.latest?.snapshot?.fleetRelation;
  const observationsContext = row ? {clientId: row.clientId, from: row.createdDate, to: row.createdDate,
    rowId: `${source === 'fleet' || row.id !== id ? 'freight' : 'sale'}:${row.id}`} : undefined;
  const pdf=customPreview?.url ?? `${endpoint}?format=pdf${relation ? "&observations=0" : ""}`;
  return <>
    <PageHeader eyebrow="Documento da venda" title="Ordem de Serviço" description="Visualize, imprima ou salve a OS desta venda." actions={onBack ? <button type="button" className="button secondary" onClick={onBack}>Voltar à venda</button> : <Link className="button secondary" href={source === "fleet" ? "/frota" : `/vendas/${id}`}>{source === "fleet" ? "Voltar à Frota" : "Voltar à venda"}</Link>} />
    <section className="panel detail-card form-stack">
      {error && <p className="form-error" role="alert">{error}</p>}
      {report?.stale && <p className="form-error" role="status">Os dados da venda foram alterados. Atualize a OS antes de enviá-la.</p>}
      <div className="order-actions">
        {relation && <button type="button" className="button secondary" disabled={!observationsContext} onClick={() => setObservationsOpen(true)}>Adicionar Observação</button>}
        {(!report?.latest || report.stale) && <button className="button primary" disabled={busy} onClick={issue}>{busy ? 'Gerando…' : report?.latest ? 'Atualizar OS' : 'Gerar OS'}</button>}
        {(report?.latest || customPreview) && <>
          <a className="button secondary" href={pdf} target="_blank" rel="noreferrer">Visualizar / imprimir</a>
          <a className="button secondary" href={customPreview ? pdf : `${pdf}&download=1`} download={customPreview?.filename}>Salvar PDF</a>
        </>}
      </div>
      {report?.latest || customPreview ? <iframe className="order-preview" key={customPreview?.url ?? report?.latest?.version} title="Ordem de Serviço" src={pdf} /> : <p>Gere a OS para visualizar, imprimir ou salvar o documento.</p>}
    </section>
    {relation && observationsOpen && observationsContext && <OrderObservationsDialog context={observationsContext} onClose={() => setObservationsOpen(false)} onGenerated={showPreview} />}
  </>;
}
