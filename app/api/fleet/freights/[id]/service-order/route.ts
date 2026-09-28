import { authorize } from '@/lib/server/auth';
import { ApiError, jsonError } from '@/lib/server/d1';
import { fleetOrderTarget, issueOrder, orderReport, readOrderVersion } from '@/lib/server/service-orders';
import { renderServiceOrderPdf } from '@/lib/server/service-order-pdf';
type Context = {params:Promise<{id:string}>};
export async function GET(request:Request, context:Context) {
 try {
  const user=await authorize(request,['ADMIN','GERENCIA','FINANCEIRO']);
  const {id}=await context.params;const target=await fleetOrderTarget(id);
  const url=new URL(request.url);
  if(url.searchParams.get('format')!=='pdf') return Response.json(await orderReport(target.id,target.kind,user.id),{headers:{'Cache-Control':'no-store'}});
  const order=await readOrderVersion(target.id,undefined,target.kind);
  if(!order) throw new ApiError(404,'OS ainda não emitida.');
  const bytes=await renderServiceOrderPdf(order);
  const filename=`OS-Central-${order.snapshot.saleNumber.replace(/[^a-zA-Z0-9-]/g,'_')}.pdf`;
  return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`${url.searchParams.get('download')==='1'?'attachment':'inline'}; filename="${filename}"`}});
 }catch(error){return jsonError(error);}
}
export async function POST(request:Request,context:Context) {
 try {
  const user=await authorize(request,['ADMIN','GERENCIA','FINANCEIRO']);
  const {id}=await context.params;let target=await fleetOrderTarget(id);
  let report=await issueOrder(target.id,user,target.kind);
  // A concurrent commercial link may have adopted the fleet document while
  // issuance was waiting for the freight lock. Resolve the owner once more.
  if(target.kind==='fleet') { target=await fleetOrderTarget(id);if(target.kind==='sale') report=await issueOrder(target.id,user,target.kind); }
  return Response.json(report,{headers:{'Cache-Control':'no-store'}});
 }catch(error){return jsonError(error);}
}
