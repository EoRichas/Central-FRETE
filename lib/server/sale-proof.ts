import { isProofMimeType } from "@/lib/domain/proof-files";
import { ApiError, queryFirst } from "@/lib/server/d1";
export async function saleProof(saleId: string, id: unknown) {
 const proof = await queryFirst<{id: string; storageKey: string; fileName: string; mimeType: string}>("select id, storage_key as storageKey, file_name as fileName, mime_type as mimeType from sale_attachments where id=? and sale_id=?", [String(id ?? ""), saleId]);
 if (!proof || !isProofMimeType(proof.mimeType)) throw new ApiError(400, "Selecione um comprovante anexado a esta venda.");
 return proof;
}
