import { authorize } from "@/lib/server/auth";
import { ApiError, getBucket, jsonError, queryFirst } from "@/lib/server/d1";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    await authorize(request);
    const { id } = await context.params;
    const payment = await queryFirst<{ proofKey: string | null; proofName: string | null }>(
      `select proof_key as proofKey, proof_name as proofName
       from payment_transactions where id = ?`,
      [id],
    );
    if (!payment?.proofKey) throw new ApiError(404, "Comprovante não encontrado.");
    const object = await (await getBucket()).get(payment.proofKey);
    if (!object) throw new ApiError(404, "Comprovante não encontrado.");
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set(
      "content-disposition",
      `inline; filename="${(payment.proofName ?? "comprovante").replace(/["\\]/g, "")}"`,
    );
    headers.set("cache-control", "private, no-store");
    return new Response(object.body, { headers });
  } catch (error) {
    return jsonError(error);
  }
}
