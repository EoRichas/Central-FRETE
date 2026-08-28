import assert from "node:assert/strict";
import test from "node:test";
import { operationalCommissionCents, sellerCommissionCents } from "../lib/domain/commissions.ts";
import { calculateSaleFinancials, commissionCents } from "../lib/domain/finance.ts";
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
