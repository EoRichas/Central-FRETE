import { LOCAL_SESSION_COOKIE } from "@/lib/server/local-session";

export async function POST() {
  return Response.json(
    { authenticated: false },
    {
      headers: {
        "set-cookie": `${LOCAL_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
        "cache-control": "no-store",
      },
    },
  );
}
