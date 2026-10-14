import { createHmac, randomUUID } from "node:crypto";

export class SupportError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export type SupportActor = { id: string; name: string };

export async function forwardSupport(
  request: Request,
  company: "central" | "czar" | "ekon",
  user: SupportActor,
  segments: string[],
) {
  const originValue = process.env.SUP_SUPPORT_ORIGIN;
  const key = process.env[`SUP_${company.toUpperCase()}_KEY`];
  const identityKey = process.env[`SUP_${company.toUpperCase()}_IDENTITY_KEY`];
  if (
    !originValue ||
    !key ||
    key.length < 48 ||
    !identityKey ||
    identityKey.length < 48
  )
    throw new SupportError(
      503,
      "O suporte ainda não está conectado. Tente novamente mais tarde.",
    );
  let origin: URL;
  try {
    origin = new URL(originValue);
  } catch {
    throw new SupportError(503, "Suporte indisponível.");
  }
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new SupportError(503, "Suporte indisponível.");
  const route = segments.join("/");
  const read =
    /^(?:me|tickets(?:\/[0-9a-f-]{36})?|attachments\/[0-9a-f-]{36})$/.test(
      route,
    );
  const write = /^tickets(?:\/[0-9a-f-]{36}\/(?:messages|attachments))?$/.test(
    route,
  );
  if (
    !(
      (request.method === "GET" && read) ||
      (request.method === "POST" && write)
    )
  )
    throw new SupportError(404, "Operação de suporte não encontrada.");
  let body: unknown;
  if (request.method === "POST") {
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new SupportError(415, "Envie os dados em JSON.");
    const max = route.endsWith("/attachments") ? 7000000 : 16000;
    if (Number(request.headers.get("content-length")) > max)
      throw new SupportError(413, "Envio muito grande.");
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > max) {
            await reader.cancel();
            throw new SupportError(413, "Envio muito grande.");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    try {
      body = JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      throw new SupportError(400, "Dados inválidos.");
    }
  }
  const page = new URL(request.url).searchParams.get("page");
  const suffix =
    route === "tickets" &&
    request.method === "GET" &&
    page &&
    /^\d{1,5}$/.test(page)
      ? `?page=${page}`
      : "";
  const payload = JSON.stringify({
    method: request.method,
    path: `/api/${route}${suffix}`,
    body,
    actor: {
      ref: createHmac("sha256", identityKey)
        .update(`${company}:${user.id}`)
        .digest("hex"),
      name: user.name.trim().split(/\s+/)[0].slice(0, 80) || "Usuário",
    },
  });
  const stamp = String(Date.now()),
    nonce = randomUUID();
  const signature = createHmac("sha256", key)
    .update(`${stamp}.${nonce}.${payload}`)
    .digest("hex");
  let result: Response;
  try {
    result = await fetch(new URL("/api/integration", origin), {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(25000),
      headers: {
        "content-type": "application/json",
        "x-support-source": company,
        "x-support-time": stamp,
        "x-support-nonce": nonce,
        "x-support-signature": signature,
      },
      body: payload,
    });
  } catch {
    throw new SupportError(
      503,
      "O suporte não respondeu. Aguarde e tente novamente; seu texto continua nesta tela.",
    );
  }
  if (result.status >= 500 || result.status === 401)
    throw new SupportError(
      503,
      "O suporte está temporariamente indisponível. Tente novamente.",
    );
  const headers = new Headers({
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  });
  for (const name of ["content-type", "content-disposition"]) {
    const value = result.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(result.body, { status: result.status, headers });
}
