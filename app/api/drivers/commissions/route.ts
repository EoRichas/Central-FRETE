import { authorize } from '@/lib/server/auth';
import { ApiError,getD1,jsonError } from '@/lib/server/d1';
import { asObject,dateOnly,enumValue,requiredString } from '@/lib/server/validation';

export async function PATCH(request:Request){
 try {
  const user=await authorize(request,['ADMIN']);
  const payload=asObject(await request.json());
  const freightId=requiredString(payload.freightId,'Frete');
  if(freightId.length>80)throw new ApiError(400,'Frete inválido.');
  const status=enumValue(payload.status,'Situação da comissão',['EM_ABERTO','PAGO'] as const);
  const paidAt=status==='PAGO'?dateOnly(payload.paidAt,'Data do pagamento'):null;
  if(paidAt&&new Date(paidAt+'T12:00:00Z').toISOString().slice(0,10)!==paidAt)throw new ApiError(400,'Data do pagamento inválida.');
  const pixDetails=String(payload.pixDetails??'').trim()||null;
  if(pixDetails&&pixDetails.length>2000)throw new ApiError(400,'Dados PIX muito extensos.');
  const db=await getD1();
  // Lock this freight before updating its individual commission, driver PIX and audit.
  const result=await db.batch([
   db.prepare(`insert into driver_commission_payments(freight_id,status,paid_at,paid_by,pix_details)
    values(?,?,?,?,?) on conflict(freight_id) do update set status=excluded.status,
    paid_at=excluded.paid_at,paid_by=excluded.paid_by,pix_details=excluded.pix_details,updated_at=now()`)
    .bind(freightId,status,paidAt,status==='PAGO'?user.id:null,pixDetails),
   db.prepare(`update fleet_drivers set pix_details=? where id=(select driver_id from fleet_freights where id=?)`).bind(pixDetails,freightId),
  ],async tx=>{
   const freight=await tx.queryFirst<{driverName:string}>(`select driver_name as driverName from fleet_freights where id=? for update`,[freightId]);
   if(!freight)throw new ApiError(404,'Comissão do frete não encontrada.');
   const previous=await tx.queryFirst(`select status,paid_at,paid_by from driver_commission_payments where freight_id=?`,[freightId]);
   await tx.queryAll(`insert into audit_logs(id,entity_type,entity_id,action,actor_user_id,actor_email,previous_value,new_value,request_id)
    values(?,'DRIVER_COMMISSION',?,'STATUS_UPDATED',?,?,?,?,?)`,[
    crypto.randomUUID(),freightId,user.id,user.email,previous?JSON.stringify(previous):null,
    JSON.stringify({freightId,driverName:freight.driverName,status,paidAt}),request.headers.get('x-request-id')??crypto.randomUUID(),
   ]);
  });
  return Response.json({freightId,status,paidAt,updated:Boolean(result.length)},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return jsonError(error);}
}
