import { createHmac, timingSafeEqual } from "node:crypto";
import { SupportError } from "./support-bridge.ts";

const nonces = new Map<string, number>();
const limits = new Map<string, { count: number; until: number }>();
export type DirectoryCompany = "central" | "czar" | "ekon";

export function verifyDirectory(request: Request, company: DirectoryCompany) {
  const key = process.env[`SUP_${company.toUpperCase()}_KEY`];
  const identityKey = process.env[`SUP_${company.toUpperCase()}_IDENTITY_KEY`];
  if (!key || key.length < 48 || !identityKey || identityKey.length < 48)
    throw new SupportError(503, "Diretório indisponível.");
  const stamp = request.headers.get("x-support-time") || "";
  const nonce = request.headers.get("x-support-nonce") || "";
  const signature = request.headers.get("x-support-signature") || "";
  const now = Date.now();
  if (request.method !== "GET" || request.headers.has("cookie") || request.headers.has("origin") ||
      !/^\d{13}$/.test(stamp) || Math.abs(now - Number(stamp)) > 120000 ||
      !/^[0-9a-f-]{36}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature))
    throw new SupportError(401, "Acesso não autorizado.");
  const expected = createHmac("sha256", key).update(`directory.v1.${company}.${stamp}.${nonce}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
    throw new SupportError(401, "Acesso não autorizado.");
  for (const [k, until] of nonces) if (until < now) nonces.delete(k);
  const nonceKey = `${company}:${nonce}`;
  if (nonces.has(nonceKey)) throw new SupportError(409, "Solicitação já recebida.");
  const rate = limits.get(company);
  const current = rate && rate.until > now ? rate : { count: 0, until: now + 60000 };
  current.count++; limits.set(company, current);
  if (current.count > 120 || nonces.size >= 10000) throw new SupportError(429, "Aguarde antes de tentar novamente.");
  nonces.set(nonceKey, now + 240000);
  return (rows: Array<{ id: string; name: string }>) => {
    if (rows.length > 1000) throw new SupportError(503, "Diretório excedeu o limite. Contate o administrador.");
    return { contacts: rows.map(row => ({
      ref: createHmac("sha256", identityKey).update(`${company}:${row.id}`).digest("hex"),
      name: row.name.trim().slice(0,100) || "Usuário",
    })) };
  };
}
export function directoryError(error: unknown) {
  return Response.json({ error: error instanceof SupportError ? error.message : "Diretório indisponível." }, {
    status: error instanceof SupportError ? error.status : 503,
    headers: { "cache-control": "private, no-store" },
  });
}
