import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FLEET_PARAMETERS,
  allocateOfficeMonthlyCostByDistance,
  calculateFleetFreightMetrics,
  calculateFleetFreightPreview,
} from "../lib/domain/fleet.ts";
import { decimalValue, distanceInputToMeters, distanceToInput } from "../lib/domain/number-input.ts";

const draft = {
  id: "a", pickupDate: "2026-09-09", distanceMeters: 1_200_000,
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

test("exemplo de 1200 km preserva combustível, custo fixo e margem ao reabrir", () => {
  const metrics = calculateFleetFreightMetrics(draft, DEFAULT_FLEET_PARAMETERS);
  assert.deepEqual(metrics, {
    fuelCostCents: 276_750, fixedCostCents: 54_000, allocatedCostCents: 0,
    totalCostCents: 363_750, netRevenueCents: 176_250, marginBasisPoints: 3_264,
  });
  assert.deepEqual(calculateFleetFreightPreview({
    ...draft, distanceMeters: distanceInputToMeters(distanceToInput(draft.distanceMeters)),
  }, DEFAULT_FLEET_PARAMETERS, [draft]), metrics);
});

test("prévia inclui frete novo e recalcula rateio por km sem duplicar o frete editado", () => {
  const parameters = {...DEFAULT_FLEET_PARAMETERS, officeMonthlyCostCents: 120_000};
  const other = {...draft, id:"b", distanceMeters:600_000};
  assert.equal(calculateFleetFreightPreview(draft, parameters, [other]).allocatedCostCents, 80_000);
  assert.equal(calculateFleetFreightPreview(draft, parameters, [draft, other]).allocatedCostCents, 80_000);
  assert.equal(calculateFleetFreightPreview({...draft, distanceMeters:600_000}, parameters, [draft, other]).allocatedCostCents, 60_000);
});

test("mudar coleta de mês recalcula a prévia na competência correta", () => {
  const parameters = {...DEFAULT_FLEET_PARAMETERS, officeMonthlyCostCents: 120_000};
  const freights = [draft, {...draft, id:"b", distanceMeters:600_000}];
  assert.equal(calculateFleetFreightPreview({...draft, pickupDate:"2026-10-01"}, parameters, freights).allocatedCostCents, 120_000);
  assert.equal(calculateFleetFreightPreview({...draft, distanceMeters:0}, parameters, freights).allocatedCostCents, 0);
  assert.equal(calculateFleetFreightPreview(draft, {...parameters, officeMonthlyCostCents:0}, freights).allocatedCostCents, 0);
  assert.equal(calculateFleetFreightPreview(draft, {...parameters, officeMonthlyCostCents:null}, freights).allocatedCostCents, 0);
});

test("rateio fecha em centavos, independentemente da ordem dos fretes", () => {
  const freights = ["a", "b", "c"].map(id => ({...draft, id, distanceMeters:1_000}));
  const allocated = allocateOfficeMonthlyCostByDistance(freights, 10_000);
  assert.deepEqual(allocated, {a:3_334, b:3_333, c:3_333});
  assert.deepEqual(allocateOfficeMonthlyCostByDistance([...freights].reverse(), 10_000), allocated);
});
