import { authorize } from "@/lib/server/auth";
import { jsonError, queryFirst } from "@/lib/server/d1";
import { drainStorageCleanup } from "@/lib/server/storage-cleanup";
export async function POST(request: Request) {
  try {
    await authorize(request, ["ADMIN"]);
    return Response.json({
      storageCleanupPending: await drainStorageCleanup(),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  try {
    await authorize(request, ["ADMIN"]);
    const row = await queryFirst<{ count: number }>(
      "select count(*) as count from storage_cleanup_jobs",
    );
    return Response.json({ pending: row?.count ?? 0 });
  } catch (error) {
    return jsonError(error);
  }
}
