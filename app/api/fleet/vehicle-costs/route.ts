import { authorize } from "@/lib/server/auth";
import { ApiError, getD1, jsonError, queryFirst } from "@/lib/server/d1";
import { parseFleetVehicleCostPayload } from "@/lib/server/fleet-validation";
import { asObject } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const user = await authorize(request, ["ADMIN", "GERENCIA"]);
    const data = parseFleetVehicleCostPayload(asObject(await request.json()));
    const vehicle = await queryFirst<{ id: string }>(
      "select id from fleet_vehicles where id = ?",
      [data.vehicleId],
    );
    if (!vehicle) throw new ApiError(400, "Veículo da frota não encontrado.");
    const id = crypto.randomUUID();
    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `insert into fleet_vehicle_costs (
            id, vehicle_id, competency, distance_meters,
            monthly_cost_cents, created_by
          ) values (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          data.vehicleId,
          data.competency,
          data.distanceMeters,
          data.monthlyCostCents,
          user.id,
        ),
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            new_value, request_id
          ) values (?, 'FLEET_VEHICLE_COST', ?, 'CREATED', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          user.id,
          user.email,
          JSON.stringify(data),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
    ]);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
