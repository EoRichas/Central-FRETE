import { authorize } from "@/lib/server/auth";
import { ApiError, jsonError } from "@/lib/server/d1";
import { currentCompetency, isCompetency } from "@/lib/domain/dates";
import { loadFleetData } from "@/lib/server/fleet";

const FLEET_VIEW_ROLES = ["ADMIN", "GERENCIA", "FINANCEIRO", "OPERACIONAL"] as const;

export async function GET(request: Request) {
  try {
    const user = await authorize(request, [...FLEET_VIEW_ROLES]);
    const competency = new URL(request.url).searchParams.get("competency") || currentCompetency();
    if (!isCompetency(competency)) throw new ApiError(400, "Competência inválida.");
    const isManager = user.role === "ADMIN" || user.role === "GERENCIA";
    const isOperational = user.role === "OPERACIONAL";
    const fleet = await loadFleetData(
      isManager,
      user.role === "ADMIN" || user.role === "FINANCEIRO",
      isManager || isOperational,
      isOperational,
      competency,
    );
    return Response.json({ fleet });
  } catch (error) {
    return jsonError(error);
  }
}
