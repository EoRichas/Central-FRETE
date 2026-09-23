import { allocateTripCost } from "@/lib/domain/trip-allocation";
import { cargoVehiclesOrLegacy } from "@/lib/domain/cargo-vehicles";
import { loadFleetTrips } from "@/lib/server/fleet-trips";
import { calculateTripResult } from "@/lib/domain/fleet-results";
import type {
  FleetData,
  FleetDriver,
  FleetFreight,
  FleetOperationalStatus,
  FleetParameters,
  FleetPriority,
  FleetVehicle,
  FleetVehicleCost,
} from "@/lib/domain/fleet";
import {
  DEFAULT_FLEET_PARAMETERS,
  averageVehicleCostPerKmCents,
  calculateFleetFreightMetrics,
  hasPossibleFleetMatch,
  summarizeFleet,
} from "@/lib/domain/fleet";
import { queryAll, queryFirst } from "@/lib/server/d1";

type SettingsRow = {
  fuelPriceCents: number;
  averageConsumptionMilliKmPerLiter: number;
  fallbackFixedCostPerKmCents: number;
  matchWindowDays: number;
  officeMonthlyCostCents: number | null;
  updatedAt: string;
  updatedByName: string | null;
};

type VehicleRow = {
  id: string;
  plate: string;
  active: number;
};

type DriverRow = {
  cpf: string | null;
  address: string | null;
  phone: string | null;
  id: string;
  name: string;
  active: number;
};

type VehicleCostRow = {
  id: string;
  vehicleId: string;
  competency: string;
  distanceMeters: number;
  monthlyCostCents: number;
  includeInRateAverage: number;
};

type FreightRow = {
  tripId: string | null;
  yardCostCents: number;
  pickupCostCents: number;
  deliveryCostCents: number;
  otherCostCents: number;
  actualFuelCostCents: number | null;
  cargoVehicles: import("@/lib/domain/cargo-vehicles").CargoVehicle[] | null;
  fuelLitersMilli: number | null;
  fuelPumpAmountCents: number | null;
  paidAt: string | null;
  proofAttachmentId: string | null;
  paymentStatus: "EM_ABERTO" | "PAGO";
  originCep: string | null;
  destinationCep: string | null;
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
  operationalStatus: FleetOperationalStatus;
  priority: FleetPriority;
  freightAmountCents: number;
  distanceMeters: number;
  tollCents: number;
  driverCommissionCents: number;
  returnUsed: number;
  createdAt: string;
  updatedAt: string;
};

async function loadParameters(): Promise<FleetParameters> {
  const row = await queryFirst<SettingsRow>(
    `select s.fuel_price_cents as fuelPriceCents,
      s.average_consumption_milli_km_per_liter as averageConsumptionMilliKmPerLiter,
      s.fallback_fixed_cost_per_km_cents as fallbackFixedCostPerKmCents,
      s.match_window_days as matchWindowDays,
      s.office_monthly_cost_cents as officeMonthlyCostCents,
      s.updated_at as updatedAt, u.name as updatedByName
     from fleet_settings s
     left join users u on u.id = s.updated_by
     where s.id = 'GLOBAL'`,
  );
  return row ?? { ...DEFAULT_FLEET_PARAMETERS };
}

