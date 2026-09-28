"use client";
import Link from 'next/link';
import { useState } from 'react';
import { apiMutation, useApi } from '@/components/use-api';
import { ErrorState, LoadingState, PageHeader } from '@/components/ui';
import type { ServiceOrderReport } from '@/lib/domain/service-order';

export function ServiceOrderScreen({id, source = "sale"}: {id:string; source?: "sale" | "fleet"}) {
  const endpoint = source === "fleet" ? `/api/fleet/freights/${id}/service-order` : `/api/sales/${id}/service-order`;
  const api = useApi<ServiceOrderReport>(endpoint);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  async function issue() {
    setBusy(true);setError('');
    try { const result=await apiMutation<ServiceOrderReport>(endpoint,{method:'POST'});api.setData(result); }
    catch(e) {setError(e instanceof Error ? e.message : 'Não foi possível gerar a OS.');}
    finally {setBusy(false);}
  }
  if(api.loading) return <LoadingState label="Carregando OS…" />;
  if(api.error) return <ErrorState message={api.error} retry={api.refresh} />;
  const report=api.data;
  const pdf=`${endpoint}?format=pdf`;
  return <>
    <PageHeader eyebrow="Documento da venda" title="Ordem de Serviço" description="Visualize, imprima ou salve a OS desta venda." actions={<Link className="button secondary" href={source === "fleet" ? "/frota" : `/vendas/${id}`}>{source === "fleet" ? "Voltar à Frota" : "Voltar à venda"}</Link>} />
    <section className="panel detail-card form-stack">
      {error && <p className="form-error" role="alert">{error}</p>}
      {report?.stale && <p className="form-error" role="status">Os dados da venda foram alterados. Atualize a OS antes de enviá-la.</p>}
      <div className="order-actions">
        {(!report?.latest || report.stale) && <button className="button primary" disabled={busy} onClick={issue}>{busy ? 'Gerando…' : report?.latest ? 'Atualizar OS' : 'Gerar OS'}</button>}
        {report?.latest && <>
          <a className="button secondary" href={pdf} target="_blank" rel="noreferrer">Visualizar / imprimir</a>
          <a className="button secondary" href={`${pdf}&download=1`}>Salvar PDF</a>
        </>}
      </div>
      {report?.latest ? <iframe className="order-preview" key={report.latest.version} title="Ordem de Serviço" src={pdf} /> : <p>Gere a OS para visualizar, imprimir ou salvar o documento.</p>}
    </section>
  </>;
}
