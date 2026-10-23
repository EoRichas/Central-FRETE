export const PROVIDER_SERVICE_KINDS = ['COLETA','ENTREGA','OUTRO'] as const;
export type ProviderServiceKind = (typeof PROVIDER_SERVICE_KINDS)[number];
export type ProviderService = {id:string; providerId:string; providerName:string; referenceName:string|null; kind:ProviderServiceKind; amountCents:number};
export const providerKindLabel = (kind:ProviderServiceKind) => ({COLETA:'Coleta',ENTREGA:'Entrega',OUTRO:'Serviço'}[kind]);
export function providerCostCents(services:ProviderService[] = []) {
 const total=services.reduce((sum,item)=>sum+item.amountCents,0);
 if(!Number.isSafeInteger(total))throw new Error('Total dos prestadores excede o limite de precisão.');
 return total;
}
