import { ApiError, queryFirst } from "@/lib/server/d1";

type VehicleReference = { id: string; plate: string; active: number };
type DriverReference = { id: string; name: string; active: number };

export async function resolveFleetReferences(vehicleId: string, driverId: string) {
  const [vehicle, driver] = await Promise.all([
    queryFirst<VehicleReference>(
      "select id, plate, active from fleet_vehicles where id = ?",
      [vehicleId],
    ),
    queryFirst<DriverReference>(
      "select id, name, active from fleet_drivers where id = ?",
      [driverId],
    ),
  ]);
  if (!vehicle) throw new ApiError(400, "Veículo da frota não encontrado.");
  if (!driver) throw new ApiError(400, "Motorista não encontrado.");
  return { vehicle, driver };
}
