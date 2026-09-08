import { authorize } from "@/lib/server/auth";
import { billingCalendar, licenseState } from "@/lib/domain/billing";
import { appUrl, billingConfig, billingEnabled } from "@/lib/server/billing-config";
import { ensurePeriod, periods } from "@/lib/server/billing";
import { mercadoPago, verifiedPlan } from "@/lib/server/mercado-pago";
import { ApiError, getD1, jsonError } from "@/lib/server/d1";
export async function POST(request: Request) {
 try {
  await authorize(request, ["ADMIN", "FINANCEIRO"]);
  if (!billingEnabled()) throw new ApiError(409, "Cobrança ainda não ativada.");
  const config = billingConfig();
  const rows = await periods();
  const state = licenseState(config.firstCompetency, rows.filter(p => p.paid).map(p => p.competency));
  if (process.env.BILLING_CHECKOUT_MODE === "subscription") {
   const plan = await verifiedPlan();
   if (process.env.MERCADO_PAGO_SUBSCRIPTION_ID) throw new ApiError(409, "Já existe uma assinatura vinculada. Regularize-a no Mercado Pago para evitar cobrança duplicada.");
   return Response.json({ url: plan.init_point });
  }
  // Fixed monthly invoices allow advance payment without changing the day-05
  // license boundary. Do not mix them with an active automatic subscription.
  if (process.env.MERCADO_PAGO_SUBSCRIPTION_ID) throw new ApiError(409, "Existe uma assinatura recorrente vinculada. Contate o responsável antes de gerar cobrança avulsa.");
  const competency = state.nextUnpaid;
  if (competency > billingCalendar().dueCompetency) throw new ApiError(409, "As mensalidades disponíveis já estão pagas.");
  await ensurePeriod(competency);
  const period = (await periods()).find(p => p.competency === competency)!;
  if (period.paid) return Response.json({ url: `${appUrl()}/certificado` });
  if (period.checkoutUrl) return Response.json({ url: period.checkoutUrl });
  const result = await mercadoPago<{ id: string; init_point: string; sandbox_init_point?: string }>("/checkout/preferences", {
   method: "POST", headers: {"X-Idempotency-Key": period.externalReference},
   body: JSON.stringify({ items: [{ id: competency, title: `Licença Central Frete — ${competency}`, quantity: 1, currency_id: "BRL", unit_price: 149.99 }], external_reference: period.externalReference,
    notification_url: `${appUrl()}/api/billing/webhook`, back_urls: {success: `${appUrl()}/certificado`, pending: `${appUrl()}/certificado`, failure: `${appUrl()}/certificado`}, auto_return: "approved", payment_methods: {installments: 1} }),
  });
  const checkoutUrl = process.env.MERCADO_PAGO_MODE === "test" ? result.sandbox_init_point : result.init_point;
  if (!checkoutUrl || !/^https:\/\//.test(checkoutUrl)) throw new ApiError(502, "Checkout indisponível.");
  await (await getD1()).prepare("update billing_periods set preference_id=?, checkout_url=? where company_id=? and competency=? and checkout_url is null").bind(result.id, checkoutUrl, config.companyId, competency).run();
  return Response.json({ url: (await periods()).find(p => p.competency === competency)!.checkoutUrl });
 } catch(error) { return jsonError(error); }
}
