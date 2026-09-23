export type CargoVehicle = { model: string | null; plate: string | null; identification: string | null };

/** Legacy records represented one unit, even when its identification was not filled. */
export function cargoVehiclesOrLegacy(vehicles: CargoVehicle[] | null | undefined, model: string | null, plate: string | null): CargoVehicle[] {
  return vehicles?.length ? vehicles : [{ model, plate, identification: null }];
}
