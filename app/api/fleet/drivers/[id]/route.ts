import { authorize } from "@/lib/server/auth";
import { ApiError, getD1, jsonError, queryFirst } from "@/lib/server/d1";
import { parseFleetDriverPayload } from "@/lib/server/fleet-validation";
import { asObject } from "@/lib/server/validation";

type RouteContext = { params: Promise<{ id: string }> };
type DriverSnapshot = { id: string; name: string; active: number };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await authorize(request, ["ADMIN", "GERENCIA"]);
    const { id } = await context.params;
    const previous = await queryFirst<DriverSnapshot>(
      "select id, name, active from fleet_drivers where id = ?",
      [id],
    );
    if (!previous) throw new ApiError(404, "Motorista não encontrado.");
    const data = parseFleetDriverPayload(asObject(await request.json()));
    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `update fleet_drivers set name = ?, active = ?, cpf = ?, address = ?, phone = ?, vehicle_id = ?,
            updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           where id = ?`,
        )
        .bind(data.name, data.active ? 1 : 0, data.cpf, data.address, data.phone, data.vehicleId, id),
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            previous_value, new_value, request_id
          ) values (?, 'FLEET_DRIVER', ?, 'UPDATED', ?, ?, ?, ?, ?)`,
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
    // Lock references against concurrent inserts until the transaction completes.
    await db.batch([
      db.prepare("LOCK TABLE fleet_freights, fleet_vehicle_costs, fleet_drivers, fleet_vehicles IN SHARE ROW EXCLUSIVE MODE"),
      db.prepare(`DELETE FROM fleet_drivers WHERE id = ? AND NOT EXISTS (select id from fleet_freights where driver_id = ? limit 1)`).bind(id, id),
      db.prepare(`insert into audit_logs (id, entity_type, entity_id, action, actor_user_id, actor_email) select ?, 'fleet_drivers', ?, 'DELETED', ?, ? where not exists (select 1 from fleet_drivers where id = ?)`).bind(crypto.randomUUID(), id, user.id, user.email, id),
    ]);
    if (await queryFirst("select id from fleet_drivers where id = ?", [id])) throw new ApiError(409, "Cadastro possui fretes, custos ou vínculos. Preserve o histórico desmarcando Ativo.");
    return Response.json({ deleted: true });
  } catch (error) { return jsonError(error); }
}
