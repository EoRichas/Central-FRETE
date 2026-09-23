import { parseSaleCargo } from "@/lib/server/sale-cargo";
import { authorize } from "@/lib/server/auth";
import { currentCompetency, isCompetency } from "@/lib/domain/dates";
import {
  COST_CATEGORIES,
  normalizeCostCategory,
  isDirectPaidOperationCostCategory,
  OPERATIONAL_STATUSES,
  ORIGIN_LOCATION_TYPES,
} from "@/lib/domain/operations";
import { ApiError, getD1, jsonError, queryFirst } from "@/lib/server/d1";
import { listSales } from "@/lib/server/repository";
import {
  asObject,
  dateOnly,
  enumValue,
  integerInRange,
  requiredUpper,
  upper,
} from "@/lib/server/validation";

const PAYMENT_METHODS = [
  "BOLETO",
  "DINHEIRO",
  "CREDITO",
  "DEBITO",
  "PIX",
  "FATURADO",
] as const;

export async function GET(request: Request) {
  try {
    const user = await authorize(request);
    const url = new URL(request.url);
    const competency = url.searchParams.get("competency") || currentCompetency();
    if (!isCompetency(competency)) throw new ApiError(400, "Competência inválida.");
    const sales = await listSales(user, {
      competency,
      query: url.searchParams.get("q") || undefined,
      operationalStatus:
        url.searchParams.get("operationalStatus") || undefined,
      financialStatus: url.searchParams.get("financialStatus") || undefined,
      sellerName: url.searchParams.get("seller") || undefined,
      limit: Number(url.searchParams.get("limit") || 200),
      offset: Number(url.searchParams.get("offset") || 0),
    });
    return Response.json({ sales, count: sales.length, canDelete: user.role === "ADMIN" });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await authorize(request, ["ADMIN", "VENDEDOR"]);
    const payload = asObject(await request.json());
    if (payload.saleNumber != null && payload.saleNumber !== '') throw new ApiError(400, 'O número da venda é gerado automaticamente.');
    const cargo = await parseSaleCargo(payload, user);
    const saleDate = dateOnly(payload.saleDate, "Data da venda");
    if (new Date(`${saleDate}T12:00:00Z`).toISOString().slice(0,10) !== saleDate) throw new ApiError(400,"Data da venda inválida.");
    const financialDueDate = dateOnly(
      payload.financialDueDate,
      "Data de vencimento",
    );
    const originLocationType = payload.originLocationType == null || payload.originLocationType === ""
      ? null
      : enumValue(payload.originLocationType, "Tipo de local de origem", ORIGIN_LOCATION_TYPES);
    const competency = saleDate.slice(0, 7);
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
    const clientId = String(payload.clientId ?? "").trim() || null;
    if (clientId) {
      const client = await queryFirst<{ id: string }>(
        `select id from clients where id = ? and active = 1`,
        [clientId],
      );
      if (!client) throw new ApiError(400, "Cliente não encontrado ou inativo.");
    }

    const rawCosts = Array.isArray(payload.costs) ? payload.costs : [];
    const costs = rawCosts.map((raw, index) => {
      const cost = asObject(raw);
      const submittedCategory = enumValue(
        cost.category,
        `Categoria da despesa ${index + 1}`,
        COST_CATEGORIES,
      );
      const category = normalizeCostCategory(submittedCategory);
      const providerSlot =
        category === "PRESTADOR_SERVICO"
          ? integerInRange(
              cost.providerSlot,
              `Posição do prestador ${index + 1}`,
              1,
              3,
            )
          : null;
      return {
        id: crypto.randomUUID(),
        category,
        providerName: upper(cost.providerName),
        description: upper(cost.description),
        occurredOn: cost.occurredOn
          ? dateOnly(cost.occurredOn, `Data da despesa ${index + 1}`)
          : null,
        amountCents: integerInRange(
          cost.amountCents,
          `Valor da despesa ${index + 1}`,
          1,
          9_000_000_000_000,
        ),
        confirmed: user.role === "ADMIN" || isDirectPaidOperationCostCategory(category),
        providerSlot,
        paymentStatus:
          category === "PRESTADOR_SERVICO" ? "EM_ABERTO" : "NAO_APLICAVEL",
      };
    });
    const providerSlots = costs
      .map((cost) => cost.providerSlot)
      .filter((slot): slot is number => slot !== null);
    if (new Set(providerSlots).size !== providerSlots.length) {
      throw new ApiError(400, "Cada prestador deve ocupar uma linha diferente.");
    }

    const paymentMethod = enumValue(
      payload.paymentMethod,
      "Forma de pagamento",
      PAYMENT_METHODS,
    );
    const saleId = crypto.randomUUID();
    const installmentId = crypto.randomUUID();
    const sellerName =
      user.role === "VENDEDOR"
        ? user.name
        : requiredUpper(payload.sellerName, "Vendedor");
    const sellerUser =
      user.role === "VENDEDOR"
        ? { id: user.id }
        : await queryFirst<{ id: string }>(
            `select id from users
             where role = 'VENDEDOR' and active = 1 and upper(name) = ?
             limit 1`,
            [sellerName],
          );
    const sellerId = sellerUser?.id ?? null;
    const costsPending = costs.some((cost) => !cost.confirmed);
    const db = await getD1();
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `insert into freight_sales (
            id, sale_number, sale_date, competency, seller_id, seller_name,
            client_id, vehicle, plate, initial_provider_name, origin, origin_location_type, destination,
            pickup_address_snapshot, delivery_address_snapshot,
            operational_deadline_days, origin_yard_entry_date, delivery_deadline,
            financial_due_date, operational_status, notes, freight_amount_cents,
            commission_basis_points, costs_pending, created_by, cargo_vehicles, fleet_freight_id, payment_condition
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?) returning sale_number as saleNumber`,
        )
        .bind(
          saleId,
          null,
          saleDate,
          competency,
          sellerId,
          sellerName,
          clientId,
          cargo.cargoVehicles[0].model,
          cargo.cargoVehicles[0].plate,
          upper(payload.initialProviderName),
          requiredUpper(payload.origin, "Origem"),
          originLocationType,
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
          user.id,
          JSON.stringify(cargo.cargoVehicles), cargo.fleetFreightId, cargo.paymentCondition,
        ),
      db
        .prepare(
          `insert into receivable_installments (
            id, sale_id, installment_number, installment_count, due_date,
            payment_method, financial_account_id, expected_amount_cents, notes
          ) values (?, ?, 1, 1, ?, ?, null, ?, ?)`,
        )
        .bind(
          installmentId,
          saleId,
          financialDueDate,
          paymentMethod,
          freightAmountCents,
          "PARCELA CRIADA COM A VENDA.",
        ),
    ];
    for (const cost of costs) {
      statements.push(
        db
          .prepare(
            `insert into freight_costs (
              id, sale_id, category, provider_name, description, occurred_on,
              amount_cents, confirmed, provider_slot, payment_status
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            cost.id,
            saleId,
            cost.category,
            cost.providerName,
            cost.description,
            cost.occurredOn,
            cost.amountCents,
            cost.confirmed ? 1 : 0,
            cost.providerSlot,
            cost.paymentStatus,
          ),
      );
    }

    const advanceCents = payload.advanceAmountCents
      ? integerInRange(
          payload.advanceAmountCents,
          "Adiantamento",
          1,
          9_000_000_000_000,
        )
      : 0;
    if (advanceCents > 0) {
      const status = user.role === "ADMIN" ? "CONFIRMADO" : "PENDENTE";
      statements.push(
        db
          .prepare(
            `insert into payment_transactions (
              id, sale_id, installment_id, type, status, amount_cents,
              occurred_at, payment_method, notes, idempotency_key, created_by
            ) values (?, ?, ?, 'ADIANTAMENTO', ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            saleId,
            installmentId,
            status,
            advanceCents,
            new Date().toISOString(),
            paymentMethod,
            "ADIANTAMENTO INFORMADO NO CADASTRO DA VENDA.",
            `sale-create:${saleId}:advance`,
            user.id,
          ),
      );
    }
    statements.push(
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            new_value, request_id
          ) values (?, 'FREIGHT_SALE', ?, 'CREATED', ?, ?, (?::jsonb || jsonb_build_object('saleNumber',(select sale_number from freight_sales where id=?)))::text, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          saleId,
          user.id,
          user.email,
          JSON.stringify({
            numbering: "AUTOMATIC_ANNUAL",
            freightAmountCents,
            commissionBasisPoints,
            costCount: costs.length,
            advanceCents,
          }),
          saleId,
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
    );

    const result = await db.batch<{ saleNumber: string }>(statements);
    return Response.json({ id: saleId, saleNumber: result[0].results[0].saleNumber }, { status: 201 });
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
