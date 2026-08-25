import { CENTRAL_FRETE_IMPORT } from "@/data/central-frete-import";
import { authorize } from "@/lib/server/auth";
import { ApiError, getD1, jsonError, queryFirst } from "@/lib/server/d1";

export async function GET(request: Request) {
  try {
    await authorize(request, ["ADMIN", "GERENCIA", "FINANCEIRO"]);
    const existing = await queryFirst<{ id: string; createdAt: string }>(
      `select id, created_at as createdAt from import_runs where import_key = ?`,
      [CENTRAL_FRETE_IMPORT.importKey],
    );
    return Response.json({
      ...CENTRAL_FRETE_IMPORT,
      alreadyImported: Boolean(existing),
      importedAt: existing?.createdAt ?? null,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await authorize(request, ["ADMIN"]);
    if (CENTRAL_FRETE_IMPORT.sales.length === 0) {
      throw new ApiError(409, "Nenhuma planilha operacional foi disponibilizada para importação.");
    }
    const existing = await queryFirst<{ id: string }>(
      `select id from import_runs where import_key = ?`,
      [CENTRAL_FRETE_IMPORT.importKey],
    );
    if (existing) {
      return Response.json({
        imported: false,
        alreadyImported: true,
        salesImported: 0,
      });
    }

    const db = await getD1();
    const statements: D1PreparedStatement[] = [];
    statements.push(
      db
        .prepare(
          `insert into financial_accounts (id, name, active)
           values ('account-central-frete', 'CONTA CENTRAL FRETE', 1)
           on conflict do nothing`,
        ),
    );
    for (const provider of CENTRAL_FRETE_IMPORT.providers) {
      statements.push(
        db
          .prepare(
            `insert into providers (id, name, active) values (?, ?, 1)
             on conflict do nothing`,
          )
          .bind(provider.id, provider.name),
      );
    }

    for (const sale of CENTRAL_FRETE_IMPORT.sales) {
      statements.push(
        db
          .prepare(
            `insert into freight_sales (
              id, sale_number, sale_date, competency, seller_name, vehicle, plate,
              initial_provider_id, initial_provider_name, origin, destination,
              financial_due_date, operational_status, legacy_operational_status,
              notes, freight_amount_cents, commission_basis_points, costs_pending,
              import_key, source_workbook, source_sheet, source_month, source_row,
              source_hash, created_by
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            sale.id,
            sale.saleNumber,
            sale.saleDate,
            sale.competency,
            sale.sellerName,
            sale.vehicle,
            sale.plate,
            sale.initialProviderId,
            sale.initialProviderName,
            sale.origin,
            sale.destination,
            sale.dueDate,
            sale.operationalStatus,
            sale.legacyOperationalStatus,
            "CLIENTE NÃO INFORMADO NA PLANILHA DE ORIGEM.",
            sale.freightAmountCents,
            sale.commissionBasisPoints,
            sale.importKey,
            CENTRAL_FRETE_IMPORT.workbookName,
            CENTRAL_FRETE_IMPORT.sourceSheet,
            sale.competency,
            sale.sourceRow,
            CENTRAL_FRETE_IMPORT.sourceHash,
            user.id,
          ),
      );
      statements.push(
        db
          .prepare(
            `insert into receivable_installments (
              id, sale_id, installment_number, installment_count, due_date,
              payment_method, financial_account_id, expected_amount_cents, notes
            ) values (?, ?, 1, 1, ?, ?, 'account-central-frete', ?, ?)`,
          )
          .bind(
            `installment-${sale.id}`,
            sale.id,
            sale.dueDate,
            sale.paymentMethod,
            sale.freightAmountCents,
            "PARCELA 1/1 IMPORTADA DA PLANILHA.",
          ),
      );
      let providerSlot = 0;
      sale.costs.forEach((cost, index) => {
        const [category, amountCents, description, sourceColumn] = cost;
        const isProvider = category === "PRESTADOR_SERVICO";
        if (isProvider) providerSlot += 1;
        statements.push(
          db
            .prepare(
              `insert into freight_costs (
                id, sale_id, category, description, amount_cents, confirmed,
                provider_slot, payment_status, source_column
              ) values (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
            )
            .bind(
              `cost-${sale.id}-${index + 1}`,
              sale.id,
              category,
              description,
              amountCents,
              isProvider && providerSlot <= 3 ? providerSlot : null,
              isProvider ? "EM_ABERTO" : "NAO_APLICAVEL",
              sourceColumn,
            ),
        );
      });
      statements.push(
        db
          .prepare(
            `insert into payment_transactions (
              id, sale_id, installment_id, type, status, amount_cents, occurred_at,
              payment_method, financial_account_id, notes, idempotency_key, created_by
            ) values (?, ?, ?, 'ADIANTAMENTO', 'CONFIRMADO', ?, ?, ?,
              'account-central-frete', ?, ?, ?)`,
          )
          .bind(
            `payment-${sale.id}-advance`,
            sale.id,
            `installment-${sale.id}`,
            sale.advance.amountCents,
            sale.advance.occurredAt,
            sale.paymentMethod,
            sale.advance.notes,
            `import:${sale.importKey}:advance`,
            user.id,
          ),
      );
    }

    const runId = crypto.randomUUID();
    statements.push(
      db
        .prepare(
          `insert into import_runs (
            id, import_key, workbook_name, source_hash, status, valid_rows,
            warning_rows, error_rows, imported_by
          ) values (?, ?, ?, ?, 'CONFIRMADO', ?, ?, ?, ?)`,
        )
        .bind(
          runId,
          CENTRAL_FRETE_IMPORT.importKey,
          CENTRAL_FRETE_IMPORT.workbookName,
          CENTRAL_FRETE_IMPORT.sourceHash,
          CENTRAL_FRETE_IMPORT.validRows,
          CENTRAL_FRETE_IMPORT.warningRows,
          CENTRAL_FRETE_IMPORT.errorRows,
          user.id,
        ),
    );
    statements.push(
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            new_value, request_id
          ) values (?, 'IMPORT_RUN', ?, 'IMPORT_CONFIRMED', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          runId,
          user.id,
          user.email,
          JSON.stringify({
            workbook: CENTRAL_FRETE_IMPORT.workbookName,
            sourceHash: CENTRAL_FRETE_IMPORT.sourceHash,
            sales: CENTRAL_FRETE_IMPORT.validRows,
          }),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
    );

    await db.batch(statements);
    return Response.json(
      {
        imported: true,
        alreadyImported: false,
        salesImported: CENTRAL_FRETE_IMPORT.validRows,
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
