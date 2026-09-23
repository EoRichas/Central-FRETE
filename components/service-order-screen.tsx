"use client";
import Link from 'next/link';
import { useState } from 'react';
import { apiMutation, useApi } from '@/components/use-api';
import { ErrorState, LoadingState, PageHeader } from '@/components/ui';
import type { ServiceOrderReport } from '@/lib/domain/service-order';

export function ServiceOrderScreen({id}: {id:string}) {
  const endpoint = `/api/sales/${id}/service-order`;
  const api = useApi<ServiceOrderReport>(endpoint);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [selectedVersion,setSelectedVersion] = useState<number | null>(null);
  async function issue() {
    setBusy(true);setError('');
    try { const result=await apiMutation<ServiceOrderReport>(endpoint,{method:'POST'});api.setData(result);setSelectedVersion(null); }
    catch(e) {setError(e instanceof Error ? e.message : 'Não foi possível gerar a OS.');}
    finally {setBusy(false);}
  }
  if(api.loading) return <LoadingState label="Carregando OS…" />;
  if(api.error) return <ErrorState message={api.error} retry={api.refresh} />;
  const report=api.data;
  const version=selectedVersion ?? report?.latest?.version;
  const pdf=`${endpoint}?format=pdf&version=${version}`;
  return <>
    <PageHeader eyebrow="Documento da venda" title="Ordem de Serviço" description="A OS utiliza os dados da venda. Cada versão emitida fica preservada para consulta." actions={<Link className="button secondary" href={`/vendas/${id}`}>Voltar à venda</Link>} />
    <section className="panel detail-card form-stack">
      {error && <p className="form-error" role="alert">{error}</p>}
      {report?.stale && <p className="form-error" role="status">A venda, o cliente ou a carga foi alterado após a emissão. A versão anterior está preservada. Gere uma nova versão antes de enviar os dados atualizados.</p>}
      <div className="order-actions">
        {(!report?.latest || report.stale) && <button className="button primary" disabled={busy} onClick={issue}>{busy ? 'Gerando…' : report?.latest ? 'Gerar nova versão da OS' : 'Gerar OS'}</button>}
        {report?.latest && <>
          <label>Versão <select value={version} onChange={e=>setSelectedVersion(Number(e.target.value))}>{report.versions.map(v=><option key={v.version} value={v.version}>Versão {v.version} · {new Date(v.createdAt).toLocaleString('pt-BR')}</option>)}</select></label>
          <a className="button secondary" href={pdf} target="_blank" rel="noreferrer">Visualizar / imprimir</a>
          <a className="button secondary" href={`${pdf}&download=1`}>Salvar PDF</a>
        </>}
      </div>
      {report?.latest ? <iframe className="order-preview" title={`Ordem de Serviço versão ${version}`} src={pdf} /> : <p>Gere a OS para visualizar, imprimir ou salvar o documento.</p>}
    </section>
  </>;
}
