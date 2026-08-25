import { authorize } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/d1";
import { dashboard } from "@/lib/server/repository";

export async function GET(request: Request) {
  try {
    const user = await authorize(request);
    const url = new URL(request.url);
    const competency = url.searchParams.get("competency") ?? "2026-08";
    if (!/^\d{4}-\d{2}$/.test(competency)) {
      return Response.json({ error: "Competência inválida." }, { status: 400 });
    }
    return Response.json({ data: await dashboard(user, competency) });
  } catch (error) {
    return jsonError(error);
  }
}

