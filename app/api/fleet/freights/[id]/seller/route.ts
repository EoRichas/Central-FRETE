import { authorize } from '@/lib/server/auth';
import { jsonError } from '@/lib/server/d1';
import { readAuthJson } from '@/lib/server/request-security';
import { transferSeller } from '@/lib/server/seller-transfer';
export async function PATCH(request:Request, context:{params:Promise<{id:string}>}) {
  try {
    const user=await authorize(request);
    const {id}=await context.params;
    const result=await transferSeller(user,'freight',id,await readAuthJson(request),request.headers.get('x-request-id')??crypto.randomUUID());
    return Response.json(result,{headers:{'cache-control':'private, no-store'}});
  } catch(error) { return jsonError(error); }
}
