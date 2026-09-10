import { ApiError } from "@/lib/server/d1";
import { PROOF_FORMATS } from "@/lib/domain/proof-files";

export async function readPaymentProof(candidate: FormDataEntryValue | null) {
  if (!(candidate instanceof File) || !candidate.size || candidate.size > 10 * 1024 * 1024) {
    throw new ApiError(400, "Selecione um comprovante de até 10 MB.");
  }
  const buffer = await candidate.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  const text = (from: number, to: number) => new TextDecoder().decode(bytes.slice(from, to));
  let mimeType: string | null = null;
  if (text(0, 5) === "%PDF-") mimeType = "application/pdf";
  else if (starts(0xff, 0xd8, 0xff)) mimeType = "image/jpeg";
  else if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) mimeType = "image/png";
  else if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") mimeType = "image/webp";
  else if (["GIF87a", "GIF89a"].includes(text(0, 6))) mimeType = "image/gif";
  else if (text(0, 2) === "BM" && bytes.length >= 26) mimeType = "image/bmp";
  else if (starts(0x49, 0x49, 0x2a, 0) || starts(0x4d, 0x4d, 0, 0x2a)) mimeType = "image/tiff";
  else if (text(4, 8) === "ftyp" && bytes.length >= 16) {
    const boxSize = new DataView(buffer).getUint32(0);
    if (boxSize >= 16 && boxSize <= bytes.length && boxSize <= 256) {
      const brands = [text(8, 12)];
      for (let offset = 16; offset + 4 <= boxSize; offset += 4) brands.push(text(offset, offset + 4));
      if (brands.some((brand) => ["avif", "avis"].includes(brand))) mimeType = "image/avif";
      else if (brands.some((brand) => ["heic", "heix", "hevc", "hevx"].includes(brand))) mimeType = "image/heic";
      else if (brands.some((brand) => ["mif1", "msf1"].includes(brand))) mimeType = "image/heif";
    }
  }
  if (!mimeType) throw new ApiError(400, `Formato de comprovante inválido. ${PROOF_FORMATS}`);
  return { buffer, mimeType, name: candidate.name.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180) || "comprovante", size: candidate.size };
}
