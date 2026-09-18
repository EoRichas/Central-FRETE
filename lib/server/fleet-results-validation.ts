import { isCompetency } from '@/lib/domain/dates';
import { ApiError } from '@/lib/server/d1';
import { dateOnly, integerInRange, requiredString } from '@/lib/server/validation';

export function resultMoney(value: unknown, label: string) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') throw new ApiError(400, `${label} é obrigatório.`);
  return integerInRange(value, label, 0, 9_000_000_000_000);
}
export function resultText(value: unknown, label: string, limit: number) {
  const text = requiredString(value, label);
  if (text.length > limit) throw new ApiError(400, `${label} deve ter até ${limit} caracteres.`);
  return text;
}
export function resultCompetency(value: unknown) {
  if (typeof value !== 'string' || !isCompetency(value)) throw new ApiError(400, 'Competência inválida.');
  return value;
}
export function parseTrip(payload: Record<string, unknown>) {
  const operationDate = dateOnly(payload.operationDate, 'Data da viagem');
  if (new Date(`${operationDate}T12:00:00Z`).toISOString().slice(0, 10) !== operationDate) throw new ApiError(400, 'Data da viagem inválida.');
  const notes = String(payload.notes ?? '').trim();
  if (notes.length > 2000) throw new ApiError(400, 'Observações devem ter até 2000 caracteres.');
  return {
    name: resultText(payload.name, 'Identificação da viagem', 120),
    vehicleId: resultText(payload.vehicleId, 'Caminhão', 80),
    driverId: resultText(payload.driverId, 'Motorista', 80), operationDate,
    fuelCostCents: resultMoney(payload.fuelCostCents, 'Diesel'),
    tollCents: resultMoney(payload.tollCents, 'Pedágio'),
    otherCostCents: resultMoney(payload.otherCostCents, 'Outros custos da viagem'), notes,
  };
}
