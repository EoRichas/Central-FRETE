import { authorize } from "@/lib/server/auth";
import { ApiError, getBucket, jsonError, queryFirst } from "@/lib/server/d1";
import { getSale } from "@/lib/server/repository";

type RouteContext = {
  params: Promise<{ id: string; attachmentId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await authorize(request);
    const { id: saleId, attachmentId } = await context.params;
    const sale = await getSale(user, saleId);
    if (!sale) throw new ApiError(404, "Venda não encontrada.");

    const attachment = await queryFirst<{
      storageKey: string;
      fileName: string;
    }>(
      `select storage_key as storageKey, file_name as fileName
       from sale_attachments where id = ? and sale_id = ?`,
      [attachmentId, saleId],
    );
    if (!attachment) throw new ApiError(404, "Comprovante não encontrado.");

    const object = await (await getBucket()).get(attachment.storageKey);
    if (!object) throw new ApiError(404, "Comprovante não encontrado.");
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set(
      "content-disposition",
      `inline; filename="${attachment.fileName.replace(/["\\]/g, "")}"`,
    );
    headers.set("cache-control", "private, no-store");
    return new Response(object.body, { headers });
  } catch (error) {
    return jsonError(error);
  }
}
