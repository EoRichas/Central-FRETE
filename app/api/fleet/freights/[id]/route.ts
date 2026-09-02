import { authorize } from "@/lib/server/auth";
import { ApiError, getD1, jsonError, queryFirst } from "@/lib/server/d1";
import { resolveFleetReferences } from "@/lib/server/fleet-mutations";
import { parseFleetFreightPayload } from "@/lib/server/fleet-validation";
import { asObject } from "@/lib/server/validation";

type RouteContext = { params: Promise<{ id: string }> };

type FreightSnapshot = {
  id: string;
  vehicleId: string | null;
  vehiclePlate: string;
  driverId: string | null;
  driverName: string;
  clientName: string;
  cargoVehicleModel: string | null;
  cargoPlate: string | null;
  origin: string;
  destination: string;
  pickupDate: string;
  deliveryDate: string | null;
  billingDate: string | null;
  operationalStatus: string;
  priority: string;
  freightAmountCents: number;
  distanceMeters: number;
  tollCents: number;
  driverCommissionCents: number;
  returnUsed: number;
};

async function freightSnapshot(id: string) {
  return queryFirst<FreightSnapshot>(
    `select id, vehicle_id as vehicleId, vehicle_plate as vehiclePlate,
      driver_id as driverId, driver_name as driverName,
      client_name as clientName, cargo_vehicle_model as cargoVehicleModel,
      cargo_plate as cargoPlate, origin, destination,
      pickup_date as pickupDate, delivery_date as deliveryDate,
      billing_date as billingDate, operational_status as operationalStatus,
      priority, freight_amount_cents as freightAmountCents,
      distance_meters as distanceMeters, toll_cents as tollCents,
      driver_commission_cents as driverCommissionCents,
      return_used as returnUsed
     from fleet_freights where id = ?`,
    [id],
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await authorize(request, ["ADMIN", "GERENCIA"]);
    const { id } = await context.params;
    const previous = await freightSnapshot(id);
    if (!previous) throw new ApiError(404, "Frete da frota não encontrado.");
    const data = parseFleetFreightPayload(asObject(await request.json()));
    const { vehicle, driver } = await resolveFleetReferences(
      data.vehicleId,
      data.driverId,
    );
    const db = await getD1();
    const next = {
      ...data,
      vehiclePlate: vehicle.plate,
      driverName: driver.name,
    };
    await db.batch([
      db
        .prepare(
          `update fleet_freights set
            vehicle_id = ?, vehicle_plate = ?, driver_id = ?, driver_name = ?,
            client_name = ?, cargo_vehicle_model = ?, cargo_plate = ?,
            origin = ?, destination = ?, pickup_date = ?, delivery_date = ?,
            billing_date = ?, operational_status = ?, priority = ?,
            freight_amount_cents = ?, distance_meters = ?, toll_cents = ?,
            driver_commission_cents = ?, return_used = ?, updated_by = ?,
            updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           where id = ?`,
        )
        .bind(
          vehicle.id,
          vehicle.plate,
          driver.id,
          driver.name,
          data.clientName,
          data.cargoVehicleModel,
          data.cargoPlate,
          data.origin,
          data.destination,
          data.pickupDate,
          data.deliveryDate,
          data.billingDate,
          data.operationalStatus,
          data.priority,
          data.freightAmountCents,
          data.distanceMeters,
          data.tollCents,
          data.driverCommissionCents,
          data.returnUsed ? 1 : 0,
          user.id,
          id,
        ),
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            previous_value, new_value, request_id
          ) values (?, 'FLEET_FREIGHT', ?, 'UPDATED', ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          user.id,
          user.email,
          JSON.stringify({ ...previous, returnUsed: Boolean(previous.returnUsed) }),
          JSON.stringify(next),
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
    const previous = await freightSnapshot(id);
    if (!previous) throw new ApiError(404, "Frete da frota não encontrado.");
    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            previous_value, request_id
          ) values (?, 'FLEET_FREIGHT', ?, 'DELETED', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          user.id,
          user.email,
          JSON.stringify({ ...previous, returnUsed: Boolean(previous.returnUsed) }),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
      db.prepare("delete from fleet_freights where id = ?").bind(id),
    ]);
    return Response.json({ id, deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
