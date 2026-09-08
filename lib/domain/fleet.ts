export const FLEET_OPERATIONAL_STATUSES = [
  "SEM_PREVISAO",
  "COLETA_AGENDADA",
  "EM_ROTA",
  "NO_PATIO",
  "AGUARDANDO_CARGA",
  "ENTREGUE",
  "FATURADO",
  "COLETA_FRUSTRADA",
] as const;

export const FLEET_OPERATIONAL_STATUS_LABELS: Record<FleetOperationalStatus, string> = {
  SEM_PREVISAO: "Sem previsão",
  COLETA_AGENDADA: "Coleta agendada",
  EM_ROTA: "Em rota",
  NO_PATIO: "No pátio",
  AGUARDANDO_CARGA: "Aguardando carga",
  ENTREGUE: "Entregue",
  FATURADO: "Faturado",
  COLETA_FRUSTRADA: "Coleta frustrada",
};

export const FLEET_PRIORITIES = ["NORMAL", "URGENTE", "ATRASADO"] as const;

export const FLEET_PRIORITY_LABELS: Record<FleetPriority, string> = {
  NORMAL: "Normal",
  URGENTE: "Urgente",
  ATRASADO: "Atrasado",
};

export type FleetOperationalStatus = (typeof FLEET_OPERATIONAL_STATUSES)[number];
export type FleetPriority = (typeof FLEET_PRIORITIES)[number];

export type FleetParameters = {
  fuelPriceCents: number;
  averageConsumptionMilliKmPerLiter: number;
  fallbackFixedCostPerKmCents: number;
  matchWindowDays: number;
  officeMonthlyCostCents: number | null;
  updatedAt: string | null;
  updatedByName: string | null;
};

export type FleetVehicleCost = {
  id: string;
  vehicleId: string;
  competency: string;
  distanceMeters: number;
  monthlyCostCents: number;
  costPerKmCents: number;
};

export type FleetVehicle = {
  id: string;
  plate: string;
  active: boolean;
  averageCostPerKmCents: number | null;
  costs: FleetVehicleCost[];
};

export type FleetDriver = {
  cpf: string | null;
  address: string | null;
  phone: string | null;
  vehicleId: string | null;
  id: string;
  name: string;
  active: boolean;
};

export type FleetFreightBase = {
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
  returnUsed: boolean;
};

export type FleetFreightMetrics = {
  fuelCostCents: number;
  fixedCostCents: number;
  allocatedCostCents: number;
  totalCostCents: number;
  netRevenueCents: number;
  marginBasisPoints: number;
};

export type FleetFreight = FleetFreightBase & FleetFreightMetrics & {
  id: string;
  paymentStatus: "EM_ABERTO" | "PAGO";
  originCep: string | null;
  destinationCep: string | null;
  possibleMatch: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FleetSummary = {
  freightCount: number;
  possibleMatchCount: number;
  returnUsedCount: number;
  revenueCents: number;
  allocatedCostCents: number;
  totalCostCents: number;
  netRevenueCents: number;
  averageMarginBasisPoints: number;
};

export type FleetData = {
  parameters: FleetParameters;
  vehicles: FleetVehicle[];
  drivers: FleetDriver[];
  freights: FleetFreight[];
  summary: FleetSummary;
  canManage: boolean;
  canEditFreights: boolean;
  canManagePayments: boolean;
  freightOnly: boolean;
};

type MatchableFreight = Pick<
  FleetFreightBase,
  "origin" | "destination" | "pickupDate" | "deliveryDate"
> & { id: string };

type RateableFreight = Pick<FleetFreightBase, "pickupDate" | "distanceMeters"> & {
  id: string;
};

export const DEFAULT_FLEET_PARAMETERS: FleetParameters = {
  fuelPriceCents: 738,
  averageConsumptionMilliKmPerLiter: 3_200,
  fallbackFixedCostPerKmCents: 45,
  matchWindowDays: 3,
  officeMonthlyCostCents: null,
  updatedAt: null,
  updatedByName: null,
};

function routeKey(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("pt-BR");
}

function utcDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 86_400_000) : null;
}

export function averageVehicleCostPerKmCents(
  costs: Array<Pick<FleetVehicleCost, "distanceMeters" | "monthlyCostCents">>,
) {
  const valid = costs.filter(
    (cost) => cost.distanceMeters > 0 && cost.monthlyCostCents >= 0,
  );
  if (!valid.length) return null;
  return (
    valid.reduce(
      (total, cost) =>
        total + cost.monthlyCostCents / (cost.distanceMeters / 1_000),
      0,
    ) / valid.length
  );
}

