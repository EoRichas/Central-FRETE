import { canDeleteFleetFreights } from "@/lib/domain/permissions";
import { authorize } from "@/lib/server/auth";
import { ApiError, jsonError, queryFirst } from "@/lib/server/d1";
import { loadFleetCreationData } from "@/lib/server/fleet";
import { assertFleetAccess } from "@/lib/server/seller-commission";

export async function GET(request: Request) {
  try {
    const user = await authorize(request, ["ADMIN", "GERENCIA", "FINANCEIRO", "VENDEDOR", "OPERACIONAL"]);
    const id = new URL(request.url).searchParams.get("freightId");
    let current: {vehicleId: string | null; driverId: string | null} | null = null;
    if (id) {
      await assertFleetAccess(user,id);
      current = await queryFirst("select vehicle_id as vehicleId,driver_id as driverId from fleet_freights where id=?",[id]);
      if (!current) throw new ApiError(404,"Frete da frota não encontrado.");
    }
    const fleet = await loadFleetCreationData(current ?? undefined);
    return Response.json({fleet:{...fleet,canDeleteFreights:canDeleteFleetFreights(user.role),canManagePayments:user.role === 'VENDEDOR' || fleet.canManagePayments}}, {headers:{'Cache-Control':'private, no-store'}});
  } catch (error) { return jsonError(error); }
}
