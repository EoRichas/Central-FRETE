"use client";
import { useEffect, useState } from "react";
import { apiMutation, useApi } from "@/components/use-api";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui";
type Billing = { enabled: boolean; blocked: boolean; companyName: string; alert?: string | null; nextUnpaid?: string; subscriptionConfigured?: boolean; subscriptionBound?: boolean; paymentConfigured?: boolean; periods: { competency: string; paid: boolean; scheduled: boolean; active: boolean; licenseKey: string | null; approvedAt: string | null }[] };
export function BillingScreen() {
 const api = useApi<{billing: Billing}>("/api/billing");
 const [busy, setBusy] = useState(false); const [error, setError] = useState("");
 useEffect(() => { const timer = setInterval(api.refresh, 15000); return () => clearInterval(timer); }, [api.refresh]);
 async function pay() {
  setBusy(true); setError("");
  try { const result = await apiMutation<{url: string}>("/api/billing/checkout", {method: "POST"}); window.location.assign(result.url); }
  catch(e) { setError(e instanceof Error ? e.message : "Falha ao abrir pagamento."); setBusy(false); }
 }
 if (api.loading && !api.data) return <LoadingState label="Consultando licença…" />;
 if (api.error) return <ErrorState message={api.error} retry={api.refresh} />;
 const b = api.data?.billing; if (!b) return null;
 return <div className="fleet-stack">
  <PageHeader eyebrow="Licença mensal" title="Certificado digital" description="Pagamento, validade da licença e certificados da Central Frete." />
  <section className="panel billing-card"><h2>{b.companyName}</h2><p className="billing-price">R$ 149,99 <small>/ mês · vencimento dia 05</small></p>
   {!b.enabled ? <p>A cobrança mensal ainda não foi ativada. O acesso ao sistema permanece disponível.</p> : <>
    <p role="status">{b.alert ?? (b.blocked ? "Acesso suspenso por mensalidade pendente." : "Acompanhe sua licença e os pagamentos abaixo.")}</p>
    {b.nextUnpaid && <p>Próxima competência pendente: {b.nextUnpaid}</p>}
    <button className="button primary" disabled={busy || !b.paymentConfigured} onClick={pay}>{busy ? "Abrindo…" : "Pagar no Mercado Pago"}</button>
    <p>O acesso é atualizado após a confirmação do Mercado Pago. Pagamentos antecipados renovam a chave no dia 05.</p>
    {b.subscriptionBound && <p>Assinatura recorrente vinculada. Regularize a cobrança na sua conta Mercado Pago.</p>}
   </>}
   {error && <p role="alert" className="form-error">{error}</p>}
  </section>
  <section className="panel table-panel"><header><h2>Histórico de certificados</h2></header><div className="responsive-table"><table><thead><tr><th>Competência</th><th>Situação</th><th>Licença</th><th>Certificado</th></tr></thead><tbody>
   {b.periods.map(p => <tr key={p.competency}><td>{p.competency}</td><td>{p.scheduled ? "Paga — renovação agendada" : p.active ? "Paga — vigente" : p.paid ? "Paga" : "Em aberto"}</td><td className="license-key">{p.licenseKey ?? "Disponível após pagamento e início da validade"}</td><td>{p.paid && !p.scheduled && <a href={`/api/billing/certificate/${p.competency}`}>Baixar PDF</a>}</td></tr>)}
   {!b.periods.length && <tr><td colSpan={4}>Nenhum certificado emitido.</td></tr>}
  </tbody></table></div></section>
 </div>;
}
