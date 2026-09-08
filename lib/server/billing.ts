import { randomBytes } from "node:crypto";
import { billingCalendar, competenciesBetween, licenseState, shiftMonth, saoPauloDate, validCompetency } from "@/lib/domain/billing";
import { ApiError, getD1, queryAll, queryFirst } from "@/lib/server/d1";
import { billingAmountCents, billingConfig, billingEnabled } from "@/lib/server/billing-config";
import { mercadoPago, type MpPayment } from "@/lib/server/mercado-pago";
export type BillingPeriod = { competency: string; licenseKey: string; externalReference: string; checkoutUrl: string | null; paid: boolean; approvedAt: string | null };
export async function periods(): Promise<BillingPeriod[]> {
 const config = billingConfig();
 return queryAll<BillingPeriod>(`select b.competency, b.license_key as licenseKey, b.external_reference as externalReference, b.checkout_url as checkoutUrl,
 exists(select 1 from billing_payments p where p.company_id=b.company_id and p.competency=b.competency and p.status='approved') as paid,
 (select max(approved_at) from billing_payments p where p.company_id=b.company_id and p.competency=b.competency and p.status='approved') as approvedAt
 from billing_periods b where company_id=? order by competency`, [config.companyId]);
}
export async function ensurePeriod(competency: string) {
 const config = billingConfig();
 if (!validCompetency(competency) || competency < config.firstCompetency || competency > shiftMonth(billingCalendar().dueCompetency, 1)) throw new ApiError(400, "Competência fora do período permitido.");
 const db = await getD1();
 await db.prepare("insert into billing_periods(company_id, competency, external_reference, license_key) values (?, ?, ?, ?) on conflict(company_id, competency) do nothing").bind(config.companyId, competency, `cf:${config.companyId}:${competency}`, randomBytes(24).toString("hex")).run();
}
export async function billingStatus() {
 if (!billingEnabled()) return { enabled: false, blocked: false, alert: null };
 const config = billingConfig();
 const rows = await periods();
 const state = licenseState(config.firstCompetency, rows.filter(p => p.paid).map(p => p.competency));
 return { enabled: true, ...state };
}
export async function billingOverview() {
 const config = billingConfig();
 const state = await billingStatus();
 const rows = await periods();
 const calendar = billingCalendar();
 return { ...state, companyName: config.companyName, amountCents: billingAmountCents(),
  subscriptionConfigured: Boolean(process.env.MERCADO_PAGO_PLAN_ID),
  subscriptionBound: Boolean(process.env.MERCADO_PAGO_SUBSCRIPTION_ID),
  paymentConfigured: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN && process.env.MERCADO_PAGO_COLLECTOR_ID),
  periods: rows.map(p => ({ competency: p.competency, paid: p.paid, approvedAt: p.approvedAt,
   scheduled: p.paid && p.competency > calendar.activeCompetency,
   active: p.paid && p.competency === calendar.activeCompetency && !state.blocked,
   licenseKey: p.paid && p.competency <= calendar.activeCompetency ? p.licenseKey : null,
  })) };
}
export async function reconcilePayment(id: string, subscriptionCompetency?: string) {
 if (!/^\d+$/.test(id)) throw new ApiError(400, "Identificador inválido.");
 const config = billingConfig();
 const payment = await mercadoPago<MpPayment>(`/v1/payments/${id}`);
 if (String(payment.id) !== id || String(payment.collector_id) !== process.env.MERCADO_PAGO_COLLECTOR_ID || payment.currency_id !== "BRL" || Math.round(Number(payment.transaction_amount) * 100) !== billingAmountCents() || payment.live_mode !== (process.env.MERCADO_PAGO_MODE !== "test")) throw new ApiError(400, "Pagamento não corresponde à mensalidade configurada.");
 const external = payment.external_reference ?? "";
 const existing = await queryFirst<{ competency: string }>("select competency from billing_payments where payment_id=? and company_id=?", [id, config.companyId]);
 let competency = existing?.competency ?? subscriptionCompetency;
 if (!competency) {
  const row = await queryFirst<{ competency: string }>("select competency from billing_periods where external_reference=? and company_id=?", [external, config.companyId]);
  if (!row) return { ignored: true };
  competency = row.competency;
 }
 await ensurePeriod(competency);
 const status = payment.status === "approved" && Number(payment.transaction_amount_refunded ?? 0) === 0 ? "approved" : payment.status === "approved" ? "refunded" : payment.status;
 const db = await getD1();
 await db.batch([
  db.prepare(`insert into billing_payments(payment_id, company_id, competency, status, approved_at) values (?, ?, ?, ?, ?) on conflict(payment_id) do update set status=excluded.status, approved_at=excluded.approved_at, updated_at=now()`)
   .bind(id, config.companyId, competency, status, payment.date_approved ?? null),
  db.prepare(`insert into billing_email_outbox(id, company_id, competency) select ?, ?, ? where ? = 'approved' on conflict(id) do nothing`).bind(`paid:${config.companyId}:${competency}`, config.companyId, competency, status),
 ]);
 return { reconciled: true };
}
export async function reconcileSubscriptionPayment(id: string) {
 if (!/^\d+$/.test(id)) throw new ApiError(400, "Identificador inválido.");
 const invoice = await mercadoPago<{ preapproval_id: string; debit_date: string; payment?: { id: number } }>(`/authorized_payments/${id}`);
 if (!process.env.MERCADO_PAGO_SUBSCRIPTION_ID || invoice.preapproval_id !== process.env.MERCADO_PAGO_SUBSCRIPTION_ID) return { ignored: true };
 const subscription = await mercadoPago<{ preapproval_plan_id: string; payer_email: string }>(`/preapproval/${encodeURIComponent(invoice.preapproval_id)}`);
 if (subscription.preapproval_plan_id !== process.env.MERCADO_PAGO_PLAN_ID || !process.env.BILLING_PAYER_EMAIL || subscription.payer_email.toLowerCase() !== process.env.BILLING_PAYER_EMAIL.toLowerCase()) throw new ApiError(400, "Assinatura não corresponde à empresa.");
 if (!invoice.payment?.id) return { pending: true };
 const debitDate = new Date(invoice.debit_date);
 if (Number.isNaN(debitDate.getTime())) throw new ApiError(400, "Data da cobrança inválida.");
 return reconcilePayment(String(invoice.payment.id), saoPauloDate(debitDate).slice(0,7));
}
export async function runBillingMaintenance() {
 const config = billingConfig();
 const calendar = billingCalendar();
 for (const month of competenciesBetween(config.firstCompetency, calendar.dueCompetency)) await ensurePeriod(month);
 const known = await queryAll<{ paymentId: string }>("select payment_id as paymentId from billing_payments where company_id=? order by updated_at asc limit 5", [config.companyId]);
 let failures = 0;
 for (const p of known) try { await reconcilePayment(p.paymentId); } catch { failures++; }
 const rows = await periods();
 for (const p of rows.filter(p => !p.paid).slice(-3)) {
  try {
   const result = await mercadoPago<{ results: { id: number }[] }>(`/v1/payments/search?external_reference=${encodeURIComponent(p.externalReference)}&limit=100`);
   for (const item of result.results) await reconcilePayment(String(item.id));
  } catch { failures++; }
 }
 if (process.env.MERCADO_PAGO_SUBSCRIPTION_ID) {
  try {
   const result = await mercadoPago<{results: {id: number}[]}>(`/authorized_payments/search?preapproval_id=${encodeURIComponent(process.env.MERCADO_PAGO_SUBSCRIPTION_ID)}&limit=12`);
   for (const item of result.results) await reconcileSubscriptionPayment(String(item.id));
  } catch { failures++; }
 }
 return { failures };
}
