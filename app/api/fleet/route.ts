import { authorize } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/d1";
import { loadFleetData } from "@/lib/server/fleet";

const FLEET_VIEW_ROLES = ["ADMIN", "GERENCIA", "FINANCEIRO", "OPERACIONAL"] as const;

export async function GET(request: Request) {
  try {
    const user = await authorize(request, [...FLEET_VIEW_ROLES]);
    const isManager = user.role === "ADMIN" || user.role === "GERENCIA";
    const isOperational = user.role === "OPERACIONAL";
    const fleet = await loadFleetData(
      isManager,
      user.role === "ADMIN" || user.role === "FINANCEIRO",
      isManager || isOperational,
      isOperational,
    );
    return Response.json({ fleet });
  } catch (error) {
    return jsonError(error);
  }
}
