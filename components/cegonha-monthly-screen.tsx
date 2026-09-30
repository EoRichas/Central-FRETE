"use client";
import { useState } from 'react';
import { CegonhaTabs } from './cegonha-tabs';
import { PdfDownloadButton } from './pdf-download-button';
import { apiMutation, useApi } from './use-api';
import { PageHeader, LoadingState, ErrorState } from './ui';
import { calculateMonthlyResult, MONTHLY_ENTRY_LABELS, type MonthlyReport } from '@/lib/domain/fleet-results';
import { competencyLabel, formatMoney, formatDate } from '@/lib/format';

export function CegonhaMonthlyScreen({initialCompetency}:{initialCompetency:string}) {
 const [competency,setCompetency]=useState(initialCompetency);
 return <><PageHeader eyebrow="Vendas Cegonha" title="Fechamento mensal" description="Receitas, despesas e resultado exclusivos das vendas Cegonha." /><CegonhaTabs active="monthly" competency={competency} /><CegonhaMonthlyPanel key={competency} competency={competency} onChange={setCompetency} /></>;
}
function CegonhaMonthlyPanel({competency,onChange}:{competency:string;onChange:(value:string)=>void}) {
 const api=useApi<MonthlyReport>(`/api/cegonha/monthly?competency=${competency}`);
 const [version,setVersion]=useState('live');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [reviewed,setReviewed]=useState(false),[reason,setReason]=useState('');
 const [entry,setEntry]=useState({kind:'FIXED',description:'',amount:''});
 async function mutate(payload:Record<string,unknown>) {
   setBusy(true);setError('');
   try {await apiMutation('/api/cegonha/monthly',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,competency})});setReviewed(false);setReason('');setEntry({kind:'FIXED',description:'',amount:''});api.refresh();}
   catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.');}finally{setBusy(false);}
 }
 if(api.loading)return <LoadingState label="Apurando a Cegonha…" />;
 if(api.error)return <ErrorState message={api.error} retry={api.refresh} />;
 if(!api.data)return null;
 const saved=api.data.history.find(c=>c.id===version),closed=api.data.history.find(c=>!c.reopenedAt);
 const source=saved?.snapshot??api.data.current,t=calculateMonthlyResult(source);
 const periods=[...new Set([competency,...api.data.periods.map(p=>p.competency)])].sort().reverse();
 return <div className="fleet-stack cegonha-monthly-panel">
   <section className="filter-panel fleet-monthly-filters">
     <label><span>Competência</span><input type="month" value={competency} onChange={e=>{if(e.target.value)onChange(e.target.value);}} /></label>
     <label><span>Meses registrados</span><select value={competency} onChange={e=>onChange(e.target.value)}>{periods.map(p=><option key={p} value={p}>{competencyLabel(p)}{api.data!.periods.find(m=>m.competency===p)?.closed?' · Fechado':''}</option>)}</select></label>
     <label><span>Versão da apuração</span><select value={version} onChange={e=>setVersion(e.target.value)}><option value="live">Apuração atual</option>{api.data.history.map(c=><option key={c.id} value={c.id}>Fechado em {new Date(c.closedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}{c.reopenedAt?' · Reaberto':' · Vigente'}</option>)}</select></label>
     <PdfDownloadButton url={`/api/cegonha/monthly/pdf?competency=${competency}${saved?`&closingId=${encodeURIComponent(saved.id)}`:''}`} filename={`Fechamento-Cegonha-${competency}.pdf`} />
   </section>
   {error && <p className="form-error" role="alert">{error}</p>}
   <section className="kpi-grid report-kpis">
     <article className="kpi-card"><span>Receita da Cegonha</span><strong>{formatMoney(t.revenueCents)}</strong></article>
     <article className="kpi-card"><span>Despesas totais</span><strong>{formatMoney(t.variableCostCents+t.fixedCostCents)}</strong></article>
     <article className="kpi-card accent"><span>Resultado do mês</span><strong>{formatMoney(t.resultCents)}</strong></article>
   </section>
   <section className="panel table-panel"><header className="fleet-panel-header"><div><h2>Composição do resultado</h2><p>{competencyLabel(competency)} · {saved?'Fechamento preservado':'Apuração atual'}, pela competência da venda.</p>{saved && <p>Fechado por {saved.closedByName} em {formatDate(saved.closedAt)}.{saved.reopenedAt && ` Reaberto: ${saved.reopenReason}`}</p>}{closed && !saved && <p>Há um fechamento salvo. Selecione a versão para consultar os valores preservados.</p>}{t.pendingSalesCount>0 && <p role="status" className="form-error">Resultado parcial: {t.pendingSalesCount} venda(s) com custos pendentes.</p>}</div></header>
     <div className="responsive-table"><table><thead><tr><th>Composição</th><th>Valor</th></tr></thead><tbody>{([['Receita das vendas',t.salesRevenueCents],['Outras receitas',t.otherRevenueCents],['Custos e comissões das vendas',-t.salesCostCents],['Outros custos variáveis',-t.otherVariableCents],['Custos fixos',-t.fixedCostCents],['Resultado mensal',t.resultCents]] as const).map(([name,value])=><tr key={name}><td data-label="Composição">{name}</td><td data-label="Valor">{formatMoney(value || 0)}</td></tr>)}</tbody></table></div>
   </section>
   <section className="panel table-panel"><header className="fleet-panel-header"><div><h2>Vendas incluídas</h2><p>{source.sales?.length??0} vendas Cegonha. Custos incluem a comissão registrada em cada venda.</p></div></header><div className="responsive-table"><table><thead><tr><th>Venda</th><th>Data</th><th>Cliente</th><th>Receita</th><th>Custo</th><th>Resultado</th></tr></thead><tbody>{source.sales?.map(s=><tr key={s.id}><td data-label="Venda">{s.saleNumber}</td><td data-label="Data">{formatDate(s.date)}</td><td data-label="Cliente">{s.client||'Não informado'}</td><td data-label="Receita">{formatMoney(s.revenueCents)}</td><td data-label="Custo">{formatMoney(s.costCents)}</td><td data-label="Resultado">{formatMoney(s.revenueCents-s.costCents)}</td></tr>)}{!source.sales?.length && <tr><td colSpan={6}>Nenhuma venda Cegonha nesta competência.</td></tr>}</tbody></table></div></section>
   <section className="panel table-panel"><header className="fleet-panel-header"><div><h2>Lançamentos mensais</h2><p>Inclua somente valores da Cegonha que ainda não constam nas vendas.</p></div></header>
     <div className="responsive-table"><table><thead><tr><th>Descrição</th><th>Tipo</th><th>Valor</th><th>Ação</th></tr></thead><tbody>{source.entries.map(e=><tr key={e.id}><td data-label="Descrição">{e.description}</td><td data-label="Tipo">{MONTHLY_ENTRY_LABELS[e.kind]}</td><td data-label="Valor">{formatMoney(e.amountCents)}</td><td data-label="Ação">{!saved&&!closed&&<button type="button" className="text-button" disabled={busy} onClick={()=>{if(window.confirm('Excluir este lançamento mensal?'))void mutate({action:'DELETE_ENTRY',id:e.id});}}>Excluir</button>}</td></tr>)}{!source.entries.length&&<tr><td colSpan={4}>Nenhum lançamento adicional.</td></tr>}</tbody></table></div>
     {!saved&&!closed&&<form className="filter-panel monthly-entry-form" onSubmit={e=>{e.preventDefault();void mutate({action:'ENTRY',kind:entry.kind,description:entry.description,amountCents:Math.round(Number(entry.amount)*100)});}}><label><span>Descrição</span><input required maxLength={200} value={entry.description} onChange={e=>setEntry({...entry,description:e.target.value})} /></label><label><span>Tipo</span><select value={entry.kind} onChange={e=>setEntry({...entry,kind:e.target.value})}>{Object.entries(MONTHLY_ENTRY_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><span>Valor (R$)</span><input required type="number" min="0.01" step="0.01" value={entry.amount} onChange={e=>setEntry({...entry,amount:e.target.value})} /></label><button className="button secondary" disabled={busy}>Adicionar lançamento</button></form>}
   </section>
   {api.data.canManage && !saved && <section className="panel monthly-controls"><h2>{closed?'Reabrir competência':'Salvar fechamento'}</h2>{closed?<form onSubmit={e=>{e.preventDefault();void mutate({action:'REOPEN',id:closed.id,reason});}}><label><span>Motivo da reabertura</span><input required minLength={5} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} /></label><button className="button secondary" disabled={busy}>Reabrir mês</button></form>:<form onSubmit={e=>{e.preventDefault();void mutate({action:'CLOSE',reviewed});}}><label className="monthly-review"><input type="checkbox" required checked={reviewed} onChange={e=>setReviewed(e.target.checked)} /><span>Conferi as receitas e todos os custos da Cegonha neste mês.</span></label><button className="button primary" disabled={busy||!reviewed||t.pendingSalesCount>0}>Salvar fechamento</button></form>}</section>}
 </div>;
}
