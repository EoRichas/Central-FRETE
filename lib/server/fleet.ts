import type { CurrentUser } from "@/lib/contracts";
import { allocateTripCost } from "@/lib/domain/trip-allocation";
import { cargoVehiclesOrLegacy } from "@/lib/domain/cargo-vehicles";
import { loadFleetTrips } from "@/lib/server/fleet-trips";
import { calculateTripResult } from "@/lib/domain/fleet-results";
import type {
  FleetData,
  FleetBillingData,
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
  summarizeFleet,
} from "@/lib/domain/fleet";
import { queryAll, queryFirst } from "@/lib/server/d1";

type SettingsRow = {
  fuelPriceCents: number;
  averageConsumptionMilliKmPerLiter: number;
  fallbackFixedCostPerKmCents: number;
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
  addressDetails: import("@/lib/domain/registry").RegistryAddress | null;
  email: string | null; whatsapp: string | null; notes: string | null;
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
  sellerId: string | null;
  sellerName: string | null;
  sellerCommissionBasisPoints: number;
  createdBy: string | null;
  linkedFleetSaleId: string | null;
  saleNumber: string;
  tripId: string | null;
  yardCostCents: number;
  pickupCostCents: number;
  deliveryCostCents: number;
  otherCostCents: number;
  insuranceCostCents: number;
  invoiceCostCents: number;
  icmsCostCents: number;
  cteMdfeCostCents: number;

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
  clientId: string | null;
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
  routeDistanceMeters: number | null;
  odometerStartMeters: number | null;
  odometerEndMeters: number | null;
  distanceMeters: number;
  tollCents: number;
  driverCommissionCents: number;
  createdAt: string;
  updatedAt: string;
};

