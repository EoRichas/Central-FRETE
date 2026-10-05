import { NextResponse, type NextRequest } from 'next/server';
import { assertAccessGateway } from './lib/server/access-gateway';
import { assertTrustedMutation } from './lib/server/request-security';
import { ApiError } from './lib/server/d1';

export async function proxy(request: NextRequest) {
  let response: NextResponse;
  try {
    assertTrustedMutation(request);
    await assertAccessGateway(request);
    response = NextResponse.next();
  } catch (error) {
    response = NextResponse.json({error: error instanceof ApiError ? error.message : 'Acesso indisponível.'}, {status: error instanceof ApiError ? error.status : 503});
  }
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (request.nextUrl.pathname.startsWith('/api/') || response.status >= 400) {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
}

// Protect documents and static assets too when Access is enabled. No hostname
// exception lets a preview domain or direct origin skip the gateway.
export const config = { matcher: '/:path*' };
