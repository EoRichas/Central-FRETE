import { authorize } from "@/lib/server/auth";
import { getD1, jsonError } from "@/lib/server/d1";
import { resolveFleetReferences } from "@/lib/server/fleet-mutations";
import { parseFleetFreightPayload } from "@/lib/server/fleet-validation";
import { asObject } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const user = await authorize(request, ["ADMIN", "GERENCIA"]);
    const data = parseFleetFreightPayload(asObject(await request.json()));
    const { vehicle, driver } = await resolveFleetReferences(
      data.vehicleId,
      data.driverId,
    );
    const id = crypto.randomUUID();
    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `insert into fleet_freights (
            id, vehicle_id, vehicle_plate, driver_id, driver_name,
            client_name, cargo_vehicle_model, cargo_plate, origin, destination,
            pickup_date, delivery_date, billing_date, operational_status,
            priority, freight_amount_cents, distance_meters, toll_cents,
            driver_commission_cents, created_by, updated_by, origin_cep, destination_cep, trip_id, yard_cost_cents, pickup_cost_cents, delivery_cost_cents, other_cost_cents, actual_fuel_cost_cents, cargo_vehicles, fuel_liters_milli, fuel_pump_amount_cents, route_distance_meters, odometer_start_meters, odometer_end_meters
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::text::jsonb, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
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
          user.id,
          user.id,
          data.originCep, data.destinationCep,
          data.tripId, data.yardCostCents, data.pickupCostCents, data.deliveryCostCents, data.otherCostCents, data.actualFuelCostCents,
          JSON.stringify(data.cargoVehicles), data.fuelLitersMilli, data.fuelPumpAmountCents,
          data.routeDistanceMeters, data.odometerStartMeters, data.odometerEndMeters,
        ),
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            new_value, request_id
          ) values (?, 'FLEET_FREIGHT', ?, 'CREATED', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          user.id,
          user.email,
          JSON.stringify({
            ...data,
            vehiclePlate: vehicle.plate,
            driverName: driver.name,
          }),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
    ]);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