async function loadParameters(): Promise<FleetParameters> {
  const row = await queryFirst<SettingsRow>(
    `select s.fuel_price_cents as fuelPriceCents,
      s.average_consumption_milli_km_per_liter as averageConsumptionMilliKmPerLiter,
      s.fallback_fixed_cost_per_km_cents as fallbackFixedCostPerKmCents,
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
  selection?: {id?: string; user?: CurrentUser},
): Promise<FleetData> {
  const startDate = competency ? `${competency}-01` : null;
  const endDate = competency ? (() => {
    const date = new Date(`${competency}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    return date.toISOString().slice(0, 10);
  })() : null;
  // Keep every member of a relevant trip so allocation is identical across months.
  const scope = selection?.id ? `with selected_freights as (select id,trip_id from fleet_freights where id=?), selected_trips as (select trip_id as id from selected_freights where trip_id is not null)` : competency ? `with selected_freights as (
    select id, trip_id from fleet_freights
    where (pickup_date >= ? and pickup_date < ?) or (billing_date >= ? and billing_date < ?)
  ), selected_trips as (
    select trip_id as id from selected_freights where trip_id is not null
    union select id from fleet_trips where operation_date >= ? and operation_date < ?
  )` : "";
  const scopeParams = selection?.id ? [selection.id] : competency ? [startDate, endDate, startDate, endDate, startDate, endDate] : [];
  const [parameters, vehicleRows, driverRows, costRows, freightRows, trips, billingSales] =
    await Promise.all([
      loadParameters(),
      queryAll<VehicleRow>(
        `select id, plate, active from fleet_vehicles
         order by active desc, plate`,
      ),
      queryAll<DriverRow>(
        `select id, name, active, cpf, address, phone, address_details as addressDetails, email, whatsapp, notes from fleet_drivers
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
        `${scope} select seller_id as sellerId,seller_name as sellerName,seller_commission_basis_points as sellerCommissionBasisPoints,created_by as createdBy,trip_id as tripId, yard_cost_cents as yardCostCents, pickup_cost_cents as pickupCostCents,
          delivery_cost_cents as deliveryCostCents, other_cost_cents as otherCostCents, insurance_cost_cents as insuranceCostCents, invoice_cost_cents as invoiceCostCents, icms_cost_cents as icmsCostCents, cte_mdfe_cost_cents as cteMdfeCostCents, actual_fuel_cost_cents as actualFuelCostCents, cargo_vehicles as cargoVehicles,
          fuel_liters_milli as fuelLitersMilli, fuel_pump_amount_cents as fuelPumpAmountCents,
          id, sale_number as saleNumber, vehicle_id as vehicleId, vehicle_plate as vehiclePlate,
          driver_id as driverId, driver_name as driverName,
          client_id as clientId, client_name as clientName, cargo_vehicle_model as cargoVehicleModel,
          cargo_plate as cargoPlate, origin, destination, origin_cep as originCep, destination_cep as destinationCep, payment_status as paymentStatus,
          paid_at as paidAt, proof_attachment_id as proofAttachmentId,
          pickup_date as pickupDate, delivery_date as deliveryDate,
          billing_date as billingDate, operational_status as operationalStatus,
          priority, freight_amount_cents as freightAmountCents,
          route_distance_meters as routeDistanceMeters, odometer_start_meters as odometerStartMeters, odometer_end_meters as odometerEndMeters, distance_meters as distanceMeters, toll_cents as tollCents,
          driver_commission_cents as driverCommissionCents,
          created_at as createdAt, updated_at as updatedAt
         , (select s.id from freight_sales s where s.fleet_freight_id=fleet_freights.id and s.sale_channel='FROTA' limit 1) as linkedFleetSaleId
         from fleet_freights
         ${scope ? 'where id in (select id from selected_freights) or trip_id in (select id from selected_trips)' : ''}
         order by pickup_date desc, created_at desc
         `, scopeParams,
      ),
      loadFleetTrips(),
      // Commercial Frota sales without an operation are real revenue too.
      // Linked sales are represented by their freight, once, on its billing date.
      freightOnly ? Promise.resolve([]) : queryAll<FleetBillingData['sales'][number]>(
        `select s.id,s.sale_number as saleNumber,s.sale_date as saleDate,s.billing_date as billingDate,
          c.legal_name as clientName,s.freight_amount_cents as freightAmountCents
         from freight_sales s left join clients c on c.id=s.client_id
         where s.sale_channel='FROTA' and s.fleet_freight_id is null and s.billing_date is not null
         ${competency ? 'and left(s.billing_date,7)=?' : ''}
         order by s.sale_date desc,s.id`, competency ? [competency] : [],
      ),
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

  const vehicleRates = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle.averageCostPerKmCents]));
  const tripsById = new Map(trips.map(trip => [trip.id, trip]));
  const membersByTrip = new Map<string, string[]>();
  for (const row of freightRows) {
    if (!row.tripId) continue;
    const members = membersByTrip.get(row.tripId) ?? [];
    members.push(row.id);
    membersByTrip.set(row.tripId, members);
  }
  const allFreights: FleetFreight[] = freightRows.map((row) => {
    const trip = row.tripId ? tripsById.get(row.tripId) : undefined;
    const memberIds = row.tripId ? membersByTrip.get(row.tripId) ?? [] : [];
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
      ...metrics,
    };
  });

  const visibleFreights = allFreights.filter(row => (!selection?.id || row.id === selection.id)
    && (selection?.user?.role !== 'VENDEDOR' || row.sellerId === selection.user.id)
    && (selection?.user?.role !== 'OPERACIONAL' || row.createdBy === selection.user.id));
  const freights = visibleFreights.filter(row => !competency || row.pickupDate.slice(0, 7) === competency);
  const billingFreights = visibleFreights.filter(row => (Boolean(row.billingDate) || row.operationalStatus === 'FATURADO') && (!competency || (row.billingDate || row.pickupDate).slice(0,7) === competency));
  const driverGroups = new Map<string, FleetBillingData['drivers'][number]>();
  for (const freight of billingFreights) {
    // Preserve historical commissions even after the driver's registration is removed.
    // Missing IDs are grouped separately by recorded name, never matched to a live homonym.
    const key = freight.driverId ?? `historical:${freight.driverName.trim().toLocaleUpperCase('pt-BR')}`;
    const group = driverGroups.get(key) ?? {id:key, name:freight.driverName || 'Motorista não informado', commissionCents:0, freights:[]};
    group.commissionCents += freight.driverCommissionCents;
    group.freights.push(freight);
    driverGroups.set(key,group);
  }
  const commissionDrivers = [...driverGroups.values()].sort((a,b) => a.name.localeCompare(b.name,'pt-BR'));
  return {
    canDeleteFreights: false,
    billing: {revenueCents: billingFreights.reduce((sum,f) => sum+f.freightAmountCents,0) + billingSales.reduce((sum,s) => sum+s.freightAmountCents,0), freightCount: billingFreights.length + billingSales.length, sales: billingSales,
      commissionCents: billingFreights.reduce((sum,f) => sum+f.driverCommissionCents,0), freights: billingFreights, drivers: commissionDrivers},
    trips: freightOnly ? [] : trips,
    tripResults: freightOnly ? [] : trips.filter(trip => !competency || trip.operationDate.slice(0, 7) === competency).map(trip => calculateTripResult(trip, allFreights)),
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

// Only the data needed to create a freight: no customer operations, billing or personal driver details.
export async function loadFleetCreationData(): Promise<import("@/lib/domain/fleet").FleetFreightFormData> {
  const [parameters, vehicles, drivers, costs] = await Promise.all([
    loadParameters(),
    queryAll<VehicleRow>("select id, plate, active from fleet_vehicles where active=1 order by plate"),
    queryAll<{id:string;name:string}>("select id, name from fleet_drivers where active=1 order by name"),
    queryAll<VehicleCostRow>(`select id, vehicle_id as vehicleId, competency, distance_meters as distanceMeters,
      monthly_cost_cents as monthlyCostCents, include_in_rate_average as includeInRateAverage
      from fleet_vehicle_costs where include_in_rate_average=1`),
  ]);
  return {
    parameters: {...parameters, officeMonthlyCostCents:null, updatedByName:null},
    vehicles: vehicles.map(vehicle => ({...vehicle, active:true, costs:[], averageCostPerKmCents:averageVehicleCostPerKmCents(costs.filter(c=>c.vehicleId===vehicle.id).map(c=>({...c, includeInRateAverage:true, costPerKmCents:c.distanceMeters>0?c.monthlyCostCents/(c.distanceMeters/1000):0})))})),
    drivers: drivers.map(driver=>({...driver, active:true, vehicleId:null, cpf:null, address:null, phone:null})),
    canEditFreights:true, canEditFreightFinancials:false, canManagePayments:false, canDeleteFreights:false,
  };
}
