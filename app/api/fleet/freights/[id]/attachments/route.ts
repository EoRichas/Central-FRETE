import { authorize } from "@/lib/server/auth";
import { ApiError, getBucket, getD1, jsonError, queryAll, queryFirst } from "@/lib/server/d1";
import { readPaymentProof } from "@/lib/server/payment-proof";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
 try {
  await authorize(request, ["ADMIN", "GERENCIA", "FINANCEIRO", "OPERACIONAL"]);
  const { id } = await context.params;
  const attachments = await queryAll("select id, file_name as fileName, created_at as createdAt from fleet_attachments where freight_id = ? order by created_at desc", [id]);
  return Response.json({ attachments });
 } catch(error) { return jsonError(error); }
}
export async function POST(request: Request, context: Context) {
 let key: string | null = null;
 try {
  const user = await authorize(request, ["ADMIN", "GERENCIA", "FINANCEIRO", "OPERACIONAL"]);
  const { id } = await context.params;
  if (!await queryFirst("select id from fleet_freights where id = ?", [id])) throw new ApiError(404, "Frete não encontrado.");
  const file = await readPaymentProof((await request.formData()).get("file"));
  const attachmentId = crypto.randomUUID();
  key = `fleet/${id}/${attachmentId}`;
  await (await getBucket()).put(key, file.buffer, { httpMetadata: { contentType: file.mimeType } });
  const db = await getD1();
  await db.batch([
   db.prepare("insert into fleet_attachments(id, freight_id, storage_key, file_name, size_bytes, uploaded_by) values (?, ?, ?, ?, ?, ?)").bind(attachmentId, id, key, file.name, file.size, user.id),
   db.prepare("insert into audit_logs(id, entity_type, entity_id, action, actor_user_id, actor_email) values (?, 'FLEET_ATTACHMENT', ?, 'CREATED', ?, ?)").bind(crypto.randomUUID(), attachmentId, user.id, user.email),
  ]);
  return Response.json({ id: attachmentId }, { status: 201 });
 } catch(error) {
  if (key) try { await (await getBucket()).delete(key); } catch { /* Preserve original error. */ }
  return jsonError(error);
 }
}
