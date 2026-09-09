import assert from "node:assert/strict";
import test from "node:test";
import { billingCalendar, licenseState, shiftMonth, canUseBillingPath, subscriptionPaymentCompetency, paymentWindow } from "../lib/domain/billing.ts";
import { validCpf } from "../lib/domain/identity.ts";
import { billingAmountCents } from "../lib/server/billing-config.ts";
import { planMatchesBillingMode, type MpPlan } from "../lib/server/mercado-pago.ts";
import { licensePdf } from "../lib/server/license-pdf.ts";

test("modo de teste cobra R$ 1,00 e produção preserva R$ 149,99", () => {
 const previous = process.env.MERCADO_PAGO_MODE;
 try {
  process.env.MERCADO_PAGO_MODE = "test";
  assert.equal(billingAmountCents(), 100);
  process.env.MERCADO_PAGO_MODE = "production";
  assert.equal(billingAmountCents(), 14_999);
 } finally {
  if (previous === undefined) delete process.env.MERCADO_PAGO_MODE;
  else process.env.MERCADO_PAGO_MODE = previous;
 }
});

test("plano de teste aceita R$ 1 sem dia fixo e produção continua exigindo dia 05", () => {
 const previousMode = process.env.MERCADO_PAGO_MODE;
 const previousCollector = process.env.MERCADO_PAGO_COLLECTOR_ID;
 process.env.MERCADO_PAGO_COLLECTOR_ID = "123";
 const base: MpPlan = {
  id: "plan-test",
  collector_id: 123,
  status: "active",
  init_point: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=plan-test",
  auto_recurring: {
   frequency: 1,
   frequency_type: "months",
   transaction_amount: 1,
   currency_id: "BRL",
   billing_day: null,
   billing_day_proportional: false,
   free_trial: null,
  },
 };
 try {
  process.env.MERCADO_PAGO_MODE = "test";
  assert.equal(planMatchesBillingMode(base), true);
  assert.equal(planMatchesBillingMode({ ...base, auto_recurring: { ...base.auto_recurring, billing_day: 5 } }), false);
  assert.equal(planMatchesBillingMode({ ...base, auto_recurring: { ...base.auto_recurring, free_trial: { frequency: 7, frequency_type: "days" } } }), false);

  process.env.MERCADO_PAGO_MODE = "production";
  const productionPlan: MpPlan = {
   ...base,
   auto_recurring: {
    ...base.auto_recurring,
    transaction_amount: 149.99,
    billing_day: 5,
   },
  };
  assert.equal(planMatchesBillingMode(productionPlan), true);
  assert.equal(planMatchesBillingMode({ ...productionPlan, auto_recurring: { ...productionPlan.auto_recurring, billing_day: null } }), false);
 } finally {
  if (previousMode === undefined) delete process.env.MERCADO_PAGO_MODE;
  else process.env.MERCADO_PAGO_MODE = previousMode;
  if (previousCollector === undefined) delete process.env.MERCADO_PAGO_COLLECTOR_ID;
  else process.env.MERCADO_PAGO_COLLECTOR_ID = previousCollector;
 }
});

test("assinatura imediata de teste quita a próxima competência, não o mês corrente", () => {
 assert.equal(subscriptionPaymentCompetency("2026-09", "2026-10", true), "2026-10");
 assert.equal(subscriptionPaymentCompetency("2026-10", "2026-10", false), "2026-10");
});

test("pagamento abre cinco dias antes e permanece disponível após o vencimento", () => {
 assert.equal(paymentWindow("2026-10", new Date("2026-09-29T15:00Z")).available, false);
 assert.equal(paymentWindow("2026-10", new Date("2026-09-30T15:00Z")).available, true);
 assert.equal(paymentWindow("2026-10", new Date("2026-10-05T15:00Z")).available, true);
 const overdue = paymentWindow("2026-10", new Date("2026-10-06T15:00Z"));
 assert.equal(overdue.available, true);
 assert.equal(overdue.overdue, true);
});

