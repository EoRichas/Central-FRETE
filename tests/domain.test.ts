import assert from "node:assert/strict";
import test from "node:test";
import { operationalCommissionCents, sellerCommissionCents } from "../lib/domain/commissions.ts";
import { calculateSaleFinancials, commissionCents } from "../lib/domain/finance.ts";
import {
  averageVehicleCostPerKmCents,
  calculateFleetFreightMetrics,
  hasPossibleFleetMatch,
  summarizeFleet,
} from "../lib/domain/fleet.ts";
import { calculateDestinationArrivalDate, normalizeCostCategory } from "../lib/domain/operations.ts";
import { roleCan } from "../lib/domain/permissions.ts";
import {
  createPasswordCredential,
  createUserSessionToken,
  LOCAL_SESSION_COOKIE,
  verifyLocalSession,
  verifyPassword,
} from "../lib/server/local-session.ts";

test("calcula comissão, custos, margem e recebimento parcial em centavos", () => {
  const result = calculateSaleFinancials({
    freightAmountCents: 100_000,
    commissionBasisPoints: 700,
    expenseAmountsCents: [20_000, 5_000],
    transactions: [{ type: "ADIANTAMENTO", status: "CONFIRMADO", amountCents: 30_000 }],
    dueDate: "2026-08-30",
    asOfDate: "2026-08-25",
  });

  assert.equal(result.commissionCents, 7_000);
  assert.equal(result.transportCostCents, 32_000);
  assert.equal(result.marginCents, 68_000);
  assert.equal(result.totalReceivedCents, 30_000);
  assert.equal(result.balanceCents, 70_000);
  assert.equal(result.status, "EM_ABERTO");
  assert.equal(result.isPartial, true);
});

test("mantém os percentuais de comissão do vendedor e da operação", () => {
  assert.equal(commissionCents(10_000, 700), 700);
  assert.equal(sellerCommissionCents(100_000), 7_000);
  assert.equal(operationalCommissionCents(100_000), 3_000);
});

test("calcula combustível, custo fixo e margem da frota", () => {
  const vehicleRate = averageVehicleCostPerKmCents([
    { distanceMeters: 4_948_000, monthlyCostCents: 617_413 },
    { distanceMeters: 3_193_000, monthlyCostCents: 617_413 },
    { distanceMeters: 4_698_000, monthlyCostCents: 809_110 },
  ]);
  assert.ok(vehicleRate);
  assert.equal(Math.round(vehicleRate), 163);

  const metrics = calculateFleetFreightMetrics(
    {
      distanceMeters: 51_100,
      freightAmountCents: 33_000,
      tollCents: 570,
      driverCommissionCents: 1_000,
    },
    {
      fuelPriceCents: 738,
      averageConsumptionMilliKmPerLiter: 3_200,
      fallbackFixedCostPerKmCents: 45,
    },
    vehicleRate,
  );

  assert.equal(metrics.fuelCostCents, 11_785);
  assert.equal(metrics.fixedCostCents, 8_353);
  assert.equal(metrics.totalCostCents, 21_708);
  assert.equal(metrics.netRevenueCents, 11_292);
  assert.equal(metrics.marginBasisPoints, 3_422);
});

test("usa custo fixo padrão quando o veículo não possui histórico", () => {
  const metrics = calculateFleetFreightMetrics(
    {
      distanceMeters: 10_000,
      freightAmountCents: 10_000,
      tollCents: 0,
      driverCommissionCents: 0,
    },
    {
      fuelPriceCents: 700,
      averageConsumptionMilliKmPerLiter: 3_500,
      fallbackFixedCostPerKmCents: 50,
    },
    null,
  );
  assert.equal(metrics.fixedCostCents, 500);
});

test("identifica encaixe de retorno dentro da janela operacional", () => {
  const freights = [
    {
      id: "ida",
      origin: "São Bernardo do Campo / SP",
      destination: "Taboão da Serra / SP",
      pickupDate: "2026-07-17",
      deliveryDate: "2026-07-17",
    },
    {
      id: "volta",
      origin: "  TABOÃO DA SERRA / SP ",
      destination: "São Bernardo do Campo / SP",
      pickupDate: "2026-07-19",
      deliveryDate: "2026-07-19",
    },
  ];

  assert.equal(hasPossibleFleetMatch(freights[0], freights, 3), true);
  assert.equal(hasPossibleFleetMatch(freights[0], freights, 1), false);
});

test("resume a frota ponderando a margem pelo faturamento", () => {
  const summary = summarizeFleet([
    {
      freightAmountCents: 10_000,
      totalCostCents: 4_000,
      returnUsed: true,
      possibleMatch: false,
    },
    {
      freightAmountCents: 30_000,
      totalCostCents: 21_000,
      returnUsed: false,
      possibleMatch: true,
    },
  ] as never);

  assert.deepEqual(summary, {
    freightCount: 2,
    possibleMatchCount: 1,
    returnUsedCount: 1,
    revenueCents: 40_000,
    totalCostCents: 25_000,
    netRevenueCents: 15_000,
    averageMarginBasisPoints: 3_750,
  });
});

test("preserva o cálculo de prazo e a normalização de ICMS", () => {
  assert.equal(calculateDestinationArrivalDate("2026-08-25", 5), "2026-08-30");
  assert.equal(calculateDestinationArrivalDate("2026-08-25", 0), "");
  assert.equal(normalizeCostCategory("CTE_MDFE"), "ICMS");
});

test("respeita as permissões de cada perfil", () => {
  assert.equal(roleCan("ADMIN", "MANAGE_USERS"), true);
  assert.equal(roleCan("VENDEDOR", "MANAGE_USERS"), false);
  assert.equal(roleCan("FINANCEIRO", "MANAGE_PAYMENTS"), true);
  assert.equal(roleCan("GERENCIA", "IMPORT_DATA"), false);
});

test("armazena somente o hash da senha e rejeita credenciais incorretas", async () => {
  const credential = await createPasswordCredential("senha-de-teste");
  assert.notEqual(credential.passwordHash, "senha-de-teste");
  assert.equal(await verifyPassword("senha-de-teste", credential.passwordSalt, credential.passwordHash), true);
  assert.equal(await verifyPassword("senha-incorreta", credential.passwordSalt, credential.passwordHash), false);
});

test("cria e verifica uma sessão assinada do administrador", async () => {
  const previousSecret = process.env.CENTRAL_FRETE_SESSION_SECRET;
  process.env.CENTRAL_FRETE_SESSION_SECRET = "segredo-de-teste-com-pelo-menos-32-caracteres";

  try {
    const token = await createUserSessionToken({
      id: "user-1",
      email: "admin@centralfrete.local",
      username: "admin",
      name: "ADMINISTRADOR",
    });
    const request = new Request("https://central-frete.example/inicio", {
      headers: { cookie: `${LOCAL_SESSION_COOKIE}=${token}` },
    });
    const session = await verifyLocalSession(request);
    assert.equal(session?.username, "admin");
    assert.equal(session?.userId, "user-1");
  } finally {
    if (previousSecret === undefined) delete process.env.CENTRAL_FRETE_SESSION_SECRET;
    else process.env.CENTRAL_FRETE_SESSION_SECRET = previousSecret;
  }
});
