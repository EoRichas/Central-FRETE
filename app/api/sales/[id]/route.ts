import { authorize } from "@/lib/server/auth";
import {
  COST_CATEGORIES,
  isIcmsCostCategory,
  isEditableOperationCostCategory,
  normalizeCostCategory,
  OPERATIONAL_STATUSES,
} from "@/lib/domain/operations";
import {
  ApiError,
  getBucket,
  getD1,
  jsonError,
  queryAll,
  queryFirst,
} from "@/lib/server/d1";
import { getSale } from "@/lib/server/repository";
import {
  asObject,
  dateOnly,
  enumValue,
  integerInRange,
  normalizePlate,
  requiredString,
  requiredUpper,
  upper,
} from "@/lib/server/validation";

type RouteContext = { params: Promise<{ id: string }> };

const PAYMENT_METHODS = [
  "BOLETO",
  "DINHEIRO",
  "CREDITO",
  "DEBITO",
  "PIX",
  "FATURADO",
] as const;

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await authorize(request);
    const { id } = await context.params;
    const sale = await getSale(user, id);
    if (!sale) throw new ApiError(404, "Venda não encontrada.");
    return Response.json({ sale });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await authorize(request, ["ADMIN"]);
    const { id } = await context.params;
    const sale = await getSale(user, id);
    if (!sale) throw new ApiError(404, "Venda não encontrada.");

    const [attachments, paymentProofs] = await Promise.all([
      queryAll<{ storageKey: string }>(
        `select storage_key as storageKey from sale_attachments where sale_id = ?`,
        [id],
      ),
      queryAll<{ storageKey: string }>(
        `select proof_key as storageKey from payment_transactions
         where sale_id = ? and proof_key is not null`,
        [id],
      ),
    ]);
    const storageKeys = [...new Set(
      [...attachments, ...paymentProofs].map((item) => item.storageKey),
    )];
    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            previous_value, request_id
          ) values (?, 'FREIGHT_SALE', ?, 'DELETED', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          user.id,
          user.email,
          JSON.stringify({
            saleNumber: sale.saleNumber,
            sellerName: sale.sellerName,
            clientName: sale.clientName,
            freightAmountCents: sale.freightAmountCents,
            costs: sale.costs.length,
            payments: sale.payments.length,
            attachments: sale.attachments.length,
          }),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
      db.prepare("delete from freight_sales where id = ?").bind(id),
    ]);

    let storageCleanupPending = false;
    if (storageKeys.length) {
      try {
        const bucket = await getBucket();
        await Promise.all(storageKeys.map((key) => bucket.delete(key)));
      } catch (cleanupError) {
        storageCleanupPending = true;
        console.warn("sale_storage_cleanup_pending", {
          saleId: id,
          count: storageKeys.length,
          message:
            cleanupError instanceof Error ? cleanupError.message : "unknown",
        });
      }
    }

    return Response.json({ deleted: true, storageCleanupPending });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await authorize(request, ["ADMIN"]);
    const { id } = await context.params;
    const sale = await getSale(user, id);
    if (!sale) throw new ApiError(404, "Venda não encontrada.");
    const payload = asObject(await request.json());
    const saleNumber = requiredString(payload.saleNumber, "Número da venda");
    const saleDate = dateOnly(payload.saleDate, "Data da venda");
    const competency = saleDate.slice(0, 7);
    const financialDueDate = dateOnly(
      payload.financialDueDate,
      "Data de vencimento",
    );
    const freightAmountCents = integerInRange(
      payload.freightAmountCents,
      "Valor do frete em centavos",
      1,
      9_000_000_000_000,
    );
    const commissionBasisPoints = integerInRange(
      payload.commissionBasisPoints,
      "Percentual de comissão",
      0,
      10_000,
    );
    const operationalStatus = enumValue(
      payload.operationalStatus,
      "Status operacional",
      OPERATIONAL_STATUSES,
    );
    const operationalDeadlineDays = payload.operationalDeadlineDays
      ? integerInRange(
          payload.operationalDeadlineDays,
          "Prazo operacional em dias",
          1,
          365,
        )
      : null;
    const originYardEntryDate = payload.originYardEntryDate
      ? dateOnly(payload.originYardEntryDate, "Entrada no pátio de origem")
      : null;
    const paymentMethod = enumValue(
      payload.paymentMethod,
      "Forma de pagamento",
      PAYMENT_METHODS,
    );
    const clientId = String(payload.clientId ?? "").trim() || null;
    if (clientId) {
      const client = await queryFirst<{ id: string }>(
        "select id from clients where id = ? and active = 1",
        [clientId],
      );
      if (!client) throw new ApiError(400, "Cliente não encontrado ou inativo.");
    }

    const confirmedPool = new Map<string, number>();
    const existingIcmsCosts = sale.costs.filter((cost) =>
      isIcmsCostCategory(cost.category),
    );
    if (
      existingIcmsCosts.length > 0 &&
      existingIcmsCosts.every((cost) => cost.confirmed)
    ) {
      const totalIcmsCents = existingIcmsCosts.reduce(
        (total, cost) => total + cost.amountCents,
        0,
      );
      confirmedPool.set(`ICMS:${totalIcmsCents}`, 1);
    }
    for (const cost of sale.costs.filter(
      (item) => item.confirmed && !isIcmsCostCategory(item.category),
    )) {
      const key = `${cost.category}:${cost.amountCents}`;
      confirmedPool.set(key, (confirmedPool.get(key) ?? 0) + 1);
    }
    const providerPaymentBySlot = new Map(
      sale.costs
        .filter(
          (cost) =>
            cost.category === "PRESTADOR_SERVICO" && cost.providerSlot !== null,
        )
        .map((cost) => [
          cost.providerSlot!,
          {
            paymentStatus: cost.paymentStatus,
            pixDetails: cost.pixDetails,
            paidAt: cost.paidAt,
            paidBy: cost.paidBy,
          },
        ]),
    );
    const operationPixByCategory = new Map(
      sale.costs
        .filter((cost) => isEditableOperationCostCategory(cost.category))
        .map((cost) => [cost.category, cost.pixDetails]),
    );
    const rawCosts = Array.isArray(payload.costs) ? payload.costs : [];
    const costs = rawCosts.map((raw, index) => {
      const cost = asObject(raw);
      const submittedCategory = enumValue(
        cost.category,
        `Categoria da despesa ${index + 1}`,
        COST_CATEGORIES,
      );
      const category = normalizeCostCategory(submittedCategory);
      const amountCents = integerInRange(
        cost.amountCents,
        `Valor da despesa ${index + 1}`,
        1,
        9_000_000_000_000,
      );
      const key = `${category}:${amountCents}`;
      const availableConfirmed = confirmedPool.get(key) ?? 0;
      if (availableConfirmed > 0) confirmedPool.set(key, availableConfirmed - 1);
      const providerSlot =
        category === "PRESTADOR_SERVICO"
          ? integerInRange(
              cost.providerSlot,
              `Posição do prestador ${index + 1}`,
              1,
              3,
            )
          : null;
      const preservedProviderPayment = providerSlot
        ? providerPaymentBySlot.get(providerSlot)
        : null;
      return {
        id: crypto.randomUUID(),
        category,
        providerName: upper(cost.providerName),
        description: upper(cost.description),
        occurredOn: cost.occurredOn
          ? dateOnly(cost.occurredOn, `Data da despesa ${index + 1}`)
          : null,
        amountCents,
        confirmed:
          user.role === "ADMIN"
            ? Boolean(cost.confirmed)
            : availableConfirmed > 0,
        providerSlot,
        paymentStatus:
          category === "PRESTADOR_SERVICO"
            ? preservedProviderPayment?.paymentStatus ?? "EM_ABERTO"
            : "NAO_APLICAVEL",
        pixDetails:
          category === "PRESTADOR_SERVICO"
            ? preservedProviderPayment?.pixDetails ?? null
            : isEditableOperationCostCategory(category)
              ? operationPixByCategory.get(category) ?? null
              : null,
        paidAt:
          category === "PRESTADOR_SERVICO"
            ? preservedProviderPayment?.paidAt ?? null
            : null,
        paidBy:
          category === "PRESTADOR_SERVICO"
            ? preservedProviderPayment?.paidBy ?? null
            : null,
      };
    });
    const providerSlots = costs
      .map((cost) => cost.providerSlot)
      .filter((slot): slot is number => slot !== null);
    if (new Set(providerSlots).size !== providerSlots.length) {
      throw new ApiError(400, "Cada prestador deve ocupar uma linha diferente.");
    }

    const sellerName = requiredUpper(payload.sellerName, "Vendedor");
    const matchedSeller = await queryFirst<{ id: string }>(
      `select id from users
       where role = 'VENDEDOR' and active = 1 and upper(name) = ?
       limit 1`,
      [sellerName],
    );
    const sellerId =
      matchedSeller?.id ?? (sellerName === sale.sellerName ? sale.sellerId : null);
    const costsPending = costs.some((cost) => !cost.confirmed);
    const db = await getD1();
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `update freight_sales set
            sale_number = ?, sale_date = ?, competency = ?, seller_id = ?,
            seller_name = ?, client_id = ?, vehicle = ?, plate = ?,
            initial_provider_name = ?, origin = ?, destination = ?,
            pickup_address_snapshot = ?, delivery_address_snapshot = ?,
            operational_deadline_days = ?, origin_yard_entry_date = ?,
            delivery_deadline = ?, financial_due_date = ?,
            operational_status = ?, notes = ?, freight_amount_cents = ?,
            commission_basis_points = ?, costs_pending = ?,
            updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          where id = ?`,
        )
        .bind(
          saleNumber,
          saleDate,
          competency,
          sellerId,
          sellerName,
          clientId,
          upper(payload.vehicle),
          normalizePlate(payload.plate),
          upper(payload.initialProviderName),
          requiredUpper(payload.origin, "Origem"),
          requiredUpper(payload.destination, "Destino"),
          upper(payload.pickupAddressSnapshot),
          upper(payload.deliveryAddressSnapshot),
          operationalDeadlineDays,
          originYardEntryDate,
          payload.deliveryDeadline
            ? dateOnly(payload.deliveryDeadline, "Chegada prevista no destino")
            : null,
          financialDueDate,
          operationalStatus,
          upper(payload.notes),
          freightAmountCents,
          commissionBasisPoints,
          costsPending ? 1 : 0,
          id,
        ),
      db.prepare("delete from freight_costs where sale_id = ?").bind(id),
    ];

    const firstInstallment = sale.installments.find(
      (installment) => installment.installmentNumber === 1,
    );
    if (firstInstallment) {
      statements.push(
        db
          .prepare(
            `update receivable_installments set due_date = ?, payment_method = ?,
              expected_amount_cents = ?,
              updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            where id = ?`,
          )
          .bind(
            financialDueDate,
            paymentMethod,
            freightAmountCents,
            firstInstallment.id,
          ),
      );
    } else {
      statements.push(
        db
          .prepare(
            `insert into receivable_installments (
              id, sale_id, installment_number, installment_count, due_date,
              payment_method, financial_account_id, expected_amount_cents, notes
            ) values (?, ?, 1, 1, ?, ?, null, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            id,
            financialDueDate,
            paymentMethod,
            freightAmountCents,
            "PARCELA CRIADA NA EDIÇÃO DA VENDA.",
          ),
      );
    }

    for (const cost of costs) {
      statements.push(
        db
          .prepare(
            `insert into freight_costs (
              id, sale_id, category, provider_name, pix_details, description, occurred_on,
              amount_cents, confirmed, provider_slot, payment_status,
              paid_at, paid_by
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            cost.id,
            id,
            cost.category,
            cost.providerName,
            cost.pixDetails,
            cost.description,
            cost.occurredOn,
            cost.amountCents,
            cost.confirmed ? 1 : 0,
            cost.providerSlot,
            cost.paymentStatus,
            cost.paidAt,
            cost.paidBy,
          ),
      );
    }
    statements.push(
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            previous_value, new_value, request_id
          ) values (?, 'FREIGHT_SALE', ?, 'UPDATED', ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          user.id,
          user.email,
          JSON.stringify({
            saleNumber: sale.saleNumber,
            saleDate: sale.saleDate,
            clientId: sale.clientId,
            operationalStatus: sale.operationalStatus,
            freightAmountCents: sale.freightAmountCents,
            commissionBasisPoints: sale.commissionBasisPoints,
            costCount: sale.costs.length,
          }),
          JSON.stringify({
            saleNumber,
            saleDate,
            clientId,
            operationalStatus,
            freightAmountCents,
            commissionBasisPoints,
            costCount: costs.length,
          }),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
    );

    await db.batch(statements);
    return Response.json({ id, updated: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
      return Response.json(
        { error: "Já existe uma venda com esse número." },
        { status: 409 },
      );
    }
    return jsonError(error);
  }
}