export function allocateOfficeMonthlyCostByDistance(
  freights: RateableFreight[],
  officeMonthlyCostCents: number | null,
) {
  const result: Record<string, number> = Object.fromEntries(
    freights.map((freight) => [freight.id, 0]),
  );
  const monthlyCost = Math.max(0, Math.round(officeMonthlyCostCents ?? 0));
  if (!monthlyCost) return result;

  const byCompetency = new Map<string, RateableFreight[]>();
  for (const freight of freights) {
    const competency = /^\d{4}-\d{2}-\d{2}$/.test(freight.pickupDate)
      ? freight.pickupDate.slice(0, 7)
      : "";
    if (!competency || freight.distanceMeters <= 0) continue;
    const group = byCompetency.get(competency) ?? [];
    group.push(freight);
    byCompetency.set(competency, group);
  }

  for (const group of byCompetency.values()) {
    const totalDistance = group.reduce(
      (total, freight) => total + freight.distanceMeters,
      0,
    );
    if (totalDistance <= 0) continue;

    const shares = group.map((freight) => {
      const exact = (monthlyCost * freight.distanceMeters) / totalDistance;
      const base = Math.floor(exact);
      return { id: freight.id, base, fraction: exact - base };
    });
    let remainder = monthlyCost - shares.reduce((total, share) => total + share.base, 0);
    shares.sort((a, b) => b.fraction - a.fraction || a.id.localeCompare(b.id));
    for (const share of shares) {
      result[share.id] = share.base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
    }
  }

  return result;
}

export function calculateFleetFreightMetrics(
  freight: Pick<
    FleetFreightBase,
    "distanceMeters" | "freightAmountCents" | "tollCents" | "driverCommissionCents"
  >,
  parameters: Pick<
    FleetParameters,
    | "fuelPriceCents"
    | "averageConsumptionMilliKmPerLiter"
    | "fallbackFixedCostPerKmCents"
  >,
  vehicleCostPerKmCents: number | null,
  allocatedCostCents = 0,
): FleetFreightMetrics {
  const distanceKm = freight.distanceMeters / 1_000;
  const consumptionKmPerLiter = parameters.averageConsumptionMilliKmPerLiter / 1_000;
  const fuelCostCents = consumptionKmPerLiter > 0
    ? Math.round((distanceKm / consumptionKmPerLiter) * parameters.fuelPriceCents)
    : 0;
  const fixedRate = vehicleCostPerKmCents ?? parameters.fallbackFixedCostPerKmCents;
  const fixedCostCents = Math.round(distanceKm * fixedRate);
  const allocated = Math.max(0, Math.round(allocatedCostCents));
  const totalCostCents =
    fuelCostCents +
    freight.tollCents +
    freight.driverCommissionCents +
    fixedCostCents +
    allocated;
  const netRevenueCents = freight.freightAmountCents - totalCostCents;
  const marginBasisPoints = freight.freightAmountCents > 0
    ? Math.round((netRevenueCents * 10_000) / freight.freightAmountCents)
    : 0;

  return {
    fuelCostCents,
    fixedCostCents,
    allocatedCostCents: allocated,
    totalCostCents,
    netRevenueCents,
    marginBasisPoints,
  };
}

export function hasPossibleFleetMatch(
  freight: MatchableFreight,
  allFreights: MatchableFreight[],
  windowDays: number,
) {
  const deliveryDay = utcDay(freight.deliveryDate);
  if (deliveryDay === null || !routeKey(freight.destination)) return false;
  const deadlineDay = deliveryDay + Math.max(0, windowDays);
  const destination = routeKey(freight.destination);

  return allFreights.some((candidate) => {
    if (candidate.id === freight.id || routeKey(candidate.origin) !== destination) {
      return false;
    }
    const pickupDay = utcDay(candidate.pickupDate);
    return pickupDay !== null && pickupDay >= deliveryDay && pickupDay <= deadlineDay;
  });
}

export function summarizeFleet(freights: FleetFreight[]): FleetSummary {
  const revenueCents = freights.reduce(
    (total, freight) => total + freight.freightAmountCents,
    0,
  );
  const allocatedCostCents = freights.reduce(
    (total, freight) => total + freight.allocatedCostCents,
    0,
  );
  const totalCostCents = freights.reduce(
    (total, freight) => total + freight.totalCostCents,
    0,
  );
  const netRevenueCents = revenueCents - totalCostCents;

  return {
    freightCount: freights.length,
    possibleMatchCount: freights.filter((freight) => freight.possibleMatch).length,
    returnUsedCount: freights.filter((freight) => freight.returnUsed).length,
    revenueCents,
    allocatedCostCents,
    totalCostCents,
    netRevenueCents,
    averageMarginBasisPoints: revenueCents > 0
      ? Math.round((netRevenueCents * 10_000) / revenueCents)
      : 0,
  };
}
