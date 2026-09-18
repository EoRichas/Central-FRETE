import type { FleetTrip } from '@/lib/domain/fleet-results';
import { queryAll } from '@/lib/server/d1';
export async function loadFleetTrips(): Promise<FleetTrip[]> {
  return queryAll<FleetTrip>(`select t.id, t.name, t.vehicle_id as vehicleId, t.driver_id as driverId,
    v.plate as vehiclePlate, d.name as driverName, t.operation_date as operationDate,
    t.fuel_cost_cents as fuelCostCents, t.toll_cents as tollCents, t.other_cost_cents as otherCostCents, t.notes
    from fleet_trips t join fleet_vehicles v on v.id = t.vehicle_id join fleet_drivers d on d.id = t.driver_id
    order by t.operation_date desc, t.id`);
}
