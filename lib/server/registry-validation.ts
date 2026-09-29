import { ApiError, queryFirst } from './d1';
import { asObject, digits, requiredUpper, upper } from './validation';
import { formatRegistryAddress, type RegistryAddress } from '@/lib/domain/registry';
import type { SaleChannel } from '@/lib/domain/sales';

export function parseRegistryAddress(value:unknown): RegistryAddress | null {
  if(value == null)return null;
  const raw=asObject(value);
  const field=(key:string,label:string,max:number,required=true)=>{
    const text=required?requiredUpper(raw[key],label):upper(raw[key])??'';
    if(text.length>max)throw new ApiError(400,`${label} deve possuir no máximo ${max} caracteres.`);
    return text;
  };
  const cep=digits(raw.cep)??'';
  if(cep && cep.length!==8)throw new ApiError(400,'CEP deve possuir 8 dígitos.');
  const state=field('state','UF',2);
  if(!['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].includes(state))throw new ApiError(400,'UF inválida.');
  return {cep,state,street:field('street','Logradouro',160),number:field('number','Número',20),complement:field('complement','Complemento',100,false),district:field('district','Bairro',100),city:field('city','Cidade',100)};
}
export function registryAddressText(address:RegistryAddress|null,legacy:unknown) {
  return address?formatRegistryAddress(address):requiredUpper(legacy,'Endereço');
}
export async function validateSaleClient(id:string|null,channel:SaleChannel,previousId?:string|null){
  if(!id)return;
  const client=await queryFirst<{active:number;saleChannel:string;legalName:string}>('select legal_name as legalName,active,sale_channel as saleChannel from clients where id=?',[id]);
  if(!client)throw new ApiError(400,'Cliente não encontrado.');
  // Keep historical relationships editable after the client's classification changes.
  if(id===previousId)return client;
  if(!client.active)throw new ApiError(400,'Cliente inativo.');
  if(client.saleChannel!=='AMBOS'&&client.saleChannel!==channel)throw new ApiError(400,'Cliente não disponível para o canal desta venda.');
  return client;
}

export async function resolveFreightClient(data: {clientId: string | null; clientName: string}, previous?: {clientId: string | null; clientName: string}) {
  if (previous && data.clientId === previous.clientId && data.clientName === previous.clientName) return {clientId: previous.clientId, clientName: previous.clientName};
  if (!data.clientId) throw new ApiError(400, 'Busque e selecione um cliente cadastrado para a Frota.');
  const client = await validateSaleClient(data.clientId, 'FROTA', previous?.clientId);
  return {clientId: data.clientId, clientName: client!.legalName};
}
