import { authorize } from "@/lib/server/auth";
import { ApiError, getD1, jsonError, queryFirst } from "@/lib/server/d1";
import { parseFleetVehicleCostPayload } from "@/lib/server/fleet-validation";
import { asObject } from "@/lib/server/validation";

type RouteContext = { params: Promise<{ id: string }> };
type CostSnapshot = {
  id: string;
  vehicleId: string;
  competency: string;
  distanceMeters: number;
  monthlyCostCents: number;
};

async function costSnapshot(id: string) {
  return queryFirst<CostSnapshot>(
    `select id, vehicle_id as vehicleId, competency,
      distance_meters as distanceMeters,
      monthly_cost_cents as monthlyCostCents
     from fleet_vehicle_costs where id = ?`,
    [id],
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await authorize(request, ["ADMIN", "GERENCIA"]);
    const { id } = await context.params;
    const previous = await costSnapshot(id);
    if (!previous) throw new ApiError(404, "Custo mensal não encontrado.");
    const data = parseFleetVehicleCostPayload(asObject(await request.json()));
    const vehicle = await queryFirst<{ id: string }>(
      "select id from fleet_vehicles where id = ?",
      [data.vehicleId],
    );
    if (!vehicle) throw new ApiError(400, "Veículo da frota não encontrado.");
    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `update fleet_vehicle_costs set vehicle_id = ?, competency = ?,
            distance_meters = ?, monthly_cost_cents = ?,
            updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           where id = ?`,
        )
        .bind(
          data.vehicleId,
          data.competency,
          data.distanceMeters,
          data.monthlyCostCents,
          id,
        ),
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            previous_value, new_value, request_id
          ) values (?, 'FLEET_VEHICLE_COST', ?, 'UPDATED', ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          user.id,
          user.email,
          JSON.stringify(previous),
          JSON.stringify(data),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
    ]);
    return Response.json({ id, updated: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await authorize(request, ["ADMIN", "GERENCIA"]);
    const { id } = await context.params;
    const previous = await costSnapshot(id);
    if (!previous) throw new ApiError(404, "Custo mensal não encontrado.");
    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            previous_value, request_id
          ) values (?, 'FLEET_VEHICLE_COST', ?, 'DELETED', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          user.id,
          user.email,
          JSON.stringify(previous),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
      db.prepare("delete from fleet_vehicle_costs where id = ?").bind(id),
    ]);
    return Response.json({ id, deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
