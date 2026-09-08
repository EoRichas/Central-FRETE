import { ApiError, queryFirst } from "@/lib/server/d1";
export async function saleProof(saleId: string, id: unknown) {
 const proof = await queryFirst<{id: string; storageKey: string; fileName: string}>("select id, storage_key as storageKey, file_name as fileName from sale_attachments where id=? and sale_id=? and mime_type='application/pdf'", [String(id ?? ""), saleId]);
 if (!proof) throw new ApiError(400, "Selecione um comprovante PDF anexado a esta venda.");
 return proof;
}
