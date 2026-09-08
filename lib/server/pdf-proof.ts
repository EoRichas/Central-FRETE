import { ApiError } from "@/lib/server/d1";
export async function readPdfProof(candidate: FormDataEntryValue | null) {
 if (!(candidate instanceof File) || !candidate.size || candidate.size > 10 * 1024 * 1024) throw new ApiError(400, "Selecione um PDF de até 10 MB.");
 const buffer = await candidate.arrayBuffer();
 if (candidate.type !== "application/pdf" || new TextDecoder().decode(buffer.slice(0, 5)) !== "%PDF-") throw new ApiError(400, "O comprovante deve ser um arquivo PDF válido.");
 return { buffer, name: candidate.name.replace(/[\r\n\u0000-\u001f]/g, "").slice(0, 180), size: candidate.size };
}
