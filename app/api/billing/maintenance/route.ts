import { timingSafeEqual } from "node:crypto";
import { billingEnabled } from "@/lib/server/billing-config";
import { runBillingMaintenance } from "@/lib/server/billing";
import { deliverBillingEmails } from "@/lib/server/billing-email";
import { ApiError, jsonError } from "@/lib/server/d1";
export async function POST(request: Request) {
 try {
  const secret = process.env.BILLING_CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ApiError(401, "Acesso não autorizado.");
  if (!billingEnabled()) return Response.json({ enabled: false });
  const result = await runBillingMaintenance();
  const email = await deliverBillingEmails();
  return Response.json({ ...result, email });
 } catch(error) { return jsonError(error); }
}
