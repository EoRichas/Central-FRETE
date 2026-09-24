export type FleetDistance = {
  distanceMeters: number;
  routeDistanceMeters?: number | null;
  odometerStartMeters?: number | null;
  odometerEndMeters?: number | null;
};
export function effectiveFleetDistance(value: FleetDistance): number {
  for (const [label, number, max] of [
    ["Distância", value.distanceMeters, 100_000_000],
    ["Distância pela rota", value.routeDistanceMeters, 100_000_000],
    ["KM inicial", value.odometerStartMeters, 1_000_000_000_000],
    ["KM final", value.odometerEndMeters, 1_000_000_000_000],
  ] as const) {
    if (
      number != null &&
      (!Number.isSafeInteger(number) || number < 0 || number > max)
    )
      throw new Error(`${label} inválido.`);
  }
  if (value.odometerStartMeters != null && value.odometerEndMeters != null) {
    if (value.odometerEndMeters < value.odometerStartMeters)
      throw new Error("KM final não pode ser menor que KM inicial.");
    const distance = value.odometerEndMeters - value.odometerStartMeters;
    if (distance > 100_000_000)
      throw new Error("Distância realizada inválida.");
    return distance;
  }
  return value.distanceMeters;
}
