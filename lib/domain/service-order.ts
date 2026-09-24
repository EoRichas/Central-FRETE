import type { CargoVehicle } from './cargo-vehicles';
import type { OriginLocationType } from './operations';
export type ServiceOrderSnapshot = {
  schemaVersion: 1;
  issuer: { name: string; document: string | null; address: string | null; contact: string | null };
  saleId: string; saleNumber: string; saleDate: string;
  clientName: string | null; clientDocument: string | null; clientAddress: string | null;
  origin: string; originLocationType?: OriginLocationType | null; destination: string; destinationLocationType?: OriginLocationType | null; pickupAddress: string | null; deliveryAddress: string | null;
  cargoVehicles: CargoVehicle[]; freightAmountCents: number;
  installments: { dueDate: string; paymentMethod: string; amountCents: number }[];
  financialDueDate: string; operationalDeadlineDays: number | null; deliveryDeadline: string | null;
  notes: string | null;
};
export type ServiceOrderVersion = { orderId: string; version: number; createdAt: string; snapshot: ServiceOrderSnapshot };
export type ServiceOrderReport = { latest: ServiceOrderVersion | null; versions: {version:number;createdAt:string}[]; stale: boolean };
