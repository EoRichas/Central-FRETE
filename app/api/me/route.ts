import { authorize } from "@/lib/server/auth";
import { billingStatus } from "@/lib/server/billing";
import { jsonError } from "@/lib/server/d1";

export async function GET(request: Request) {
  try {
    const user = await authorize(request);
    const license = await billingStatus();
    return Response.json({ user, license: { enabled: license.enabled, blocked: license.blocked, alert: user.role === "ADMIN" ? license.alert : null } }, { headers: {"Cache-Control": "no-store"} });
  } catch (error) {
    return jsonError(error);
  }
}

