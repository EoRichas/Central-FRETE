import { authorize } from "@/lib/server/auth";
import { ApiError, getBucket, jsonError, queryFirst } from "@/lib/server/d1";
export async function GET(request: Request, context: { params: Promise<{ id: string; attachmentId: string }> }) {
 try {
  await authorize(request, ["ADMIN", "GERENCIA", "FINANCEIRO", "OPERACIONAL"]);
  const { id, attachmentId } = await context.params;
  const proof = await queryFirst<{ storageKey: string; fileName: string }>("select storage_key as storageKey, file_name as fileName from fleet_attachments where id = ? and freight_id = ?", [attachmentId, id]);
  if (!proof) throw new ApiError(404, "Comprovante não encontrado.");
  const file = await (await getBucket()).get(proof.storageKey);
  if (!file) throw new ApiError(404, "Arquivo não encontrado.");
  const headers = new Headers({ "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(proof.fileName)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  file.writeHttpMetadata(headers);
  return new Response(file.body, { headers });
 } catch(error) { return jsonError(error); }
}
