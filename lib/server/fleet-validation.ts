import {
  FLEET_OPERATIONAL_STATUSES,
  FLEET_PRIORITIES,
  type FleetOperationalStatus,
  type FleetPriority,
} from "@/lib/domain/fleet";
import { ApiError } from "@/lib/server/d1";
import {
  dateOnly,
  enumValue,
  integerInRange,
  normalizePlate,
  optionalString,
  requiredString,
  requiredUpper,
  upper,
} from "@/lib/server/validation";

import { validCpf } from "@/lib/domain/identity";

const MAX_MONEY_CENTS = 9_000_000_000_000;

function boundedRequiredUpper(value: unknown, label: string, maxLength: number) {
  const normalized = requiredUpper(value, label);
  if (normalized.length > maxLength) {
    throw new ApiError(400, `${label} deve possuir no máximo ${maxLength} caracteres.`);
  }
  return normalized;
}

function boundedOptionalUpper(value: unknown, label: string, maxLength: number) {
  const normalized = upper(value);
  if (normalized && normalized.length > maxLength) {
    throw new ApiError(400, `${label} deve possuir no máximo ${maxLength} caracteres.`);
  }
  return normalized;
}

function entityId(value: unknown, label: string) {
  const id = requiredString(value, label);
  if (id.length > 80) throw new ApiError(400, `${label} é inválido.`);
  return id;
}

function optionalDate(value: unknown, label: string) {
  return optionalString(value) ? dateOnly(value, label) : null;
}

export function booleanValue(value: unknown, label: string) {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  throw new ApiError(400, `${label} é inválido.`);
}

export function parseFleetFreightPayload(payload: Record<string, unknown>) {
  return {
    vehicleId: entityId(payload.vehicleId, "Veículo da frota"),
    driverId: entityId(payload.driverId, "Motorista"),
    clientName: boundedRequiredUpper(payload.clientName, "Cliente", 140),
    cargoVehicleModel: boundedOptionalUpper(
      payload.cargoVehicleModel,
      "Modelo do veículo transportado",
      80,
    ),
    cargoPlate: normalizePlate(payload.cargoPlate),
    originCep: optionalCep(payload.originCep),
    destinationCep: optionalCep(payload.destinationCep),
    origin: boundedRequiredUpper(payload.origin, "Origem", 180),
    destination: boundedRequiredUpper(payload.destination, "Destino", 180),
    pickupDate: dateOnly(payload.pickupDate, "Data da coleta"),
    deliveryDate: optionalDate(payload.deliveryDate, "Data da entrega"),
    billingDate: optionalDate(payload.billingDate, "Data do faturamento"),
    operationalStatus: enumValue<FleetOperationalStatus>(
      payload.operationalStatus,
      "Status operacional",
      FLEET_OPERATIONAL_STATUSES,
    ),
    priority: enumValue<FleetPriority>(
      payload.priority,
      "Prioridade",
      FLEET_PRIORITIES,
    ),
    freightAmountCents: integerInRange(
      payload.freightAmountCents,
      "Valor do frete",
      0,
      MAX_MONEY_CENTS,
    ),
    distanceMeters: integerInRange(
      payload.distanceMeters,
      "Distância",
      0,
      100_000_000,
    ),
    tollCents: integerInRange(
      payload.tollCents,
      "Pedágio",
      0,
      MAX_MONEY_CENTS,
    ),
    driverCommissionCents: integerInRange(
      payload.driverCommissionCents,
      "Motorista / comissão",
      0,
      MAX_MONEY_CENTS,
    ),
    returnUsed: booleanValue(payload.returnUsed, "Retorno aproveitado"),
  };
}

export function parseFleetSettingsPayload(payload: Record<string, unknown>) {
  const officeValue = optionalString(payload.officeMonthlyCostCents);
  return {
    fuelPriceCents: integerInRange(
      payload.fuelPriceCents,
      "Preço do combustível",
      0,
      1_000_000,
    ),
    averageConsumptionMilliKmPerLiter: integerInRange(
      payload.averageConsumptionMilliKmPerLiter,
      "Consumo médio",
      1,
      100_000,
    ),
    fallbackFixedCostPerKmCents: integerInRange(
      payload.fallbackFixedCostPerKmCents,
      "Custo fixo padrão por km",
      0,
      1_000_000,
    ),
    matchWindowDays: integerInRange(
      payload.matchWindowDays,
      "Janela de encaixe",
      0,
      90,
    ),
    officeMonthlyCostCents: officeValue === null
      ? null
      : integerInRange(
          payload.officeMonthlyCostCents,
          "Custo fixo mensal do escritório",
          0,
          MAX_MONEY_CENTS,
        ),
  };
}

export function parseFleetVehiclePayload(payload: Record<string, unknown>) {
  const plate = normalizePlate(payload.plate);
  if (!plate) throw new ApiError(400, "Placa do veículo é obrigatória.");
  return {
    plate,
    active: "active" in payload
      ? booleanValue(payload.active, "Situação do veículo")
      : true,
  };
}

export function parseFleetDriverPayload(payload: Record<string, unknown>) {
  const cpf = String(payload.cpf ?? "").replace(/\D/g, "");
  if (!validCpf(cpf)) throw new ApiError(400, "Informe um CPF válido.");
  const phone = String(payload.phone ?? "").replace(/\D/g, "");
  if (!/^\d{10,13}$/.test(phone)) throw new ApiError(400, "Informe telefone com DDD.");
  const name = boundedRequiredUpper(payload.name, "Nome completo", 120);
  if (!name.includes(" ")) throw new ApiError(400, "Informe o nome completo do motorista.");
  return {
    cpf,
    phone,
    address: boundedRequiredUpper(payload.address, "Endereço", 300),
    vehicleId: null,
    name: boundedRequiredUpper(payload.name, "Nome do motorista", 120),
    active: "active" in payload
      ? booleanValue(payload.active, "Situação do motorista")
      : true,
  };
}

export function parseFleetVehicleCostPayload(payload: Record<string, unknown>) {
  const competency = requiredString(payload.competency, "Competência");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competency)) {
    throw new ApiError(400, "Competência deve usar o formato AAAA-MM.");
  }
  return {
    vehicleId: entityId(payload.vehicleId, "Veículo"),
    competency,
    distanceMeters: integerInRange(
      payload.distanceMeters,
      "Quilometragem do mês",
      1,
      100_000_000,
    ),
    monthlyCostCents: integerInRange(
      payload.monthlyCostCents,
      "Custo do mês",
      0,
      MAX_MONEY_CENTS,
    ),
  };
}

function optionalCep(value: unknown) {
  const cep = String(value ?? "").replace(/\D/g, "");
  if (cep && !/^\d{8}$/.test(cep)) throw new ApiError(400, "CEP deve possuir 8 dígitos.");
  return cep || null;
}
