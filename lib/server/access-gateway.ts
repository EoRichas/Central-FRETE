import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ApiError } from './d1';

const resolvers = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function assertAccessGateway(request: Request) {
  const issuerValue = process.env.CENTRAL_ACCESS_ISSUER?.trim();
  const audience = process.env.CENTRAL_ACCESS_AUDIENCE?.trim();
  if (!issuerValue && !audience) return;
  // An incomplete configuration fails closed, including direct hosting URLs.
  if (!issuerValue || !audience) throw new ApiError(503, 'Proteção de acesso não configurada.');
  let issuer: URL;
  try { issuer = new URL(issuerValue); } catch { throw new ApiError(503, 'Proteção de acesso não configurada.'); }
  if (issuer.protocol !== 'https:' || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer.hostname) || issuer.port || issuer.username || issuer.password || issuer.search || issuer.hash || issuer.pathname !== '/') {
    throw new ApiError(503, 'Proteção de acesso não configurada.');
  }
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token || token.length > 16384) throw new ApiError(403, 'Acesso permitido somente pela entrada corporativa.');
  const origin = issuer.origin;
  let keys = resolvers.get(origin);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${origin}/cdn-cgi/access/certs`), {timeoutDuration: 3000, cooldownDuration: 30000, cacheMaxAge: 600000});
    // Configuration changes must not accumulate arbitrary remote key sets.
    resolvers.clear(); resolvers.set(origin, keys);
  }
  try {
    const {payload} = await jwtVerify(token, keys, {issuer: origin, audience, algorithms: ['RS256'], requiredClaims: ['exp','iat','sub'], clockTolerance: 5});
    if (payload.type !== 'app' || typeof payload.email !== 'string' || !payload.email) throw new Error('User identity required');
  } catch {
    throw new ApiError(403, 'Acesso corporativo inválido ou expirado.');
  }
}
