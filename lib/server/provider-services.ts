import type { ProviderService } from '@/lib/domain/provider-services';
import { PROVIDER_SERVICE_KINDS, providerCostCents } from '@/lib/domain/provider-services';
import { ApiError,queryAll } from './d1';
import { asObject,enumValue,integerInRange,requiredString } from './validation';
export async function parseProviderServices(value:unknown,previous:ProviderService[]=[]):Promise<ProviderService[]> {
 if(value===undefined)return previous;
 if(!Array.isArray(value)||value.length>30)throw new ApiError(400,'Informe até 30 serviços de prestadores.');
 const draft=value.map(v=>{const row=asObject(v),providerId=requiredString(row.providerId,'Prestador');
  if(providerId.length>80)throw new ApiError(400,'Prestador inválido.');
  return {id:row.id?requiredString(row.id,'Serviço'):crypto.randomUUID(),providerId,kind:enumValue(row.kind,'Serviço do prestador',PROVIDER_SERVICE_KINDS),amountCents:integerInRange(row.amountCents,'Valor do prestador',0,9_000_000_000_000)};
 });
 if(draft.some(r=>r.id.length>80)||new Set(draft.map(r=>r.id)).size!==draft.length)throw new ApiError(400,'Identificação duplicada ou inválida nos serviços.');
 if(!draft.length)return [];
 const ids=[...new Set(draft.map(r=>r.providerId))];
 const providers=await queryAll<{id:string;name:string;referenceName:string|null;active:number}>(`select id,name,reference_name as referenceName,active from providers where id in (${ids.map(()=>'?').join(',')})`,ids);
 const result=draft.map(row=>{const provider=providers.find(p=>p.id===row.providerId),old=previous.find(p=>p.id===row.id&&p.providerId===row.providerId);
  if((!provider||!provider.active)&&!old)throw new ApiError(400,'Selecione um prestador ativo.');
  return {...row,providerName:old?.providerName??provider!.name,referenceName:old?old.referenceName:provider!.referenceName};
 });
 providerCostCents(result);return result;
}
