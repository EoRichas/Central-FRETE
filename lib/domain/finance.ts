export type FinancialStatus = "PAGO" | "VENCIDO" | "EM_ABERTO";
export type PaymentType = "ADIANTAMENTO" | "RECEBIMENTO" | "ESTORNO";
export type PaymentStatus = "PENDENTE" | "CONFIRMADO" | "CANCELADO";

export type FinancialTransaction = {
  type: PaymentType;
  status: PaymentStatus;
  amountCents: number;
};

export type SaleFinancialInput = {
  freightAmountCents: number;
  commissionBasisPoints: number;
  expenseAmountsCents: number[];
  transactions: FinancialTransaction[];
  dueDate: string;
  asOfDate: string;
};

export type SaleFinancialResult = {
  commissionCents: number;
  transportCostCents: number;
  marginCents: number;
  marginBasisPoints: number;
  totalReceivedCents: number;
  advanceReceivedCents: number;
  balanceCents: number;
  customerCreditCents: number;
  status: FinancialStatus;
  isPartial: boolean;
  daysUntilDue: number;
};

function requireSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} deve ser um número inteiro seguro.`);
  }
}

export function commissionCents(
  freightAmountCents: number,
  commissionBasisPoints: number,
): number {
  requireSafeInteger(freightAmountCents, "Valor do frete");
  requireSafeInteger(commissionBasisPoints, "Percentual de comissão");
  if (freightAmountCents < 0) throw new Error("Valor do frete não pode ser negativo.");
  if (commissionBasisPoints < 0 || commissionBasisPoints > 10_000) {
    throw new Error("Percentual de comissão deve ficar entre 0% e 100%.");
  }
  return Math.round((freightAmountCents * commissionBasisPoints) / 10_000);
}

function parseDateOnly(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Data inválida: ${value}`);
  }
  return Date.parse(`${value}T12:00:00.000Z`);
}

export function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((parseDateOnly(toDate) - parseDateOnly(fromDate)) / 86_400_000);
}

export function calculateSaleFinancials(
  input: SaleFinancialInput,
): SaleFinancialResult {
  const commission = commissionCents(
    input.freightAmountCents,
    input.commissionBasisPoints,
  );
  const expenses = input.expenseAmountsCents.reduce((sum, amount) => {
    requireSafeInteger(amount, "Despesa");
    if (amount < 0) throw new Error("Despesa não pode ser negativa.");
    return sum + amount;
  }, 0);
  const transportCostCents = commission + expenses;
  const marginCents = input.freightAmountCents - transportCostCents;
  const marginBasisPoints =
    input.freightAmountCents > 0
      ? Math.round((marginCents * 10_000) / input.freightAmountCents)
      : 0;

  let totalReceivedCents = 0;
  let advanceReceivedCents = 0;
  for (const transaction of input.transactions) {
    requireSafeInteger(transaction.amountCents, "Recebimento");
    if (transaction.amountCents <= 0) {
      throw new Error("Recebimento deve ser maior que zero.");
    }
    if (transaction.status !== "CONFIRMADO") continue;
    if (transaction.type === "ESTORNO") {
      totalReceivedCents -= transaction.amountCents;
    } else {
      totalReceivedCents += transaction.amountCents;
      if (transaction.type === "ADIANTAMENTO") {
        advanceReceivedCents += transaction.amountCents;
      }
    }
  }

  totalReceivedCents = Math.max(totalReceivedCents, 0);
  const balanceCents = Math.max(
    input.freightAmountCents - totalReceivedCents,
    0,
  );
  const customerCreditCents = Math.max(
    totalReceivedCents - input.freightAmountCents,
    0,
  );
  const daysUntilDue = daysBetween(input.asOfDate, input.dueDate);
  const status: FinancialStatus =
    balanceCents === 0
      ? "PAGO"
      : daysUntilDue < 0
        ? "VENCIDO"
        : "EM_ABERTO";

  return {
    commissionCents: commission,
    transportCostCents,
    marginCents,
    marginBasisPoints,
    totalReceivedCents,
    advanceReceivedCents,
    balanceCents,
    customerCreditCents,
    status,
    isPartial: totalReceivedCents > 0 && balanceCents > 0,
    daysUntilDue,
  };
}

export function weightedMarginBasisPoints(
  sales: Array<{ freightAmountCents: number; marginCents: number }>,
): number {
  const freight = sales.reduce((sum, sale) => sum + sale.freightAmountCents, 0);
  const margin = sales.reduce((sum, sale) => sum + sale.marginCents, 0);
  return freight > 0 ? Math.round((margin * 10_000) / freight) : 0;
}

