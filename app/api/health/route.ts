export async function GET() {
  return Response.json(
    { status: "ok", service: "central-frete" },
    { headers: { "cache-control": "no-store" } },
  );
}
