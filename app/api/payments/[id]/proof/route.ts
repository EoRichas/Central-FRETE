import { authorize } from "@/lib/server/auth";
import { ApiError, getBucket, jsonError, queryFirst } from "@/lib/server/d1";
import { getSale } from "@/lib/server/repository";

type RouteContext = { params: Promise<{ id: string }> };

type PaymentProofRow = {
  saleId: string;
  proofKey: string | null;
  proofName: string | null;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await authorize(request);
    const { id } = await context.params;
    const payment = await queryFirst<PaymentProofRow>(
      `select sale_id as saleId, proof_key as proofKey, proof_name as proofName
       from payment_transactions where id = ?`,
      [id],
    );
    if (!payment?.proofKey) throw new ApiError(404, "Comprovante não encontrado.");

    const sale = await getSale(user, payment.saleId);
    if (!sale) throw new ApiError(404, "Comprovante não encontrado.");

    const object = await (await getBucket()).get(payment.proofKey);
    if (!object) throw new ApiError(404, "Comprovante não encontrado.");
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set(
      "content-disposition",
      `inline; filename="${(payment.proofName ?? "comprovante").replace(/["\\]/g, "")}"`,
    );
    headers.set("cache-control", "private, no-store");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  } catch (error) {
    return jsonError(error);
  }
}
