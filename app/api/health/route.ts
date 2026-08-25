import { queryFirst } from "@/lib/server/d1";

export async function GET() {
  try {
    const result = await queryFirst<{ ok: number }>("select 1::integer as ok");
    if (result?.ok !== 1) throw new Error("database check failed");
    return Response.json(
      { status: "ok", service: "central-frete", database: "ok" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("central_frete_health_error", error);
    return Response.json(
      { status: "degraded", service: "central-frete", database: "unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
