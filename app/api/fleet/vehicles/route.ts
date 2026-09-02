import { authorize } from "@/lib/server/auth";
import { getD1, jsonError } from "@/lib/server/d1";
import { parseFleetVehiclePayload } from "@/lib/server/fleet-validation";
import { asObject } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const user = await authorize(request, ["ADMIN", "GERENCIA"]);
    const data = parseFleetVehiclePayload(asObject(await request.json()));
    const id = crypto.randomUUID();
    const db = await getD1();
    await db.batch([
      db
        .prepare("insert into fleet_vehicles (id, plate, active) values (?, ?, ?)")
        .bind(id, data.plate, data.active ? 1 : 0),
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            new_value, request_id
          ) values (?, 'FLEET_VEHICLE', ?, 'CREATED', ?, ?, ?, ?)`,
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
