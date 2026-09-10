import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FLEET_PARAMETERS,
  averageVehicleCostPerKmCents,
  calculateFleetFreightMetrics,
  calculateFleetFreightPreview,
} from "../lib/domain/fleet.ts";
import { decimalValue, distanceInputToMeters, distanceToInput } from "../lib/domain/number-input.ts";

const draft = {
  vehicleId: "bdc", distanceMeters: 1_200_000,
  freightAmountCents: 540_000, tollCents: 13_000, driverCommissionCents: 20_000,
};

test("distância mantém 1200 km com ou sem separador de milhar", () => {
  for (const value of ["1200", "1.200", "1.200,000", "1200,000", "1 200", 1200]) {
    assert.equal(distanceInputToMeters(value), 1_200_000, String(value));
  }
  assert.equal(distanceToInput(1_200_000), "1200");
  assert.equal(distanceInputToMeters("1.200,5"), 1_200_500);
  assert.equal(distanceInputToMeters("0,125"), 125);
  assert.equal(decimalValue("3,2", "Consumo"), 3.2);
  assert.equal(decimalValue("3.2", "Consumo"), 3.2);
});

test("formatar, abrir para edição e salvar preserva a distância em metros", () => {
  for (const meters of [0, 1, 125, 1_200, 999_999, 1_000_000, 1_200_000, 1_200_500, 100_000_000]) {
    assert.equal(distanceInputToMeters(distanceToInput(meters)), meters);
  }
});

test("números inválidos não se tornam distâncias ou parâmetros silenciosamente", () => {
  for (const value of ["", "abc", "-1200", "1.2.3", "12,34,56", "1.20,5", "Infinity", "1e3", "0x10"]) {
    assert.throws(() => distanceInputToMeters(value), /número válido/);
  }
});

// OPERACIONAL LOGÍSTICA CENTRAL: Custo Rateado km!C14:E17; Parâmetros!B13.
const history = [
  { distanceMeters: 14_345_000, monthlyCostCents: 1_054_963 },
  { distanceMeters: 9_667_000, monthlyCostCents: 1_154_584 },
  { distanceMeters: 9_702_000, monthlyCostCents: 1_232_532 },
];
const rate = averageVehicleCostPerKmCents(history)!;
const vehicles = [{id: "bdc", averageCostPerKmCents: rate}, {id: "other", averageCostPerKmCents: 200}];

test("1200 km mantém combustível e rateio da placa ao abrir, editar e salvar", () => {
  assert.ok(Math.abs(rate / 100 - 1.0667225884564662) < 1e-12);
  const metrics = calculateFleetFreightMetrics(draft, DEFAULT_FLEET_PARAMETERS, rate);
  assert.equal(metrics.fuelCostCents, 276750);
  assert.equal(metrics.allocatedCostCents, 128007);
  assert.equal(metrics.totalCostCents, 437757);
  assert.equal(metrics.netRevenueCents, 102243);
  assert.equal(metrics.costsConfigured, true);
  assert.deepEqual(calculateFleetFreightPreview({
    ...draft, distanceMeters: distanceInputToMeters(distanceToInput(draft.distanceMeters)),
  }, DEFAULT_FLEET_PARAMETERS, vehicles), metrics);
});

test("51,1 km da planilha tem R$ 54,51 de rateio e R$ 188,06 de custo total", () => {
  const metrics = calculateFleetFreightMetrics({...draft, distanceMeters:51100, freightAmountCents:33000, tollCents:570, driverCommissionCents:1000}, DEFAULT_FLEET_PARAMETERS, rate);
  assert.equal(metrics.allocatedCostCents, 5451);
  assert.equal(metrics.totalCostCents, 18806);
});

test("trocar placa usa a sua própria média; campos globais antigos não duplicam custo", () => {
  const parameters = {...DEFAULT_FLEET_PARAMETERS, fallbackFixedCostPerKmCents:99999, officeMonthlyCostCents:900000000};
  assert.equal(calculateFleetFreightPreview(draft, parameters, vehicles).allocatedCostCents, 128007);
  const other = calculateFleetFreightPreview({...draft, vehicleId:"other"}, parameters, vehicles);
  assert.equal(other.allocatedCostCents, 240000);
  assert.equal(other.totalCostCents, 549750);
});

test("média mensal é simples, não ponderada; ignora km zero e preserva mês com custo zero", () => {
  assert.equal(averageVehicleCostPerKmCents([{distanceMeters:1000,monthlyCostCents:100}, {distanceMeters:10000,monthlyCostCents:3000}]), 200);
  assert.equal(averageVehicleCostPerKmCents([{distanceMeters:0,monthlyCostCents:999999}, {distanceMeters:1000,monthlyCostCents:0}]), 0);
  assert.equal(averageVehicleCostPerKmCents([]), null);
  assert.equal(averageVehicleCostPerKmCents([{distanceMeters:NaN,monthlyCostCents:100}]), null);
});

test("base ausente não usa valor genérico e fica explicitamente pendente", () => {
  const missing = calculateFleetFreightPreview({...draft,vehicleId:"missing"},DEFAULT_FLEET_PARAMETERS,vehicles);
  assert.equal(missing.costsConfigured, false);
  assert.equal(missing.costPerKmCents, null);
  const zero = calculateFleetFreightMetrics(draft,DEFAULT_FLEET_PARAMETERS,0);
  assert.equal(zero.costsConfigured,true);
  assert.equal(zero.allocatedCostCents,0);
});
