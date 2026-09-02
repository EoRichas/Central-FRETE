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
};

type FreightRow = {
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

export async function loadFleetData(canManage: boolean): Promise<FleetData> {
  const [parameters, vehicleRows, driverRows, costRows, freightRows] =
    await Promise.all([
      loadParameters(),
      queryAll<VehicleRow>(
        `select id, plate, active from fleet_vehicles
         order by active desc, plate`,
      ),
      queryAll<DriverRow>(
        `select id, name, active from fleet_drivers
         order by active desc, name`,
      ),
      queryAll<VehicleCostRow>(
        `select id, vehicle_id as vehicleId, competency,
          distance_meters as distanceMeters,
          monthly_cost_cents as monthlyCostCents
         from fleet_vehicle_costs
         order by competency desc, id`,
      ),
      queryAll<FreightRow>(
        `select id, vehicle_id as vehicleId, vehicle_plate as vehiclePlate,
          driver_id as driverId, driver_name as driverName,
          client_name as clientName, cargo_vehicle_model as cargoVehicleModel,
          cargo_plate as cargoPlate, origin, destination,
          pickup_date as pickupDate, delivery_date as deliveryDate,
          billing_date as billingDate, operational_status as operationalStatus,
          priority, freight_amount_cents as freightAmountCents,
          distance_meters as distanceMeters, toll_cents as tollCents,
          driver_commission_cents as driverCommissionCents,
          return_used as returnUsed, created_at as createdAt,
          updated_at as updatedAt
         from fleet_freights
         order by pickup_date desc, created_at desc
         limit 1000`,
      ),
    ]);

  const costsByVehicle = new Map<string, FleetVehicleCost[]>();
  for (const row of costRows) {
    const cost: FleetVehicleCost = {
      ...row,
      costPerKmCents: row.distanceMeters > 0
        ? row.monthlyCostCents / (row.distanceMeters / 1_000)
        : 0,
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
  const vehicleRates = new Map(
    vehicles.map((vehicle) => [vehicle.id, vehicle.averageCostPerKmCents]),
  );
  const drivers: FleetDriver[] = driverRows.map((row) => ({
    id: row.id,
    name: row.name,
    active: Boolean(row.active),
  }));

  const matchableFreights = freightRows.map((row) => ({
    id: row.id,
    origin: row.origin,
    destination: row.destination,
    pickupDate: row.pickupDate,
    deliveryDate: row.deliveryDate,
  }));
  const freights: FleetFreight[] = freightRows.map((row) => {
    const metrics = calculateFleetFreightMetrics(
      row,
      parameters,
      row.vehicleId ? (vehicleRates.get(row.vehicleId) ?? null) : null,
    );
    return {
      ...row,
      returnUsed: Boolean(row.returnUsed),
      ...metrics,
      possibleMatch: hasPossibleFleetMatch(
        row,
        matchableFreights,
        parameters.matchWindowDays,
      ),
    };
  });

  return {
    parameters,
    vehicles,
    drivers,
    freights,
    summary: summarizeFleet(freights),
    canManage,
  };
}
