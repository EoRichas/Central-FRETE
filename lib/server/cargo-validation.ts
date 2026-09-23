import type { CargoVehicle } from '@/lib/domain/cargo-vehicles';
import { cargoVehiclesOrLegacy } from '@/lib/domain/cargo-vehicles';
import { ApiError } from '@/lib/server/d1';
import { asObject, normalizePlate } from '@/lib/server/validation';

export function boundedText(value: unknown, label: string, max: number): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > max) throw new ApiError(400, `${label} deve ter até ${max} caracteres.`);
  return value.trim() || null;
}
export function parseCargoVehicles(value: unknown, legacyModel: unknown, legacyPlate: unknown): CargoVehicle[] {
  if (value === undefined) return cargoVehiclesOrLegacy(null, boundedText(legacyModel, 'Modelo', 80), normalizePlate(legacyPlate));
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new ApiError(400, 'Informe de 1 a 100 veículos transportados.');
  return value.map((entry, index) => {
    const item = asObject(entry);
    return { model: boundedText(item.model, `Modelo do veículo ${index + 1}`, 80),
      plate: normalizePlate(boundedText(item.plate, 'Placa', 8)),
      identification: boundedText(item.identification, 'Identificação', 120) };
  });
}
export function nullableInteger(value: unknown, label: string, max: number): number | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) throw new ApiError(400, `${label} inválido.`);
  return value;
}
