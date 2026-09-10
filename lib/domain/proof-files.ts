export const PROOF_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff,.avif,.heic,.heif";
export const PROOF_FORMATS = "PDF, JPG, PNG, WebP, GIF, BMP, TIFF, AVIF ou HEIC; até 10 MB.";
export const PROOF_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/tiff", "image/avif", "image/heic", "image/heif"] as const;

export function isProofMimeType(value: string) {
  return PROOF_MIME_TYPES.some((type) => type === value);
}
