import type { CurrentUser } from '@/lib/contracts';
import { ApiError, withDatabaseTransaction } from './d1';
import { asObject, requiredString } from './validation';

type Source = 'sale' | 'freight';
type Assignment = {id:string; sellerId:string|null; sellerName:string|null; rate:number; fleetFreightId?:string|null};

/** Changes ownership only after checking the actor's current access under lock. */
export async function transferSeller(user:CurrentUser, source:Source, id:string, input:unknown, requestId:string) {
  const payload=asObject(input);
  if(Object.keys(payload).some(key=>!['sellerId','previousSellerId'].includes(key))) throw new ApiError(400,'Informe somente a troca de vendedor.');
  const sellerId=requiredString(payload.sellerId,'Vendedor');
  if(id.length>80||sellerId.length>80||!(payload.previousSellerId===null||typeof payload.previousSellerId==='string')||String(payload.previousSellerId??'').length>80) throw new ApiError(400,'Identificação de vendedor inválida.');
  return withDatabaseTransaction(async db=>{
    const scope=user.role==='VENDEDOR'?' and seller_id=?':'';
    const args=(resourceId:string)=>scope?[resourceId,user.id]:[resourceId];
    let canonical:Source=source, canonicalId=id;
    // A commercial mirror always changes the original freight as well.
    if(source==='sale') {
      const sale=await db.queryFirst<Assignment>('select id,seller_id as sellerId,fleet_freight_id as fleetFreightId from freight_sales where id=?'+scope,args(id));
      if(!sale) throw new ApiError(404,'Venda não encontrada.');
      if(sale.fleetFreightId){canonical='freight';canonicalId=sale.fleetFreightId;}
    }
    const table=canonical==='freight'?'fleet_freights':'freight_sales';
    const rateColumn=canonical==='freight'?'seller_commission_basis_points':'commission_basis_points';
    const previous=await db.queryFirst<Assignment>(`select id,seller_id as sellerId,seller_name as sellerName,${rateColumn} as rate${canonical==='sale'?',fleet_freight_id as fleetFreightId':''} from ${table} where id=?${scope} for update`,args(canonicalId));
    if(!previous) throw new ApiError(404,'Venda não encontrada.');
    if(canonical==='sale'&&previous.fleetFreightId) throw new ApiError(409,'O vínculo desta venda mudou. Atualize os detalhes.');
    if(previous.sellerId!==payload.previousSellerId) throw new ApiError(409,'O vendedor desta venda mudou. Atualize os detalhes antes de tentar novamente.');
    if(canonical==='freight') {
      const mirrors=await db.queryAll<Assignment>('select id,seller_id as sellerId from freight_sales where fleet_freight_id=? order by id for update',[canonicalId]);
      if(source==='sale'&&!mirrors.some(s=>s.id===id&&(user.role!=='VENDEDOR'||s.sellerId===user.id))) throw new ApiError(409,'O vínculo desta venda mudou. Atualize os detalhes.');
    }
    const seller=await db.queryFirst<{id:string;name:string;rate:number}>("select id,name,commission_basis_points as rate from users where id=? and role in ('VENDEDOR','OPERACIONAL') and active=1 and deleted_at is null for share",[sellerId]);
    if(!seller) throw new ApiError(400,'Selecione um vendedor ativo no cadastro.');
    if(previous.sellerId===seller.id) return {updated:false,accessTransferred:false};
    await db.queryFirst(`update ${table} set seller_id=?,seller_name=?,${rateColumn}=?${canonical==='freight'?',updated_by=?':''},updated_at=to_char(timezone('UTC',now()),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') where id=? returning id`,[seller.id,seller.name,seller.rate,...(canonical==='freight'?[user.id]:[]),canonicalId]);
    if(canonical==='freight') await db.queryAll(`update freight_sales set seller_id=?,seller_name=?,commission_basis_points=?,updated_at=to_char(timezone('UTC',now()),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') where fleet_freight_id=? returning id`,[seller.id,seller.name,seller.rate,canonicalId]);
    await db.queryFirst(`insert into audit_logs(id,entity_type,entity_id,action,actor_user_id,actor_email,previous_value,new_value,request_id) values (?,?,?,'SELLER_CHANGED',?,?,?,?,?) returning id`,[crypto.randomUUID(),canonical==='freight'?'FLEET_FREIGHT':'SALE',canonicalId,user.id,user.email,JSON.stringify({sellerId:previous.sellerId,sellerName:previous.sellerName}),JSON.stringify({sellerId:seller.id,sellerName:seller.name}),requestId]);
    return {updated:true,accessTransferred:user.role==='VENDEDOR'&&seller.id!==user.id};
  });
}
