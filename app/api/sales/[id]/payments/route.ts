import { authorize } from "@/lib/server/auth";
import {
  ApiError,
  getBucket,
  getD1,
  jsonError,
  queryFirst,
} from "@/lib/server/d1";
import { getSale } from "@/lib/server/repository";
import {
  enumValue,
  integerInRange,
  requiredString,
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
const PAYMENT_TYPES = ["ADIANTAMENTO", "RECEBIMENTO"] as const;
const PAYMENT_STATUSES = ["PENDENTE", "CONFIRMADO"] as const;
const ALLOWED_PROOF_TYPES = ["application/pdf", "image/jpeg", "image/png"];

type RouteContext = { params: Promise<{ id: string }> };

function normalizeOccurredAt(value: unknown) {
  const raw = requiredString(value, "Data do recebimento");
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T15:00:00.000Z`
    : raw;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, "Data do recebimento inválida.");
  }
  return parsed.toISOString();
}

export async function POST(request: Request, context: RouteContext) {
  let uploadedKey: string | null = null;
  try {
    const user = await authorize(request, ["ADMIN", "FINANCEIRO"]);
    const { id: saleId } = await context.params;
    const sale = await getSale(user, saleId);
    if (!sale) throw new ApiError(404, "Venda não encontrada.");

    const idempotencyKey =
      request.headers.get("idempotency-key")?.trim() || "";
    if (!idempotencyKey || idempotencyKey.length > 120) {
      throw new ApiError(400, "Chave de idempotência ausente ou inválida.");
    }
    const duplicate = await queryFirst<{ id: string }>(
      `select id from payment_transactions where idempotency_key = ?`,
      [idempotencyKey],
    );
    if (duplicate) {
      return Response.json({ id: duplicate.id, duplicate: true });
    }

    const contentType = request.headers.get("content-type") ?? "";
    let values: Record<string, unknown> = {};
    let proof: File | null = null;
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      for (const [key, value] of form.entries()) {
        if (key === "proof" && value instanceof File && value.size > 0) {
          proof = value;
        } else if (typeof value === "string") {
          values[key] = value;
        }
      }
    } else {
      values = (await request.json()) as Record<string, unknown>;
    }

    const type = enumValue(values.type, "Tipo", PAYMENT_TYPES);
    const status = enumValue(values.status, "Situação", PAYMENT_STATUSES);
    const amountCents = integerInRange(
      values.amountCents,
      "Valor recebido",
      1,
      9_000_000_000_000,
    );
    const occurredAt = normalizeOccurredAt(values.occurredAt);
    const paymentMethod = enumValue(
      values.paymentMethod,
      "Forma de pagamento",
      PAYMENT_METHODS,
    );
    const installmentId = String(values.installmentId ?? "").trim() || null;
    if (
      installmentId &&
      !sale.installments.some((installment) => installment.id === installmentId)
    ) {
      throw new ApiError(400, "Parcela não pertence a esta venda.");
    }

    let proofName: string | null = null;
    if (proof) {
      if (proof.size > 10 * 1024 * 1024) {
        throw new ApiError(400, "O comprovante deve ter no máximo 10 MB.");
      }
      if (!ALLOWED_PROOF_TYPES.includes(proof.type)) {
        throw new ApiError(400, "Envie comprovante PDF, JPG ou PNG.");
      }
      proofName = proof.name.slice(0, 180);
      uploadedKey = `payments/${saleId}/${crypto.randomUUID()}`;
      await (await getBucket()).put(uploadedKey, await proof.arrayBuffer(), {
        httpMetadata: { contentType: proof.type },
        customMetadata: { originalName: proofName },
      });
    }

    const transactionId = crypto.randomUUID();
    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `insert into payment_transactions (
            id, sale_id, installment_id, type, status, amount_cents,
            occurred_at, payment_method, notes, idempotency_key,
            proof_key, proof_name, created_by
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          transactionId,
          saleId,
          installmentId,
          type,
          status,
          amountCents,
          occurredAt,
          paymentMethod,
          upper(values.notes),
          idempotencyKey,
          uploadedKey,
          proofName,
          user.id,
        ),
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            new_value, request_id
          ) values (?, 'PAYMENT_TRANSACTION', ?, 'CREATED', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          transactionId,
          user.id,
          user.email,
          JSON.stringify({ type, status, amountCents, saleId, occurredAt }),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
    ]);
    return Response.json({ id: transactionId, duplicate: false }, { status: 201 });
  } catch (error) {
    if (uploadedKey) {
      try {
        await (await getBucket()).delete(uploadedKey);
      } catch (cleanupError) {
        console.warn("payment_proof_cleanup_failed", {
          message:
            cleanupError instanceof Error ? cleanupError.message : "unknown",
        });
      }
    }
    return jsonError(error);
  }
}
