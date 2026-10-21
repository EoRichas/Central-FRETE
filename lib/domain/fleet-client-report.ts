import type { CargoVehicle } from './cargo-vehicles';

export const FLEET_RELATION_SITUATIONS = ['ENTREGA', 'RETIRA', 'EMBARQUE'] as const;
export type FleetServiceSituation = (typeof FLEET_RELATION_SITUATIONS)[number];

export type FleetClientReportRow = {
  id: string;
  saleNumber: string;
  createdDate: string;
  clientId: string;
  clientName: string;
  vehicles: CargoVehicle[];
  driverName: string | null;
  serviceSituation?: FleetServiceSituation | null;
  situation: string;
  departureDate: string | null;
  amountCents: number;
  receivedCents: number;
  receivedDates: string[];
  paid: 'Sim' | 'Não' | 'Parcial';
  notes: string;
  orderObservation?: string | null;
  orderIncludeObservation?: boolean | null;
};

export type FleetClientReport = {
  client: {id: string; name: string};
  from: string;
  to: string;
  rows: FleetClientReportRow[];
  totals: {sales: number; vehicles: number; amountCents: number; receivedCents: number; balanceCents: number};
};
export type FleetClientReportData = {
  clients: {id: string; name: string}[];
  report: FleetClientReport | null;
};

/** Date of creation in the company's timezone, not collection/billing date. */
export function creationDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Data de criação inválida.');
  return new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(date);
}

export function buildFleetClientReport(client: FleetClientReport['client'], from: string, to: string, source: FleetClientReportRow[]): FleetClientReport {
  const rows = source.filter(row => row.clientId === client.id && row.createdDate >= from && row.createdDate <= to)
    .sort((a, b) => a.createdDate.localeCompare(b.createdDate) || a.saleNumber.localeCompare(b.saleNumber, 'pt-BR', {numeric: true}));
  const totals = rows.reduce((sum, row) => ({
    sales: sum.sales + 1, vehicles: sum.vehicles + row.vehicles.length,
    amountCents: sum.amountCents + row.amountCents,
    receivedCents: sum.receivedCents + row.receivedCents,
    // Overpayment on one sale does not settle another sale automatically.
    balanceCents: sum.balanceCents + Math.max(0, row.amountCents - row.receivedCents),
  }), {sales: 0, vehicles: 0, amountCents: 0, receivedCents: 0, balanceCents: 0});
  if (Object.values(totals).some(value => !Number.isSafeInteger(value))) throw new Error('Total do relatório excede o limite de precisão.');
  return {client, from, to, rows, totals};
}

export function reportObservations(report: FleetClientReport, selectedIds: string[]): FleetClientReportRow[] {
  const selected = new Set(selectedIds);
  return report.rows.filter(row => selected.has(row.id) && row.notes.trim());
}
