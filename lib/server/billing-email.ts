import { queryAll, queryFirst, getD1 } from "@/lib/server/d1";
import { billingConfig } from "@/lib/server/billing-config";
import { shiftMonth } from "@/lib/domain/billing";
export async function deliverBillingEmails() {
 const key = process.env.RESEND_API_KEY;
 const to = process.env.BILLING_NOTIFY_EMAIL;
 const from = process.env.BILLING_EMAIL_FROM;
 if (!key || !to || !from) return { configured: false, sent: 0 };
 const config = billingConfig(); let sent = 0;
 const pending = await queryAll<{ id: string; competency: string }>("select id, competency from billing_email_outbox where company_id=? and sent_at is null and (claimed_until is null or claimed_until < now()) order by created_at limit 20", [config.companyId]);
 for (const item of pending) {
  const row = await queryFirst<{ id: string }>("update billing_email_outbox set claimed_until=now()+interval '2 minutes', attempts=attempts+1 where id=? and sent_at is null and (claimed_until is null or claimed_until<now()) returning id", [item.id]);
  if (!row) continue;
  try {
   const payment = await queryFirst<{ approvedAt: string }>("select approved_at as approvedAt from billing_payments where company_id=? and competency=? and status='approved' order by approved_at limit 1", [config.companyId, item.competency]);
   if (!payment) continue;
   const response = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": item.id }, body: JSON.stringify({ from, to: [to], subject: `Central Frete: mensalidade ${item.competency} paga`, text: `Cliente: ${config.companyName}\nCompetência: ${item.competency}\nValor: R$ 149,99\nAprovado em: ${payment.approvedAt}\nPróximo vencimento: ${shiftMonth(item.competency, 1)}-05\nA chave da competência entra em vigor no dia 05. Pagamentos em atraso regularizam o acesso após a quitação das pendências.` }) });
   if (response.ok) { await (await getD1()).prepare("update billing_email_outbox set sent_at=now(), claimed_until=null where id=?").bind(item.id).run(); sent++; }
  } catch { /* Persisted outbox is retried by the next maintenance run. */ }
 }
 return { configured: true, sent };
}
