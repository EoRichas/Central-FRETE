import { authorize } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/d1";

export async function GET(request: Request) {
  try {
    const user = await authorize(request);
    return Response.json({ user });
  } catch (error) {
    return jsonError(error);
  }
}

