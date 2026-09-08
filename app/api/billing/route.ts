import { authorize } from "@/lib/server/auth";
import { billingOverview } from "@/lib/server/billing";
import { billingEnabled } from "@/lib/server/billing-config";
import { jsonError } from "@/lib/server/d1";
export async function GET(request: Request) {
 try {
  await authorize(request, ["ADMIN", "FINANCEIRO"]);
  if (!billingEnabled()) return Response.json({ billing: { enabled: false, blocked: false, periods: [], companyName: "Central Frete", amountCents: 14999 } });
  return Response.json({ billing: await billingOverview() });
 } catch(error) { return jsonError(error); }
}
