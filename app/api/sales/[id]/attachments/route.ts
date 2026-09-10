import { readPaymentProof } from "@/lib/server/payment-proof";
import { authorize } from "@/lib/server/auth";
import { ApiError, getBucket, getD1, jsonError } from "@/lib/server/d1";
import { getSale } from "@/lib/server/repository";
import { upper } from "@/lib/server/validation";


type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await authorize(request);
    const { id } = await context.params;
    const sale = await getSale(user, id);
    if (!sale) throw new ApiError(404, "Venda não encontrada.");
    return Response.json({ attachments: sale.attachments });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  let uploadedKey: string | null = null;
  try {
    const user = await authorize(request, ["ADMIN", "FINANCEIRO", "VENDEDOR"]);
    const { id: saleId } = await context.params;
    const sale = await getSale(user, saleId);
    if (!sale) throw new ApiError(404, "Venda não encontrada.");

    const form = await request.formData();
    const candidate = form.get("file");
    const proof = await readPaymentProof(candidate);
    const attachmentId = crypto.randomUUID();
    const fileName = proof.name;
    const description = upper(form.get("description"))?.slice(0, 300) ?? null;
    uploadedKey = `sales/${saleId}/attachments/${attachmentId}`;
    await (await getBucket()).put(uploadedKey, proof.buffer, {
      httpMetadata: { contentType: proof.mimeType },
      customMetadata: { originalName: fileName },
    });

    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `insert into sale_attachments (
            id, sale_id, storage_key, file_name, mime_type, size_bytes,
            description, uploaded_by
          ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          attachmentId,
          saleId,
          uploadedKey,
          fileName,
          proof.mimeType,
          proof.size,
          description,
          user.id,
        ),
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            new_value, request_id
          ) values (?, 'SALE_ATTACHMENT', ?, 'CREATED', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          attachmentId,
          user.id,
          user.email,
          JSON.stringify({ saleId, fileName, sizeBytes: proof.size, description }),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
    ]);
    return Response.json({ id: attachmentId }, { status: 201 });
  } catch (error) {
    if (uploadedKey) {
      try {
        await (await getBucket()).delete(uploadedKey);
      } catch (cleanupError) {
        console.warn("sale_attachment_cleanup_failed", {
          message:
            cleanupError instanceof Error ? cleanupError.message : "unknown",
        });
      }
    }
    return jsonError(error);
  }
}
