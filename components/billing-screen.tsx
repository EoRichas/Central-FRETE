"use client";
import { useEffect, useState } from "react";
import { apiMutation, useApi } from "@/components/use-api";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui";

type Billing = {
 enabled: boolean;
 blocked: boolean;
 companyName: string;
 alert?: string | null;
 nextUnpaid?: string;
 subscriptionConfigured?: boolean;
 subscriptionBound?: boolean;
 paymentConfigured?: boolean;
 paymentAvailable?: boolean;
 paymentOpensOn?: string | null;
 periods: { competency: string; paid: boolean; scheduled: boolean; active: boolean; licenseKey: string | null; approvedAt: string | null }[];
};

type CheckoutMode = "subscription" | "pix";

export function BillingScreen() {
 const api = useApi<{billing: Billing}>("/api/billing");
 const [busy, setBusy] = useState<CheckoutMode | null>(null);
 const [error, setError] = useState("");
 useEffect(() => { const timer = setInterval(api.refresh, 15000); return () => clearInterval(timer); }, [api.refresh]);

 async function pay(mode: CheckoutMode) {
  setBusy(mode); setError("");
  try {
   const result = await apiMutation<{url: string}>("/api/billing/checkout", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ mode }),
   });
   window.location.assign(result.url);
  } catch(e) {
   setError(e instanceof Error ? e.message : "Falha ao abrir pagamento.");
   setBusy(null);
  }
 }

 if (api.loading && !api.data) return <LoadingState label="Consultando licença…" />;
 if (api.error) return <ErrorState message={api.error} retry={api.refresh} />;
 const b = api.data?.billing; if (!b) return null;

 const canSubscribe = Boolean(b.paymentAvailable && b.paymentConfigured && b.subscriptionConfigured && !b.subscriptionBound);
 const canPayPix = Boolean(b.paymentAvailable && b.paymentConfigured && !b.subscriptionBound);
 const opensOn = b.paymentOpensOn ? b.paymentOpensOn.split("-").reverse().join("/") : null;

 return <div className="fleet-stack">
  <PageHeader eyebrow="Licença mensal" title="Certificado digital" description="Pagamento, validade da licença e certificados da Central Frete." />
  <section className="panel billing-card">
   <h2>{b.companyName}</h2>
   <p className="billing-price">R$ 149,99 <small>/ mês · vencimento dia 05</small></p>
   {!b.enabled ? <p>A cobrança mensal ainda não foi ativada. O acesso ao sistema permanece disponível.</p> : <>
    <p role="status">{b.alert ?? (b.blocked ? "Acesso suspenso por mensalidade pendente." : "Acompanhe sua licença e os pagamentos abaixo.")}</p>
    {b.nextUnpaid && <p>Próxima competência pendente: {b.nextUnpaid}</p>}
    {!b.paymentAvailable && opensOn && <p className="form-help">O pagamento desta competência será liberado em {opensOn}, cinco dias antes do vencimento.</p>}

    {!b.subscriptionBound ? <div className="billing-payment-options">
     <div className="billing-payment-option">
      <h3>Assinatura automática</h3>
      <p>R$ 149,99 por mês. A cobrança recorrente fica vinculada à sua conta Mercado Pago.</p>
      <button className="button primary" disabled={Boolean(busy) || !canSubscribe} onClick={() => pay("subscription")}>{busy === "subscription" ? "Abrindo…" : "Assinar automaticamente"}</button>
      {!b.subscriptionConfigured && <p className="form-help">Plano recorrente ainda não configurado.</p>}
     </div>
     <div className="billing-payment-option">
      <h3>Pix mensal</h3>
      <p>Pague somente a competência atual por Pix, sem criar cobrança automática.</p>
      <button className="button secondary" disabled={Boolean(busy) || !canPayPix} onClick={() => pay("pix")}>{busy === "pix" ? "Abrindo…" : "Pagar via Pix"}</button>
     </div>
    </div> : <p>Assinatura recorrente vinculada. O Pix mensal fica indisponível para evitar cobrança duplicada.</p>}

    <p>O acesso é atualizado após a confirmação do Mercado Pago. A nova competência passa a valer no dia 05.</p>
   </>}
   {error && <p role="alert" className="form-error">{error}</p>}
  </section>
  <section className="panel table-panel"><header><h2>Histórico de certificados</h2></header><div className="responsive-table"><table><thead><tr><th>Competência</th><th>Situação</th><th>Licença</th><th>Certificado</th></tr></thead><tbody>
   {b.periods.map(p => <tr key={p.competency}><td>{p.competency}</td><td>{p.scheduled ? "Paga — renovação agendada" : p.active ? "Paga — vigente" : p.paid ? "Paga" : "Em aberto"}</td><td className="license-key">{p.licenseKey ?? "Disponível após pagamento e início da validade"}</td><td>{p.paid && !p.scheduled ? <a className="button secondary" href={`/api/billing/certificate/${p.competency}`} aria-label={`Baixar certificado PDF da competência ${p.competency}`}>Baixar PDF</a> : <span className="form-help">{p.scheduled ? `Disponível em 05/${p.competency.slice(5)}/${p.competency.slice(0,4)}` : "Aguardando pagamento"}</span>}</td></tr>)}
   {!b.periods.length && <tr><td colSpan={4}>Nenhum certificado emitido.</td></tr>}
  </tbody></table></div></section>
 </div>;
}
