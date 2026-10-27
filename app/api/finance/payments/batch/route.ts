import { createHash } from 'node:crypto';
import { authorize } from '@/lib/server/auth';
import { ApiError,jsonError,withDatabaseTransaction } from '@/lib/server/d1';
import { asObject,dateOnly,enumValue,integerInRange,requiredString } from '@/lib/server/validation';
import { readAuthJson } from '@/lib/server/request-security';

type Item={sourceKind:'sale'|'freight';id:string;expectedBalanceCents:number};
export async function POST(request:Request){
 try{
  const user=await authorize(request,['ADMIN','FINANCEIRO']);
  const payload=asObject(await readAuthJson(request, 1024 * 1024));
  const clientId=requiredString(payload.clientId,'Cliente');
  const date=dateOnly(payload.paidAt,'Data do recebimento');
  if(new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw new ApiError(400,'Data do recebimento inválida.');
  const occurredAt=date+'T15:00:00.000Z';
  const paymentMethod=enumValue(payload.paymentMethod,'Forma de pagamento',['PIX','BOLETO','DINHEIRO','CREDITO','DEBITO','FATURADO'] as const);
  const key=request.headers.get('idempotency-key')?.trim();
  if(!key||key.length>120||clientId.length>80)throw new ApiError(400,'Identificação inválida da baixa.');
  if(!Array.isArray(payload.items)||!payload.items.length)throw new ApiError(400,'Selecione as vendas do mesmo cliente.');
  const items:Item[]=payload.items.map(value=>{const item=asObject(value),id=requiredString(item.id,'Venda');if(id.length>80)throw new ApiError(400,'Venda inválida.');return {sourceKind:enumValue(item.sourceKind,'Origem',['SALE','FREIGHT'] as const).toLowerCase() as Item['sourceKind'],id,expectedBalanceCents:integerInRange(item.expectedBalanceCents,'Saldo da venda',1,9_000_000_000_000)};});
  items.sort((a,b)=>`${a.sourceKind}:${a.id}`.localeCompare(`${b.sourceKind}:${b.id}`));
  if(new Set(items.map(i=>`${i.sourceKind}:${i.id}`)).size!==items.length)throw new ApiError(400,'A mesma venda foi selecionada mais de uma vez.');
  const fingerprint=createHash('sha256').update(JSON.stringify({clientId,date,paymentMethod,items})).digest('hex');
  const result=await withDatabaseTransaction(async db=>{
   await db.queryFirst('select pg_advisory_xact_lock(hashtext(?))',[`finance-payment-batch:${key}`]);
   const old=await db.queryFirst<{actorId:string;fingerprint:string;result:Record<string,unknown>}>('select actor_user_id as actorId,fingerprint,result from finance_payment_batches where id=?',[key]);
   if(old){if(old.actorId!==user.id||old.fingerprint!==fingerprint)throw new ApiError(409,'Esta chave já foi utilizada em outra baixa.');return {...old.result,duplicate:true};}
   // Lock canonical rows in a stable order, then validate every balance before writing.
   // JSON parameters avoid a query per sale and the PostgreSQL bind-parameter limit.
   const freightIds=items.filter(item=>item.sourceKind==='freight').map(item=>item.id);
   const saleIds=items.filter(item=>item.sourceKind==='sale').map(item=>item.id);
   const freights=freightIds.length?await db.queryAll<{id:string;clientId:string|null;amount:number;status:string;number:string}>(
    'select id,client_id as clientId,freight_amount_cents as amount,payment_status as status,sale_number as number from fleet_freights where id in (select jsonb_array_elements_text(?::text::jsonb)) order by id for update',[JSON.stringify(freightIds)]):[];
   const sales=saleIds.length?await db.queryAll<{id:string;clientId:string|null;amount:number;linked:string|null;number:string}>(
    'select id,client_id as clientId,freight_amount_cents as amount,fleet_freight_id as linked,sale_number as number from freight_sales where id in (select jsonb_array_elements_text(?::text::jsonb)) order by id for update',[JSON.stringify(saleIds)]):[];
   const payments=saleIds.length?await db.queryAll<{id:string;total:number}>(
    `select sale_id as id,coalesce(sum(case when type='ESTORNO' then -amount_cents else amount_cents end),0) as total from payment_transactions where sale_id in (select jsonb_array_elements_text(?::text::jsonb)) and status='CONFIRMADO' group by sale_id`,[JSON.stringify(saleIds)]):[];
   const freightById=new Map(freights.map(row=>[row.id,row])),saleById=new Map(sales.map(row=>[row.id,row])),paidById=new Map(payments.map(row=>[row.id,row.total]));
   const records:{item:Item;balance:number;number:string}[]=[];
   for(const item of items){
    let balance:number,number:string;
    if(item.sourceKind==='freight'){
     const row=freightById.get(item.id);
     if(!row)throw new ApiError(404,'Frete não encontrado.');
     if(row.clientId!==clientId)throw new ApiError(400,'Todas as vendas devem pertencer ao mesmo cliente cadastrado.');
     balance=row.status==='PAGO'?0:row.amount;number=row.number;
    }else{
     const row=saleById.get(item.id);
     if(!row)throw new ApiError(404,'Venda não encontrada.');
     if(row.linked)throw new ApiError(409,'Selecione o frete original da venda vinculada.');
     if(row.clientId!==clientId)throw new ApiError(400,'Todas as vendas devem pertencer ao mesmo cliente cadastrado.');
     balance=Math.max(0,row.amount-(paidById.get(item.id)??0));number=row.number;
    }
    if(balance!==item.expectedBalanceCents)throw new ApiError(409,'O saldo ou a situação mudou. Atualize a consulta antes de baixar.');
    records.push({item,balance,number});
   }
   const total=records.reduce((sum,r)=>sum+r.balance,0);if(!Number.isSafeInteger(total))throw new ApiError(400,'Total da baixa acima do limite.');
   if(freightIds.length)await db.queryAll("update fleet_freights set payment_status='PAGO',paid_at=?,updated_by=? where id in (select jsonb_array_elements_text(?::text::jsonb)) returning id",[occurredAt,user.id,JSON.stringify(freightIds)]);
   const receipts=records.filter(r=>r.item.sourceKind==='sale').map(({item,balance})=>({id:crypto.randomUUID(),sale_id:item.id,amount_cents:balance,idempotency_key:`batch:${createHash('sha256').update(key+':'+item.id).digest('hex')}`}));
   if(receipts.length)await db.queryAll(`insert into payment_transactions(id,sale_id,type,status,amount_cents,occurred_at,payment_method,idempotency_key,created_by,notes)
    select p.id,p.sale_id,'RECEBIMENTO','CONFIRMADO',p.amount_cents,?,?,p.idempotency_key,?,'Baixa em lote'
    from jsonb_to_recordset(?::text::jsonb) as p(id text,sale_id text,amount_cents bigint,idempotency_key text) returning id`,[occurredAt,paymentMethod,user.id,JSON.stringify(receipts)]);
   const audits=records.map(({item,balance,number})=>({id:crypto.randomUUID(),entity_id:`${item.sourceKind}:${item.id}`,new_value:JSON.stringify({clientId,amountCents:balance,paidAt:occurredAt,saleNumber:number})}));
   await db.queryAll(`insert into audit_logs(id,entity_type,entity_id,action,actor_user_id,actor_email,new_value,request_id)
    select a.id,'FINANCE_PAYMENT',a.entity_id,'BATCH_SETTLED',?,?,a.new_value,?
    from jsonb_to_recordset(?::text::jsonb) as a(id text,entity_id text,new_value text) returning id`,[user.id,user.email,key,JSON.stringify(audits)]);
   const output={updated:true,count:records.length,totalCents:total};
   await db.queryFirst('insert into finance_payment_batches(id,actor_user_id,fingerprint,result) values (?,?,?,?::text::jsonb) returning id',[key,user.id,fingerprint,JSON.stringify(output)]);
   return output;
  });
  return Response.json(result,{headers:{'cache-control':'private, no-store'}});
 }catch(error){return jsonError(error);}
}