test("alerta cinco dias antes respeita mês curto e ano bissexto", () => {
 assert.equal(billingCalendar(new Date("2026-02-28T15:00Z")).daysUntilDue, 5);
 assert.match(licenseState("2026-02", ["2026-02"], new Date("2026-02-28T15:00Z")).alert!, /Faltam 5 dias/);
 assert.equal(billingCalendar(new Date("2028-02-29T15:00Z")).daysUntilDue, 5);
 assert.equal(shiftMonth("2026-12", 1), "2027-01");
});
test("antecipação agenda a nova licença e só troca a competência no dia 05 de Brasília", () => {
 const before = licenseState("2026-08", ["2026-08", "2026-09"], new Date("2026-09-05T02:59:59Z"));
 assert.equal(before.activeCompetency, "2026-08"); assert.equal(before.blocked, false); assert.equal(before.upcomingPaid, true);
 const after = licenseState("2026-08", ["2026-08", "2026-09"], new Date("2026-09-05T03:00:00Z"));
 assert.equal(after.activeCompetency, "2026-09"); assert.equal(after.blocked, false);
});
test("permite o dia 05 inteiro e bloqueia no dia 06 sem pagamento", () => {
 assert.equal(licenseState("2026-09", [], new Date("2026-09-06T02:59:59Z")).blocked, false);
 assert.equal(licenseState("2026-09", [], new Date("2026-09-06T03:00:00Z")).blocked, true);
 assert.equal(licenseState("2026-09", ["2026-09"], new Date("2026-09-06T03:01:00Z")).blocked, false);
});
test("pagar mês futuro não apaga dívida anterior nem cobra mês quitado de novo", () => {
 const s = licenseState("2026-08", ["2026-09"], new Date("2026-09-10T15:00Z"));
 assert.deepEqual(s.overdue, ["2026-08"]); assert.equal(s.nextUnpaid, "2026-08");
 assert.equal(licenseState("2026-08", ["2026-08", "2026-09"], new Date("2026-09-10T15:00Z")).nextUnpaid, "2026-10");
});
test("antes da primeira competência não bloqueia nem cobra meses anteriores", () => {
 const s = licenseState("2026-10", [], new Date("2026-09-01T15:00Z"));
 assert.equal(s.blocked, false); assert.equal(s.alert, null);
});
test("exceções ao bloqueio são somente sessão e licenciamento", () => {
 assert.equal(canUseBillingPath("/api/me"), true);
 assert.equal(canUseBillingPath("/api/billing/checkout"), true);
 for (const path of ["/api/fleet", "/api/users", "/api/sales", "/api/billing-evil"]) assert.equal(canUseBillingPath(path), false);
});
test("CPF rejeita sequências repetidas e dígito verificador incorreto", () => {
 assert.equal(validCpf("11111111111"), false); assert.equal(validCpf("52998224724"), false);
 assert.equal(validCpf("52998224725"), true);
});
test("certificado é PDF com tabela de offsets consistente e texto escapado", () => {
 const pdf = Buffer.from(licensePdf({companyName: "Licença (mensal)", competency: "2026-10", approvedAt: "2026-10-01T01:30:00Z", licenseKey: "a".repeat(48), status: "active"})).toString("latin1");
 assert.ok(pdf.startsWith("%PDF-1.4")); assert.ok(pdf.includes(String.raw`Licença \(mensal\)`));
 assert.ok(pdf.includes("30/09/2026")); // Use the payment date in São Paulo.
 assert.ok(pdf.includes("05/10/2026"));
 assert.ok(pdf.includes("04/11/2026")); // The next key becomes active on the 5th.
 assert.ok(pdf.includes("05/11/2026"));
 const start = Number(pdf.match(/startxref\n(\d+)/)?.[1]); assert.equal(pdf.slice(start, start+4), "xref");
});

test("setembro liberado e primeira mensalidade em 05/10/2026", () => {
 for (const date of ["2026-09-08T15:00Z", "2026-09-30T15:00Z", "2026-10-05T15:00Z"]) {
  const state = licenseState("2026-10", [], new Date(date));
  assert.equal(state.blocked, false);
  assert.equal(state.nextUnpaid, "2026-10");
  assert.deepEqual(state.overdue, []);
 }
 assert.match(licenseState("2026-10", [], new Date("2026-09-30T15:00Z")).alert!, /Faltam 5 dias/);
 assert.deepEqual(licenseState("2026-10", [], new Date("2026-10-06T03:00Z")).overdue, ["2026-10"]);
 const prepaid = licenseState("2026-10", ["2026-10"], new Date("2026-09-30T15:00Z"));
 assert.equal(prepaid.activeCompetency, "2026-09");
 assert.equal(prepaid.blocked, false);
 assert.equal(licenseState("2026-10", ["2026-10"], new Date("2026-10-06T03:00Z")).blocked, false);
});
