import { authorize } from "@/lib/server/auth";
import { ApiError, getD1, jsonError, queryFirst } from "@/lib/server/d1";
import { parseFleetVehiclePayload } from "@/lib/server/fleet-validation";
import { asObject } from "@/lib/server/validation";

type RouteContext = { params: Promise<{ id: string }> };
type VehicleSnapshot = { id: string; plate: string; active: number };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await authorize(request, ["ADMIN", "GERENCIA"]);
    const { id } = await context.params;
    const previous = await queryFirst<VehicleSnapshot>(
      "select id, plate, active from fleet_vehicles where id = ?",
      [id],
    );
    if (!previous) throw new ApiError(404, "Veículo da frota não encontrado.");
    const data = parseFleetVehiclePayload(asObject(await request.json()));
    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `update fleet_vehicles set plate = ?, active = ?,
            updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           where id = ?`,
        )
        .bind(data.plate, data.active ? 1 : 0, id),
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            previous_value, new_value, request_id
          ) values (?, 'FLEET_VEHICLE', ?, 'UPDATED', ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          user.id,
          user.email,
          JSON.stringify({ ...previous, active: Boolean(previous.active) }),
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
    const db = await getD1();
    const results = await db.batch([
      db.prepare(`with deleted as (delete from fleet_vehicles where id=? returning *)
        insert into audit_logs(id,entity_type,entity_id,action,actor_user_id,actor_email,previous_value)
        select ?, 'FLEET_VEHICLE', id, 'DELETED', ?, ?, row_to_json(deleted)::text from deleted returning entity_id`)
        .bind(id, crypto.randomUUID(), user.id, user.email),
    ]);
    if (!results[0].results.length) throw new ApiError(404, "Veículo da frota não encontrado.");
    return Response.json({ deleted: true });
  } catch (error) { return jsonError(error); }
}
