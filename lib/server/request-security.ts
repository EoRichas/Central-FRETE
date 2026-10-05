import { ApiError } from './d1';

export function assertTrustedMutation(request: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  // SameSite alone does not protect against another site on a sibling subdomain.
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    throw new ApiError(403, 'Origem da solicitação não permitida.');
  }
  const configured = process.env.CENTRAL_FRETE_PUBLIC_ORIGIN?.trim();
  const expected = new URL(configured || request.url).origin;
  // Never trust a caller-supplied forwarded host as the expected origin.
  if (!origin || origin === 'null' || origin !== expected) {
    throw new ApiError(403, 'Origem da solicitação não permitida.');
  }
}

export async function readAuthJson(request: Request) {
  const limit = 16 * 1024;
  if (Number(request.headers.get('content-length')) > limit) throw new ApiError(413, 'Solicitação muito grande.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Solicitação inválida.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const {value,done} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new ApiError(413, 'Solicitação muito grande.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk,offset);offset += chunk.length;}
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new ApiError(400, 'Solicitação inválida.'); }
}
