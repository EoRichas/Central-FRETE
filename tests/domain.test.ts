import assert from "node:assert/strict";
import test from "node:test";
import { operationalCommissionCents, sellerCommissionCents } from "../lib/domain/commissions.ts";
import {
  calculateCalculator,
  defaultCalculatorDocument,
  normalizeCalculatorDocument,
} from "../lib/domain/calculator.ts";
import { calculateSaleFinancials, commissionCents } from "../lib/domain/finance.ts";
import { calculateDestinationArrivalDate, normalizeCostCategory } from "../lib/domain/operations.ts";
import { roleCan } from "../lib/domain/permissions.ts";
import {
  defaultVacancyPriceDocument,
  normalizeVacancyPriceDocument,
} from "../lib/domain/vacancy-prices.ts";
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

test("reproduz os totais da calculadora enviada", () => {
  const document = defaultCalculatorDocument();
  document.fipeCents = 100_000;
  document.icmsBaseCents = 50_000;
  const line = (id: string) => document.lines.find((item) => item.id === id)!;
  line("insurance").observationBasisPoints = 100;
  line("slot-1").valueCents = 100_000;
  line("central-margin").valueCents = 20_000;
  line("icms").observationBasisPoints = 1_000;
  line("seller-commission").observationBasisPoints = 1_000;
  line("invoice").observationBasisPoints = 500;
  const result = calculateCalculator(document);

  assert.equal(result.lineValues.insurance, 500);
  assert.equal(result.lineValues.icms, 5_000);
  assert.equal(result.lineValues["seller-commission"], 13_944);
  assert.equal(result.lineValues.invoice, 6_972);
  assert.equal(result.subtotalCents, 125_500);
  assert.equal(result.operationCostCents, 105_500);
  assert.equal(result.totalCents, 139_444);
  assert.equal(result.invoiceTotalCents, 146_416);
  assert.equal(result.netReceivableCents, 20_000);
});

test("normaliza a calculadora sem permitir alterar as fórmulas estruturais", () => {
  const document = normalizeCalculatorDocument({
    collaboratorName: " teste ",
    lines: [
      {
        id: "insurance",
        code: "9999",
        valueCents: 999_999,
        observationBasisPoints: 10,
      },
    ],
  });

  assert.equal(document.collaboratorName, "TESTE");
  assert.equal(document.lines.find((line) => line.id === "insurance")?.code, "9999");
  assert.equal(document.lines.find((line) => line.id === "insurance")?.valueCents, 0);
  assert.equal(document.lines.length, 11);
});

test("normaliza a configuração privada do preço por vaga", () => {
  const empty = defaultVacancyPriceDocument();
  const normalized = normalizeVacancyPriceDocument({
    fipeCents: 5_000_000,
    rows: [
      {
        id: "rota-teste",
        destination: " cidade teste ",
        centralMarginCents: 25_000,
        insuranceBasisPoints: 12,
        outgoing: { baseHatchCents: 100_000, baseSuvCents: 110_000, hatchCents: 150_000, suvCents: 160_000 },
        returning: { baseHatchCents: 80_000, baseSuvCents: 90_000, hatchCents: 130_000, suvCents: 140_000 },
        deadline: "5",
        served: true,
      },
    ],
  });

  assert.equal(empty.rows.length, 0);
  assert.equal(normalized.fipeCents, 5_000_000);
  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.rows[0]?.destination, "CIDADE TESTE");
  assert.equal(normalized.rows[0]?.returning.suvCents, 140_000);
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
