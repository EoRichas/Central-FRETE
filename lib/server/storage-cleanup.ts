import { getBucket, getD1, queryAll, queryFirst } from "@/lib/server/d1";

/** Idempotent retry after the transaction commits; failures remain durable. */
async function drainJobs() {
  const jobs = await queryAll<{ storageKey: string }>(
    `select storage_key as storageKey from storage_cleanup_jobs order by last_attempt_at nulls first, created_at limit 100`,
  );
  const db = await getD1();
  for (const job of jobs) {
    try {
      // A shared legacy key must remain while another receipt still references it.
      const referenced = await queryFirst(
        `select 1 from sale_attachments where storage_key=? union all select 1 from fleet_attachments where storage_key=? union all select 1 from payment_transactions where proof_key=? limit 1`,
        [job.storageKey, job.storageKey, job.storageKey],
      );
      if (referenced) continue;
      await (await getBucket()).delete(job.storageKey);
      await db
        .prepare("delete from storage_cleanup_jobs where storage_key=?")
        .bind(job.storageKey)
        .run();
    } catch (error) {
      console.error("storage_cleanup_pending", {
        message: error instanceof Error ? error.message : "unknown",
      });
      await db
        .prepare(
          "update storage_cleanup_jobs set attempts=attempts+1,last_attempt_at=now() where storage_key=?",
        )
        .bind(job.storageKey)
        .run();
    }
  }
  return Boolean(
    await queryFirst("select 1 from storage_cleanup_jobs limit 1"),
  );
}

export async function drainStorageCleanup() {
  try {
    return await drainJobs();
  } catch (error) {
    console.error("storage_cleanup_retry_required", error);
    return true;
  }
}
