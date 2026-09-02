import { authorize } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/d1";
import { loadFleetData } from "@/lib/server/fleet";

const FLEET_VIEW_ROLES = ["ADMIN", "GERENCIA", "FINANCEIRO"] as const;

export async function GET(request: Request) {
  try {
    const user = await authorize(request, [...FLEET_VIEW_ROLES]);
    const fleet = await loadFleetData(
      user.role === "ADMIN" || user.role === "GERENCIA",
    );
    return Response.json({ fleet });
  } catch (error) {
    return jsonError(error);
  }
}
