import { freightForViewer } from "@/lib/server/seller-commission";
import { authorize } from "@/lib/server/auth";
import { ApiError, jsonError } from "@/lib/server/d1";
import { currentCompetency, isCompetency } from "@/lib/domain/dates";
import { loadFleetData } from "@/lib/server/fleet";

const FLEET_VIEW_ROLES = ["ADMIN", "GERENCIA", "FINANCEIRO", "OPERACIONAL"] as const;

export async function GET(request: Request) {
  try {
    const user = await authorize(request, [...FLEET_VIEW_ROLES]);
    const params = new URL(request.url).searchParams;
    const competency = params.get("period") === "all" ? undefined : params.get("competency") || currentCompetency();
    if (competency && !isCompetency(competency)) throw new ApiError(400, "Competência inválida.");
    const isManager = user.role === "ADMIN" || user.role === "GERENCIA";
    const isOperational = user.role === "OPERACIONAL";
    const fleet = await loadFleetData(
      isManager,
      user.role === "ADMIN" || user.role === "FINANCEIRO" || isOperational,
      isManager || isOperational,
      isOperational,
      competency,
      user.role === "FINANCEIRO",
      {user},
    );
    fleet.canDeleteFreights = user.role === "ADMIN";
    return Response.json({ fleet: {...fleet,
      freights: fleet.freights.map(f => freightForViewer(f,user)),
      billing: {...fleet.billing,freights: fleet.billing.freights.map(f => freightForViewer(f,user)),drivers: fleet.billing.drivers.map(d => ({...d,freights:d.freights.map(f=>freightForViewer(f,user))}))},
      tripResults: fleet.tripResults.map(t=>({...t,freights:t.freights.map(f=>freightForViewer(f,user))})),
    } });
  } catch (error) {
    return jsonError(error);
  }
}
