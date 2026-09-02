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
          `update fleet_drivers set name = ?, active = ?,
            updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           where id = ?`,
        )
        .bind(data.name, data.active ? 1 : 0, id),
      db
        .prepare(
          `update fleet_freights set driver_name = ?,
            updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           where driver_id = ?`,
        )
        .bind(data.name, id),
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
