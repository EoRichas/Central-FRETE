import { authorize } from '@/lib/server/auth';
import { ApiError, jsonError } from '@/lib/server/d1';
import { authorizeOrder, issueOrder, orderReport, readOrderVersion } from '@/lib/server/service-orders';
import { renderServiceOrderPdf } from '@/lib/server/service-order-pdf';
type Context = { params: Promise<{id:string}> };
export async function GET(request: Request, context: Context) {
  try {
    const user = await authorize(request);
    const {id} = await context.params;
    await authorizeOrder(user,id);
    const url = new URL(request.url);
    if (url.searchParams.get('format') !== 'pdf') return Response.json(await orderReport(id),{headers:{'Cache-Control':'no-store'}});
    const inputVersion = url.searchParams.get('version');
    const version = inputVersion === null ? undefined : Number(inputVersion);
    if (version !== undefined && (!Number.isSafeInteger(version) || version < 1)) throw new ApiError(400,'Versão inválida.');
    const order = await readOrderVersion(id,version);
    if (!order) throw new ApiError(404,'OS ainda não emitida.');
    const bytes = await renderServiceOrderPdf(order);
    const filename = `OS-Central-${order.snapshot.saleNumber.replace(/[^a-zA-Z0-9-]/g,'_')}-v${order.version}.pdf`;
    return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff','Content-Disposition':`${url.searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="${filename}"`}});
  } catch(error) { return jsonError(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const user = await authorize(request,['ADMIN','GERENCIA','VENDEDOR','FINANCEIRO']);
    const {id} = await context.params;
    await authorizeOrder(user,id);
    return Response.json(await issueOrder(id,user),{headers:{'Cache-Control':'no-store'}});
  } catch(error) { return jsonError(error); }
}
