import { authorize } from "@/lib/server/auth";
import { billingCalendar, licenseState } from "@/lib/domain/billing";
import { appUrl, billingAmountCents, billingConfig, billingEnabled } from "@/lib/server/billing-config";
import { ensurePeriod, periods } from "@/lib/server/billing";
import { mercadoPago, verifiedPlan } from "@/lib/server/mercado-pago";
import { ApiError, getD1, jsonError } from "@/lib/server/d1";

type CheckoutMode = "subscription" | "pix";

export async function POST(request: Request) {
 try {
  await authorize(request, ["ADMIN", "FINANCEIRO"]);
  if (!billingEnabled()) throw new ApiError(409, "Cobrança ainda não ativada.");

  let requestedMode: CheckoutMode | undefined;
  try {
   const body = await request.json() as { mode?: string };
   if (body.mode === "subscription" || body.mode === "pix") requestedMode = body.mode;
   else if (body.mode) throw new ApiError(400, "Forma de pagamento inválida.");
  } catch (error) {
   if (error instanceof ApiError) throw error;
  }

  const mode: CheckoutMode = requestedMode ?? (process.env.BILLING_CHECKOUT_MODE === "subscription" ? "subscription" : "pix");
  const config = billingConfig();
  const rows = await periods();
  const state = licenseState(config.firstCompetency, rows.filter(p => p.paid).map(p => p.competency));

  if (mode === "subscription") {
   const plan = await verifiedPlan();
   if (process.env.MERCADO_PAGO_SUBSCRIPTION_ID) throw new ApiError(409, "Já existe uma assinatura vinculada. Regularize-a no Mercado Pago para evitar cobrança duplicada.");
   return Response.json({ url: plan.init_point, mode });
  }

  if (process.env.MERCADO_PAGO_SUBSCRIPTION_ID) throw new ApiError(409, "Existe uma assinatura recorrente vinculada. O Pix mensal fica indisponível para evitar cobrança duplicada.");

  const competency = state.nextUnpaid;
  if (competency > billingCalendar().dueCompetency) throw new ApiError(409, "As mensalidades disponíveis já estão pagas.");
  await ensurePeriod(competency);
  const period = (await periods()).find(p => p.competency === competency)!;
  if (period.paid) return Response.json({ url: `${appUrl()}/certificado`, mode });
  if (period.checkoutUrl) return Response.json({ url: period.checkoutUrl, mode });

  const amountCents = billingAmountCents();
  const result = await mercadoPago<{ id: string; init_point: string; sandbox_init_point?: string }>("/checkout/preferences", {
   method: "POST",
   headers: {"X-Idempotency-Key": period.externalReference},
   body: JSON.stringify({
    items: [{ id: competency, title: `Licença Central Frete — ${competency}`, quantity: 1, currency_id: "BRL", unit_price: amountCents / 100 }],
    external_reference: period.externalReference,
    notification_url: `${appUrl()}/api/billing/webhook`,
    back_urls: {success: `${appUrl()}/certificado`, pending: `${appUrl()}/certificado`, failure: `${appUrl()}/certificado`},
    auto_return: "approved",
    payment_methods: {installments: 1},
   }),
  });

  const checkoutUrl = process.env.MERCADO_PAGO_MODE === "test" ? result.sandbox_init_point : result.init_point;
  if (!checkoutUrl || !/^https:\/\//.test(checkoutUrl)) throw new ApiError(502, "Checkout indisponível.");
  await (await getD1()).prepare("update billing_periods set preference_id=?, checkout_url=? where company_id=? and competency=? and checkout_url is null").bind(result.id, checkoutUrl, config.companyId, competency).run();
  return Response.json({ url: (await periods()).find(p => p.competency === competency)!.checkoutUrl, mode });
 } catch(error) {
  return jsonError(error);
 }
}
