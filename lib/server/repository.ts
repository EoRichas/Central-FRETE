import type {
  CostRecord,
  DashboardData,
  InstallmentRecord,
  PaymentRecord,
  SaleAttachmentRecord,
  SaleRecord,
  CurrentUser,
} from "@/lib/contracts";
import {
  calculateSaleFinancials,
  weightedMarginBasisPoints,
} from "@/lib/domain/finance";
import { operationalCommissionCents } from "@/lib/domain/commissions";
import { queryAll, queryFirst } from "@/lib/server/d1";

type SaleRow = Omit<
  SaleRecord,
  | "costs"
  | "payments"
  | "installments"
  | "attachments"
  | "financial"
  | "costsPending"
> & { costsPending: number };

type PaymentRow = Omit<PaymentRecord, "canReverse">;

function todaySaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function placeholders(count: number) {
  return Array.from({ length: count }, () => "?").join(",");
}

export type SaleFilters = {
  competency?: string;
  query?: string;
  operationalStatus?: string;
  financialStatus?: string;
  sellerName?: string;
  limit?: number;
  offset?: number;
};

export async function listSales(
  user: CurrentUser,
  filters: SaleFilters = {},
): Promise<SaleRecord[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.competency) {
    where.push("s.competency = ?");
    params.push(filters.competency);
  }
  if (filters.operationalStatus) {
    where.push("s.operational_status = ?");
    params.push(filters.operationalStatus);
  }
  if (filters.sellerName) {
    where.push("s.seller_name = ?");
    params.push(filters.sellerName.toUpperCase());
  }
  if (filters.query) {
    const term = `%${filters.query.toUpperCase()}%`;
    where.push(`(
      upper(s.sale_number) like ? or upper(coalesce(c.legal_name, '')) like ? or
      coalesce(c.cpf_cnpj, '') like ? or upper(coalesce(s.vehicle, '')) like ? or
      upper(coalesce(s.plate, '')) like ? or upper(s.origin) like ? or upper(s.destination) like ?
    )`);
    params.push(term, term, term, term, term, term, term);
  }
  if (user.role === "VENDEDOR") {
    where.push("(s.seller_id = ? or upper(s.seller_name) = upper(?))");
    params.push(user.id, user.name);
  }

  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);
  params.push(limit, offset);
  const sales = await queryAll<SaleRow>(
    `select
      s.id, s.sale_number as saleNumber, s.sale_date as saleDate,
      s.competency, s.seller_id as sellerId, s.seller_name as sellerName,
      s.client_id as clientId, c.legal_name as clientName,
      c.cpf_cnpj as clientDocument, s.vehicle, s.plate,
      s.initial_provider_name as initialProviderName, s.origin, s.destination,
      s.pickup_address_snapshot as pickupAddressSnapshot,
      s.delivery_address_snapshot as deliveryAddressSnapshot,
      s.operational_deadline_days as operationalDeadlineDays,
      s.origin_yard_entry_date as originYardEntryDate,
      s.delivery_deadline as deliveryDeadline,
      s.financial_due_date as financialDueDate,
      s.operational_status as operationalStatus,
      s.legacy_operational_status as legacyOperationalStatus,
      s.notes, s.freight_amount_cents as freightAmountCents,
      s.commission_basis_points as commissionBasisPoints,
      s.costs_pending as costsPending, s.source_row as sourceRow
    from freight_sales s
    left join clients c on c.id = s.client_id
    ${where.length ? `where ${where.join(" and ")}` : ""}
    order by s.sale_date desc, cast(s.sale_number as integer) desc
    limit ? offset ?`,
    params,
  );
  if (!sales.length) return [];

  const ids = sales.map((sale) => sale.id);
  const idList = placeholders(ids.length);
  const [costs, paymentRows, installments, attachments] = await Promise.all([
    queryAll<CostRecord>(
      `select id, sale_id as saleId, category, provider_name as providerName,
        pix_details as pixDetails, description, occurred_on as occurredOn,
        amount_cents as amountCents,
        confirmed, provider_slot as providerSlot,
        payment_status as paymentStatus, paid_at as paidAt, paid_by as paidBy
      from freight_costs where sale_id in (${idList}) order by created_at, id`,
      ids,
    ),
    queryAll<PaymentRow>(
      `select p.id, p.sale_id as saleId, p.installment_id as installmentId,
        p.type, p.status, p.amount_cents as amountCents,
        p.occurred_at as occurredAt, p.payment_method as paymentMethod,
        a.name as accountName, p.notes,
        p.reversed_transaction_id as reversedTransactionId,
        p.proof_name as proofName
      from payment_transactions p
      left join financial_accounts a on a.id = p.financial_account_id
      where p.sale_id in (${idList})
      order by p.occurred_at desc, p.created_at desc`,
      ids,
    ),
    queryAll<InstallmentRecord>(
      `select id, sale_id as saleId, installment_number as installmentNumber,
        installment_count as installmentCount, due_date as dueDate,
        payment_method as paymentMethod,
        expected_amount_cents as expectedAmountCents, notes
      from receivable_installments where sale_id in (${idList})
      order by installment_number`,
      ids,
    ),
    queryAll<SaleAttachmentRecord>(
      `select a.id, a.sale_id as saleId, a.file_name as fileName,
        a.mime_type as mimeType, a.size_bytes as sizeBytes,
        a.description, a.uploaded_by as uploadedBy,
        u.name as uploadedByName, a.uploaded_at as uploadedAt
       from sale_attachments a
       left join users u on u.id = a.uploaded_by
       where a.sale_id in (${idList})
       order by a.uploaded_at desc, a.id desc`,
      ids,
    ),
  ]);

  const reversed = new Set(
    paymentRows
      .filter((payment) => payment.type === "ESTORNO")
      .map((payment) => payment.reversedTransactionId)
      .filter(Boolean),
  );
  const asOfDate = todaySaoPaulo();
  const result = sales.map((row) => {
    const saleCosts = costs
      .filter((cost) => cost.saleId === row.id)
      .map((cost) => ({ ...cost, confirmed: Boolean(cost.confirmed) }));
    const payments: PaymentRecord[] = paymentRows
      .filter((payment) => payment.saleId === row.id)
      .map((payment) => ({
        ...payment,
        canReverse:
          payment.type !== "ESTORNO" &&
          payment.status === "CONFIRMADO" &&
          !reversed.has(payment.id),
      }));
    const financial = calculateSaleFinancials({
      freightAmountCents: row.freightAmountCents,
      commissionBasisPoints: row.commissionBasisPoints,
      expenseAmountsCents: saleCosts.map((cost) => cost.amountCents),
      transactions: payments.map((payment) => ({
        type: payment.type,
        status: payment.status,
        amountCents: payment.amountCents,
      })),
      dueDate: row.financialDueDate,
      asOfDate,
    });
    return {
      ...row,
      costsPending: Boolean(row.costsPending),
      costs: saleCosts,
      payments,
      installments: installments.filter(
        (installment) => installment.saleId === row.id,
      ),
      attachments: attachments.filter(
        (attachment) => attachment.saleId === row.id,
      ),
      financial,
    } satisfies SaleRecord;
  });

  if (!filters.financialStatus) return result;
  return result.filter((sale) => sale.financial.status === filters.financialStatus);
}

