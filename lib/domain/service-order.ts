import type { CargoVehicle } from './cargo-vehicles';
import type { OriginLocationType } from './operations';
type ServiceOrderFields = {
  issuer: { name: string; document: string | null; address: string | null; contact: string | null };
  saleId: string; saleNumber: string; saleDate: string;
  clientEmail?: string | null; clientName: string | null; clientDocument: string | null; clientAddress: string | null;
  origin: string; originLocationType?: OriginLocationType | null; destination: string; destinationLocationType?: OriginLocationType | null; pickupAddress: string | null; deliveryAddress: string | null;
  cargoVehicles: CargoVehicle[]; freightAmountCents: number;
  installments: { dueDate: string; paymentMethod: string; amountCents: number }[];
  financialDueDate: string | null; operationalDeadlineDays: number | null; deliveryDeadline: string | null;
  notes: string | null;
};
export type OperationValues = {
  freightAmountCents: number; totalOperationCostCents: number; insuranceCents: number;
  invoiceCents: number; icmsCents: number; cteMdfeCents: number; legacyCombinedTaxTransportCents: number;
};
export type ServiceOrderSnapshot = ServiceOrderFields & ({schemaVersion: 1} | {
  schemaVersion: 2;
  layoutVersion: 'central-express-20260928';
  saleChannel: 'CEGONHA' | 'FROTA';
  operationValues: OperationValues;
  operationCosts: {id: string; category: string; amountCents: number; description: string | null; occurredOn: string | null; paymentStatus: string}[];
} | { schemaVersion: 3; layoutVersion: 'central-express-client-20260928'; saleChannel: 'CEGONHA' | 'FROTA' });
export type ServiceOrderVersion = { orderId: string; version: number; createdAt: string; snapshot: ServiceOrderSnapshot };
export type ServiceOrderReport = { latest: ServiceOrderVersion | null; versions: {version:number;createdAt:string}[]; stale: boolean };