export async function loadFleetData(
  canManage: boolean,
  canManagePayments = false,
  canEditFreights = canManage,
  freightOnly = false,
  competency?: string,
  canEditFreightFinancials = false,
): Promise<FleetData> {
  const [parameters, vehicleRows, driverRows, costRows, freightRows, trips] =
    await Promise.all([
      loadParameters(),
      queryAll<VehicleRow>(
        `select id, plate, active from fleet_vehicles
         order by active desc, plate`,
      ),
      queryAll<DriverRow>(
        `select id, name, active, cpf, address, phone from fleet_drivers
         order by active desc, name`,
      ),
      queryAll<VehicleCostRow>(
        `select id, vehicle_id as vehicleId, competency,
          distance_meters as distanceMeters,
          monthly_cost_cents as monthlyCostCents,
          include_in_rate_average as includeInRateAverage
         from fleet_vehicle_costs
         order by competency desc, id`,
      ),
      queryAll<FreightRow>(
        `select trip_id as tripId, yard_cost_cents as yardCostCents, pickup_cost_cents as pickupCostCents,
          delivery_cost_cents as deliveryCostCents, other_cost_cents as otherCostCents, actual_fuel_cost_cents as actualFuelCostCents, cargo_vehicles as cargoVehicles,
          fuel_liters_milli as fuelLitersMilli, fuel_pump_amount_cents as fuelPumpAmountCents,
          id, vehicle_id as vehicleId, vehicle_plate as vehiclePlate,
          driver_id as driverId, driver_name as driverName,
          client_name as clientName, cargo_vehicle_model as cargoVehicleModel,
          cargo_plate as cargoPlate, origin, destination, origin_cep as originCep, destination_cep as destinationCep, payment_status as paymentStatus,
          paid_at as paidAt, proof_attachment_id as proofAttachmentId,
          pickup_date as pickupDate, delivery_date as deliveryDate,
          billing_date as billingDate, operational_status as operationalStatus,
          priority, freight_amount_cents as freightAmountCents,
          distance_meters as distanceMeters, toll_cents as tollCents,
          driver_commission_cents as driverCommissionCents,
          return_used as returnUsed, created_at as createdAt,
          updated_at as updatedAt
         from fleet_freights
         order by pickup_date desc, created_at desc
         `,
      ),
      loadFleetTrips(),
    ]);

  const costsByVehicle = new Map<string, FleetVehicleCost[]>();
  for (const row of costRows) {
    const cost: FleetVehicleCost = {
      id: row.id,
      vehicleId: row.vehicleId,
      competency: row.competency,
      distanceMeters: row.distanceMeters,
      monthlyCostCents: row.monthlyCostCents,
      costPerKmCents: row.distanceMeters > 0
        ? row.monthlyCostCents / (row.distanceMeters / 1_000)
        : 0,
      includeInRateAverage: Boolean(row.includeInRateAverage),
    };
    const current = costsByVehicle.get(row.vehicleId) ?? [];
    current.push(cost);
    costsByVehicle.set(row.vehicleId, current);
  }

  const vehicles: FleetVehicle[] = vehicleRows.map((row) => {
    const costs = costsByVehicle.get(row.id) ?? [];
    return {
      id: row.id,
      plate: row.plate,
      active: Boolean(row.active),
      averageCostPerKmCents: averageVehicleCostPerKmCents(costs),
      costs,
    };
  });
  const drivers: FleetDriver[] = driverRows.map((row) => ({
    ...row,
    vehicleId: null,
    active: Boolean(row.active),
  }));

  const matchableFreights = freightRows.map((row) => ({
    id: row.id,
    origin: row.origin,
    destination: row.destination,
    pickupDate: row.pickupDate,
    deliveryDate: row.deliveryDate,
  }));
  const vehicleRates = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle.averageCostPerKmCents]));
  const allFreights: FleetFreight[] = freightRows.map((row) => {
    const trip = trips.find(t => t.id === row.tripId);
    const memberIds = freightRows.filter(f => f.tripId === row.tripId).map(f => f.id);
    const metrics = calculateFleetFreightMetrics(
      row,
      parameters,
      (row.vehicleId ? vehicleRates.get(row.vehicleId) : null) ?? null,
      trip ? { fuelCents: allocateTripCost(trip.fuelCostCents, memberIds, row.id),
        tollCents: allocateTripCost(trip.tollCents, memberIds, row.id),
        otherCents: allocateTripCost(trip.otherCostCents, memberIds, row.id) } : undefined,
    );
    return {
      ...row,
      cargoVehicles: cargoVehiclesOrLegacy(row.cargoVehicles, row.cargoVehicleModel, row.cargoPlate),
      returnUsed: Boolean(row.returnUsed),
      ...metrics,
      possibleMatch: hasPossibleFleetMatch(
        row,
        matchableFreights,
        parameters.matchWindowDays,
      ),
    };
  });

  const freights = allFreights.filter(row => !competency || row.pickupDate.slice(0, 7) === competency);
  return {
    trips,
    tripResults: trips.filter(trip => !competency || trip.operationDate.slice(0, 7) === competency).map(trip => calculateTripResult(trip, allFreights)),
    parameters,
    vehicles,
    drivers,
    freights,
    summary: summarizeFleet(freights),
    canManage,
    canEditFreights,
    canEditFreightFinancials,
    canManagePayments,
    freightOnly,
  };
}