export async function getSale(
  user: CurrentUser,
  id: string,
): Promise<SaleRecord | null> {
  const sales = await listSales(user, { limit: 500 });
  return sales.find((sale) => sale.id === id) ?? null;
}

export async function dashboard(
  user: CurrentUser,
  competency: string,
): Promise<DashboardData> {
  const sales = await listSales(user, { competency, limit: 500 });
  const receivedStart = `${competency}-01`;
  const [year, month] = competency.split("-").map(Number);
  const nextMonth = `${month === 12 ? year + 1 : year}-${String(
    month === 12 ? 1 : month + 1,
  ).padStart(2, "0")}-01`;
  const periodSellerScope =
    user.role === "VENDEDOR"
      ? "and (s.seller_id = ? or upper(s.seller_name) = upper(?))"
      : "";
  const periodParams: unknown[] = [
    `${receivedStart}T00:00:00.000Z`,
    `${nextMonth}T00:00:00.000Z`,
  ];
  if (user.role === "VENDEDOR") periodParams.push(user.id, user.name);
  const periodTransactions = await queryFirst<{ total: number }>(
    `select coalesce(sum(case when p.type = 'ESTORNO' then -p.amount_cents else p.amount_cents end), 0) as total
      from payment_transactions p
      join freight_sales s on s.id = p.sale_id
      where p.status = 'CONFIRMADO' and p.occurred_at >= ? and p.occurred_at < ?
      ${periodSellerScope}`,
    periodParams,
  );

  const statuses: DashboardData["statuses"] = {
    EM_ABERTO: { count: 0, amountCents: 0 },
    PAGO: { count: 0, amountCents: 0 },
    VENCIDO: { count: 0, amountCents: 0 },
  };
  const sellerMap = new Map<string, { freightAmountCents: number; marginCents: number }>();
  const dayMap = new Map<string, number>();
  for (const sale of sales) {
    const status = sale.financial.status;
    statuses[status].count += 1;
    statuses[status].amountCents +=
      status === "PAGO" ? sale.freightAmountCents : sale.financial.balanceCents;
    const seller = sellerMap.get(sale.sellerName) ?? {
      freightAmountCents: 0,
      marginCents: 0,
    };
    seller.freightAmountCents += sale.freightAmountCents;
    seller.marginCents += sale.financial.marginCents;
    sellerMap.set(sale.sellerName, seller);
    dayMap.set(
      sale.saleDate,
      (dayMap.get(sale.saleDate) ?? 0) + sale.freightAmountCents,
    );
  }

  const total = <K extends keyof SaleRecord["financial"]>(key: K) =>
    sales.reduce((sum, sale) => sum + Number(sale.financial[key]), 0);
  const freightAmountCents = sales.reduce(
    (sum, sale) => sum + sale.freightAmountCents,
    0,
  );
  const marginCents = total("marginCents");
  const overdue = sales
    .filter((sale) => sale.financial.status === "VENCIDO")
    .sort((a, b) => a.financialDueDate.localeCompare(b.financialDueDate));
  const upcoming = sales
    .filter((sale) => sale.financial.status === "EM_ABERTO")
    .sort((a, b) => a.financialDueDate.localeCompare(b.financialDueDate));

  return {
    competency,
    generatedAt: new Date().toISOString(),
    salesCount: sales.length,
    freightAmountCents,
    operationalCommissionCents: operationalCommissionCents(freightAmountCents),
    totalReceivedCents: total("totalReceivedCents"),
    receivedInPeriodCents: periodTransactions?.total ?? 0,
    advancesReceivedCents: total("advanceReceivedCents"),
    totalBalanceCents: total("balanceCents"),
    transportCostCents: total("transportCostCents"),
    marginCents,
    marginBasisPoints: weightedMarginBasisPoints(
      sales.map((sale) => ({
        freightAmountCents: sale.freightAmountCents,
        marginCents: sale.financial.marginCents,
      })),
    ),
    marginIsProvisional: sales.some((sale) => sale.costsPending),
    statuses,
    customerCreditCents: total("customerCreditCents"),
    bySeller: [...sellerMap.entries()]
      .map(([name, values]) => ({ name, ...values }))
      .sort((a, b) => b.freightAmountCents - a.freightAmountCents),
    byDay: [...dayMap.entries()]
      .map(([date, value]) => ({ date, freightAmountCents: value }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    upcoming: upcoming.slice(0, 5),
    overdue: overdue.slice(0, 5),
  };
}
