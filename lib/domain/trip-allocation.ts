/** Equal historical shares; remainder cents go to the first IDs (stable, exact sum).
 * Actual fuel replaces only this freight's share, never the entire trip or another freight.
 */
export function allocateTripCost(totalCents: number, memberIds: string[], freightId: string): number {
  const ids = [...memberIds].sort();
  const index = ids.indexOf(freightId);
  if (index < 0 || !ids.length) return 0;
  return Math.floor(totalCents / ids.length) + (index < totalCents % ids.length ? 1 : 0);
}
export type TripCostShare = { fuelCents: number; tollCents: number; otherCents: number };
