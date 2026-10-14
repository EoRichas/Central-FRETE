import { authorize } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/d1";
import { forwardSupport, SupportError } from "@/lib/server/support-bridge";
export const runtime = "nodejs";
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const user = await authorize(request);
    return await forwardSupport(
      request,
      "central",
      user,
      (await context.params).path,
    );
  } catch (e) {
    if (e instanceof SupportError)
      return Response.json(
        { error: e.message },
        { status: e.status, headers: { "cache-control": "no-store" } },
      );
    return jsonError(e);
  }
}
export { handle as GET, handle as POST };
