import { allocateTripCost } from './trip-allocation.ts';
import type { FleetFreight } from './fleet.ts';

export type FleetTrip = {
  id: string; name: string; vehicleId: string | null; driverId: string;
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
  scope?: 'FROTA';
  dateBasis?: 'BILLING_OR_PICKUP';
  sales?: {id:string; saleNumber?:string; saleChannel?:'FROTA'|'CEGONHA'; client?:string|null; date?:string; revenueCents:number; costCents:number; costsPending:boolean}[];
  competency: string;
  freights: { id: string; saleNumber?:string; date?:string; driverCommissionCents?:number; driverId?:string|null; driverName?:string; vehiclePlate?:string; fuelCostCents?:number; tollCostCents?:number; client: string; revenueCents: number; directCostCents: number;
    standaloneCostCents: number; fuelPending: boolean }[];
  trips: { id: string; name: string; date?:string; costCents: number }[];
  entries: MonthlyEntry[];
  unbilledCount: number;
};
export function calculateMonthlyResult(source: MonthlySource) {
  const sumEntries = (kind: MonthlyEntryKind) => source.entries.filter(e => e.kind === kind).reduce((sum, e) => sum + e.amountCents, 0);
  const fleetRevenueCents = source.freights.reduce((sum, f) => sum + f.revenueCents, 0);
  const salesRevenueCents = (source.sales ?? []).reduce((sum,s) => sum+s.revenueCents,0);
  const salesCostCents = (source.sales ?? []).reduce((sum,s) => sum+s.costCents,0);
  const otherRevenueCents = sumEntries('REVENUE');
  const directCostCents = source.freights.reduce((sum, f) => sum + f.directCostCents, 0);
  const transportCostCents = source.freights.reduce((sum, f) => sum + f.standaloneCostCents, 0) + source.trips.reduce((sum, t) => sum + t.costCents, 0);
  const otherVariableCents = sumEntries('VARIABLE');
  const fixedCostCents = sumEntries('FIXED');
  const revenueCents = fleetRevenueCents + salesRevenueCents + otherRevenueCents;
  const variableCostCents = directCostCents + transportCostCents + salesCostCents + otherVariableCents;
  const resultCents = revenueCents - variableCostCents - fixedCostCents;
  for (const value of [revenueCents, variableCostCents, fixedCostCents, resultCents]) {
    if (!Number.isSafeInteger(value)) throw new Error('Total mensal excede o limite de precisão.');
  }
  const fleetSalesRevenueCents = (source.sales ?? []).filter(s => s.saleChannel === 'FROTA').reduce((sum,s) => sum+s.revenueCents,0);
  const driverCommissionCents = source.freights.reduce((sum,f) => sum+(f.driverCommissionCents ?? 0),0);
  return { fleetRevenueCents, salesRevenueCents, salesCostCents, fleetSalesRevenueCents, driverCommissionCents,
    pendingSalesCount: (source.sales ?? []).filter(s => s.costsPending).length, otherRevenueCents, directCostCents, transportCostCents,
    otherVariableCents, fixedCostCents, revenueCents, variableCostCents, resultCents,
    pendingFuelCount: source.freights.filter(f => f.fuelPending).length };
}
export type MonthlyClosing = {
  id: string; competency: string; snapshot: MonthlySource; closedAt: string;
  closedByName: string; reopenedAt: string | null; reopenReason: string | null;
};
export type MonthlyReport = {
  unassignedEntries: MonthlyEntry[];
  legacyClosings: {id:string; closedAt:string}[];
  current: MonthlySource; history: MonthlyClosing[]; canManage: boolean;
  periods: {competency: string; closed: boolean; hasVehicleHistory: boolean}[];
  vehicleHistory: {id: string; vehiclePlate: string; competency: string; distanceMeters: number; monthlyCostCents: number}[];
};
