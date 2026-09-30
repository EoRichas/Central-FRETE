import { resolveSaleSeller } from "@/lib/server/seller-commission";
import { resolveFreightClient } from "@/lib/server/registry-validation";
import { authorize } from "@/lib/server/auth";
import { ApiError, getD1, jsonError, queryAll } from "@/lib/server/d1";
import { resolveFleetReferences } from "@/lib/server/fleet-mutations";
import { parseFleetFreightPayload } from "@/lib/server/fleet-validation";
import { asObject } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const user = await authorize(request, ["ADMIN", "GERENCIA", "VENDEDOR"]);
    const payload = asObject(await request.json());
    if (payload.saleNumber != null) throw new ApiError(400, "O número da venda é gerado automaticamente.");
    if (user.role === "VENDEDOR" && payload.tripId) throw new ApiError(403, "Vendedor não pode vincular viagens administrativas.");
    const parsed = parseFleetFreightPayload(payload);
    const data = { ...parsed, ...await resolveFreightClient(parsed) };
    const { vehicle, driver } = await resolveFleetReferences(
      data.vehicleId,
      data.driverId,
    );
    const seller = user.role === 'ADMIN' && !payload.sellerId && !payload.sellerName
      ? {id: null, name: null, commissionBasisPoints: 0}
      : await resolveSaleSeller(user, payload);
    const id = crypto.randomUUID();
    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `insert into fleet_freights (
            id, seller_id, seller_name, seller_commission_basis_points, vehicle_id, vehicle_plate, driver_id, driver_name,
            client_id, client_name, cargo_vehicle_model, cargo_plate, origin, destination,
            pickup_date, delivery_date, billing_date, operational_status,
            priority, freight_amount_cents, distance_meters, toll_cents,
            driver_commission_cents, created_by, updated_by, origin_cep, destination_cep, trip_id, yard_cost_cents, pickup_cost_cents, delivery_cost_cents, other_cost_cents, actual_fuel_cost_cents, cargo_vehicles, fuel_liters_milli, fuel_pump_amount_cents, route_distance_meters, odometer_start_meters, odometer_end_meters, insurance_cost_cents, invoice_cost_cents, icms_cost_cents, cte_mdfe_cost_cents
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::text::jsonb, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          seller.id, seller.name, seller.commissionBasisPoints,
          vehicle.id,
          vehicle.plate,
          driver.id,
          driver.name,
          data.clientId,
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
          data.insuranceCostCents, data.invoiceCostCents, data.icmsCostCents, data.cteMdfeCostCents,
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
            ...data, sellerId: seller.id, sellerName: seller.name, sellerCommissionBasisPoints: seller.commissionBasisPoints,
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

export async function GET(request: Request) {
  try {
    const user = await authorize(request, ["VENDEDOR", "OPERACIONAL"]);
    const freights = await queryAll<import("@/lib/domain/fleet").SellerFreightSummary>(
      `select id, sale_number as saleNumber, client_name as clientName, origin, destination,
        pickup_date as pickupDate, freight_amount_cents as freightAmountCents
       from fleet_freights where ${user.role === 'VENDEDOR' ? 'seller_id' : 'created_by'}=? order by created_at desc, id desc limit 100`, [user.id]);
    return Response.json({freights});
  } catch (error) { return jsonError(error); }
}
