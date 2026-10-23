import { createHash } from 'node:crypto';
import { authorize } from '@/lib/server/auth';
import { ApiError,jsonError,withDatabaseTransaction } from '@/lib/server/d1';
import { asObject,dateOnly,enumValue,integerInRange,requiredString } from '@/lib/server/validation';
import { readAuthJson } from '@/lib/server/request-security';

type Item={sourceKind:'sale'|'freight';id:string;expectedBalanceCents:number};
export async function POST(request:Request){
 try{
  const user=await authorize(request,['ADMIN','FINANCEIRO']);
  const payload=asObject(await readAuthJson(request));
  const clientId=requiredString(payload.clientId,'Cliente');
  const date=dateOnly(payload.paidAt,'Data do recebimento');
  if(new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw new ApiError(400,'Data do recebimento inválida.');
  const occurredAt=date+'T15:00:00.000Z';
  const paymentMethod=enumValue(payload.paymentMethod,'Forma de pagamento',['PIX','BOLETO','DINHEIRO','CREDITO','DEBITO','FATURADO'] as const);
  const key=request.headers.get('idempotency-key')?.trim();
  if(!key||key.length>120||clientId.length>80)throw new ApiError(400,'Identificação inválida da baixa.');
  if(!Array.isArray(payload.items)||!payload.items.length||payload.items.length>50)throw new ApiError(400,'Selecione de 1 a 50 vendas do mesmo cliente.');
  const items:Item[]=payload.items.map(value=>{const item=asObject(value),id=requiredString(item.id,'Venda');if(id.length>80)throw new ApiError(400,'Venda inválida.');return {sourceKind:enumValue(item.sourceKind,'Origem',['SALE','FREIGHT'] as const).toLowerCase() as Item['sourceKind'],id,expectedBalanceCents:integerInRange(item.expectedBalanceCents,'Saldo da venda',1,9_000_000_000_000)};});
  items.sort((a,b)=>`${a.sourceKind}:${a.id}`.localeCompare(`${b.sourceKind}:${b.id}`));
  if(new Set(items.map(i=>`${i.sourceKind}:${i.id}`)).size!==items.length)throw new ApiError(400,'A mesma venda foi selecionada mais de uma vez.');
  const fingerprint=createHash('sha256').update(JSON.stringify({clientId,date,paymentMethod,items})).digest('hex');
  const result=await withDatabaseTransaction(async db=>{
   await db.queryFirst('select pg_advisory_xact_lock(hashtext(?))',[`finance-payment-batch:${key}`]);
   const old=await db.queryFirst<{actorId:string;fingerprint:string;result:Record<string,unknown>}>('select actor_user_id as actorId,fingerprint,result from finance_payment_batches where id=?',[key]);
   if(old){if(old.actorId!==user.id||old.fingerprint!==fingerprint)throw new ApiError(409,'Esta chave já foi utilizada em outra baixa.');return {...old.result,duplicate:true};}
   const records:{item:Item;balance:number;number:string}[]=[];
   for(const item of items){
    if(item.sourceKind==='freight'){
     const row=await db.queryFirst<{clientId:string|null;amount:number;status:string;number:string}>('select client_id as clientId,freight_amount_cents as amount,payment_status as status,sale_number as number from fleet_freights where id=? for update',[item.id]);
     if(!row)throw new ApiError(404,'Frete não encontrado.');
     if(row.clientId!==clientId)throw new ApiError(400,'Todas as vendas devem pertencer ao mesmo cliente cadastrado.');
     const balance=row.status==='PAGO'?0:row.amount;
     if(balance!==item.expectedBalanceCents)throw new ApiError(409,'O saldo ou a situação mudou. Atualize a consulta antes de baixar.');
     records.push({item,balance,number:row.number});
    }else{
     const row=await db.queryFirst<{clientId:string|null;amount:number;linked:string|null;number:string}>('select client_id as clientId,freight_amount_cents as amount,fleet_freight_id as linked,sale_number as number from freight_sales where id=? for update',[item.id]);
     if(!row)throw new ApiError(404,'Venda não encontrada.');
     if(row.linked)throw new ApiError(409,'Selecione o frete original da venda vinculada.');
     if(row.clientId!==clientId)throw new ApiError(400,'Todas as vendas devem pertencer ao mesmo cliente cadastrado.');
     const paid=await db.queryFirst<{total:number}>(`select coalesce(sum(case when type='ESTORNO' then -amount_cents else amount_cents end),0) as total from payment_transactions where sale_id=? and status='CONFIRMADO'`,[item.id]);
     const balance=Math.max(0,row.amount-(paid?.total??0));
     if(balance!==item.expectedBalanceCents)throw new ApiError(409,'O saldo ou a situação mudou. Atualize a consulta antes de baixar.');
     records.push({item,balance,number:row.number});
    }
   }
   const total=records.reduce((sum,r)=>sum+r.balance,0);if(!Number.isSafeInteger(total))throw new ApiError(400,'Total da baixa acima do limite.');
   for(const {item,balance,number} of records){
    if(item.sourceKind==='freight')await db.queryFirst("update fleet_freights set payment_status='PAGO',paid_at=?,updated_by=? where id=? returning id",[occurredAt,user.id,item.id]);
    else await db.queryFirst(`insert into payment_transactions(id,sale_id,type,status,amount_cents,occurred_at,payment_method,idempotency_key,created_by,notes) values (?,?,'RECEBIMENTO','CONFIRMADO',?,?,?,?,?,'Baixa em lote') returning id`,[crypto.randomUUID(),item.id,balance,occurredAt,paymentMethod,`batch:${createHash('sha256').update(key+':'+item.id).digest('hex')}`,user.id]);
    await db.queryFirst(`insert into audit_logs(id,entity_type,entity_id,action,actor_user_id,actor_email,new_value,request_id) values (?,'FINANCE_PAYMENT',?,'BATCH_SETTLED',?,?,?,?) returning id`,[crypto.randomUUID(),`${item.sourceKind}:${item.id}`,user.id,user.email,JSON.stringify({clientId,amountCents:balance,paidAt:occurredAt,saleNumber:number}),key]);
   }
   const output={updated:true,count:records.length,totalCents:total};
   await db.queryFirst('insert into finance_payment_batches(id,actor_user_id,fingerprint,result) values (?,?,?,?::text::jsonb) returning id',[key,user.id,fingerprint,JSON.stringify(output)]);
   return output;
  });
  return Response.json(result,{headers:{'cache-control':'private, no-store'}});
 }catch(error){return jsonError(error);}
}
