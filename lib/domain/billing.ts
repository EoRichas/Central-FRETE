export const MONTHLY_AMOUNT_CENTS = 14999;
export function saoPauloDate(now = new Date()) {
 return new Intl.DateTimeFormat("en-CA", {timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"}).format(now);
}
export function validCompetency(value: string) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
export function shiftMonth(value: string, offset: number) {
 if (!validCompetency(value)) throw new Error("Competência inválida.");
 const [year, month] = value.split("-").map(Number);
 return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
}
export function billingCalendar(now = new Date()) {
 const today = saoPauloDate(now);
 const month = today.slice(0, 7);
 const day = Number(today.slice(8));
 const activeCompetency = day >= 5 ? month : shiftMonth(month, -1);
 const dueCompetency = day <= 5 ? month : shiftMonth(month, 1);
 const dueDate = `${dueCompetency}-05`;
 const daysUntilDue = Math.round((Date.parse(`${dueDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
 return { today, month, activeCompetency, dueCompetency, dueDate, daysUntilDue };
}
export function paymentWindow(competency: string, now = new Date()) {
 if (!validCompetency(competency)) throw new Error("Competência inválida.");
 const today = saoPauloDate(now);
 const dueDate = `${competency}-05`;
 const opensAt = new Date(`${dueDate}T12:00:00Z`);
 opensAt.setUTCDate(opensAt.getUTCDate() - 5);
 const opensOn = opensAt.toISOString().slice(0, 10);
 return { available: today >= opensOn, opensOn, dueDate, overdue: today > dueDate };
}
export function competenciesBetween(first: string, last: string) {
 const months: string[] = [];
 if (!validCompetency(first) || !validCompetency(last)) throw new Error("Competência inválida.");
 for (let value = first; value <= last; value = shiftMonth(value, 1)) {
  if (months.length >= 240) throw new Error("Período de cobrança excede 20 anos.");
  months.push(value);
 }
 return months;
}
export function licenseState(first: string, paid: string[], now = new Date()) {
 const calendar = billingCalendar(now);
 const paidSet = new Set(paid);
 const months = competenciesBetween(first, calendar.dueCompetency);
 const overdue = months.filter(m => `${m}-05` < calendar.today && !paidSet.has(m));
 const nextUnpaid = months.find(m => !paidSet.has(m)) ?? shiftMonth(calendar.dueCompetency, 1);
 const upcomingPaid = paidSet.has(calendar.dueCompetency);
 let alert: string | null = null;
 if (overdue.length) alert = "Licença vencida. Regularize o pagamento para liberar o sistema.";
 else if (upcomingPaid && calendar.daysUntilDue <= 5) alert = `Mensalidade paga — renovação agendada para 05/${calendar.dueCompetency.slice(5)}/${calendar.dueCompetency.slice(0,4)}.`;
 else if (calendar.daysUntilDue <= 5 && calendar.dueCompetency >= first) alert = calendar.daysUntilDue === 0 ? "Sua licença vence hoje." : calendar.daysUntilDue === 1 ? "Sua licença vence amanhã." : `Faltam ${calendar.daysUntilDue} dias para o vencimento da licença.`;
 return { ...calendar, overdue, blocked: overdue.length > 0, nextUnpaid, upcomingPaid, alert };
}
export function subscriptionPaymentCompetency(debitCompetency: string, nextUnpaid: string, testMode: boolean) {
 return testMode ? nextUnpaid : debitCompetency;
}
export function canUseBillingPath(path: string) {
 return path === "/api/me" || path === "/api/billing" || path.startsWith("/api/billing/");
}
