import { authorize } from "@/lib/server/auth";
import { ApiError, getBucket, jsonError, queryFirst } from "@/lib/server/d1";
export async function GET(request: Request, context: { params: Promise<{ id: string; attachmentId: string }> }) {
 try {
  await authorize(request, ["ADMIN", "GERENCIA", "FINANCEIRO"]);
  const { id, attachmentId } = await context.params;
  const proof = await queryFirst<{ storageKey: string }>("select storage_key as storageKey from fleet_attachments where id = ? and freight_id = ?", [attachmentId, id]);
  if (!proof) throw new ApiError(404, "Comprovante não encontrado.");
  const file = await (await getBucket()).get(proof.storageKey);
  if (!file) throw new ApiError(404, "Arquivo não encontrado.");
  return new Response(file.body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="comprovante.pdf"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
 } catch(error) { return jsonError(error); }
}
