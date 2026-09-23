import { allocateTripCost } from './trip-allocation.ts';
import type { FleetFreight } from './fleet.ts';

export type FleetTrip = {
  id: string; name: string; vehicleId: string; driverId: string;
  vehiclePlate: string; driverName: string; operationDate: string;
  fuelCostCents: number; tollCents: number; otherCostCents: number; notes: string;
};
export type TripResult = FleetTrip & {
  freights: FleetFreight[]; revenueCents: number; directCostCents: number;
  sharedCostCents: number; resultCents: number;
};
export function calculateTripResult(trip: FleetTrip, freights: FleetFreight[]): TripResult {
  const members = freights.filter(freight => freight.tripId === trip.id);
  const revenueCents = members.reduce((sum, freight) => sum + freight.freightAmountCents, 0);
  const directCostCents = members.reduce((sum, freight) => sum + freight.directCostCents, 0);
  const fuelCostCents = members.length ? members.reduce((sum, freight) => sum + (freight.actualFuelCostCents ?? allocateTripCost(trip.fuelCostCents, members.map(f => f.id), freight.id)), 0) : trip.fuelCostCents;
  const sharedCostCents = fuelCostCents + trip.tollCents + trip.otherCostCents;
  return { ...trip, freights: members, revenueCents, directCostCents, sharedCostCents,
    resultCents: revenueCents - directCostCents - sharedCostCents };
}
export type MonthlyEntryKind = 'REVENUE' | 'VARIABLE' | 'FIXED';
export const MONTHLY_ENTRY_LABELS: Record<MonthlyEntryKind, string> = {
  REVENUE: 'Outra receita', VARIABLE: 'Outro custo variável', FIXED: 'Custo fixo',
};
export type MonthlyEntry = {
  id: string; kind: MonthlyEntryKind; description: string; amountCents: number;
};
export type MonthlySource = {
  competency: string;
  freights: { id: string; client: string; revenueCents: number; directCostCents: number;
    standaloneCostCents: number; fuelPending: boolean }[];
  trips: { id: string; name: string; costCents: number }[];
  entries: MonthlyEntry[];
  unbilledCount: number;
};
export function calculateMonthlyResult(source: MonthlySource) {
  const sumEntries = (kind: MonthlyEntryKind) => source.entries.filter(e => e.kind === kind).reduce((sum, e) => sum + e.amountCents, 0);
  const fleetRevenueCents = source.freights.reduce((sum, f) => sum + f.revenueCents, 0);
  const otherRevenueCents = sumEntries('REVENUE');
  const directCostCents = source.freights.reduce((sum, f) => sum + f.directCostCents, 0);
  const transportCostCents = source.freights.reduce((sum, f) => sum + f.standaloneCostCents, 0) + source.trips.reduce((sum, t) => sum + t.costCents, 0);
  const otherVariableCents = sumEntries('VARIABLE');
  const fixedCostCents = sumEntries('FIXED');
  const revenueCents = fleetRevenueCents + otherRevenueCents;
  const variableCostCents = directCostCents + transportCostCents + otherVariableCents;
  const resultCents = revenueCents - variableCostCents - fixedCostCents;
  for (const value of [revenueCents, variableCostCents, fixedCostCents, resultCents]) {
    if (!Number.isSafeInteger(value)) throw new Error('Total mensal excede o limite de precisão.');
  }
  return { fleetRevenueCents, otherRevenueCents, directCostCents, transportCostCents,
    otherVariableCents, fixedCostCents, revenueCents, variableCostCents, resultCents,
    pendingFuelCount: source.freights.filter(f => f.fuelPending).length };
}
export type MonthlyClosing = {
  id: string; competency: string; snapshot: MonthlySource; closedAt: string;
  closedByName: string; reopenedAt: string | null; reopenReason: string | null;
};
export type MonthlyReport = {
  current: MonthlySource; history: MonthlyClosing[]; canManage: boolean;
};
