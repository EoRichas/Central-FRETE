import { ApiError } from "@/lib/server/d1";

export function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "Corpo da requisição inválido.");
  }
  return value as Record<string, unknown>;
}

export function upper(value: unknown): string | null {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  return normalized ? normalized.toLocaleUpperCase("pt-BR") : null;
}

export function lower(value: unknown): string | null {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  return normalized ? normalized.toLocaleLowerCase("pt-BR") : null;
}

export function optionalString(value: unknown): string | null {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  return normalized || null;
}

export function digits(value: unknown): string | null {
  const normalized = String(value ?? "").replace(/\D/g, "");
  return normalized || null;
}

export function requiredUpper(value: unknown, label: string): string {
  const normalized = upper(value);
  if (!normalized) throw new ApiError(400, `${label} é obrigatório.`);
  return normalized;
}

export function requiredString(value: unknown, label: string): string {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (!normalized) throw new ApiError(400, `${label} é obrigatório.`);
  return normalized;
}

export function integerInRange(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ApiError(400, `${label} deve ficar entre ${min} e ${max}.`);
  }
  return parsed;
}

export function dateOnly(value: unknown, label: string): string {
  const normalized = requiredString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new ApiError(400, `${label} deve usar o formato AAAA-MM-DD.`);
  }
  const parsed = Date.parse(`${normalized}T12:00:00Z`);
  if (!Number.isFinite(parsed)) throw new ApiError(400, `${label} é inválida.`);
  return normalized;
}

export function dateTime(value: unknown, label: string): string {
  const normalized = requiredString(value, label);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, `${label} é inválida.`);
  }
  return parsed.toISOString();
}

export function enumValue<T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[],
): T {
  const normalized = requiredString(value, label).toUpperCase() as T;
  if (!allowed.includes(normalized)) {
    throw new ApiError(400, `${label} possui valor inválido.`);
  }
  return normalized;
}

export function normalizePlate(value: unknown): string | null {
  const normalized = String(value ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  if (!normalized) return null;
  if (normalized.length !== 7) {
    throw new ApiError(400, "Placa deve possuir 7 caracteres.");
  }
  return normalized;
}
