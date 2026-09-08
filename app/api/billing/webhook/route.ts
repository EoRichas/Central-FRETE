import { billingEnabled } from "@/lib/server/billing-config";
import { reconcilePayment, reconcileSubscriptionPayment } from "@/lib/server/billing";
import { validateWebhook } from "@/lib/server/mercado-pago";
import { ApiError, jsonError } from "@/lib/server/d1";
export async function POST(request: Request) {
 try {
  if (!billingEnabled()) throw new ApiError(503, "Cobrança não ativada.");
  const id = validateWebhook(request);
  const body = await request.json();
  if (String(body.data?.id) !== id) throw new ApiError(400, "Identificador divergente.");
  if (body.type === "payment") return Response.json(await reconcilePayment(id));
  if (body.type === "subscription_authorized_payment") return Response.json(await reconcileSubscriptionPayment(id));
  return Response.json({ ignored: true });
 } catch(error) { return jsonError(error); }
}
