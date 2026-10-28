export type DriverCommissionRow = {
 id:string; saleNumber:string; pickupDate:string; clientName:string;
 driverId:string|null; driverName:string; vehicleId:string|null; vehiclePlate:string;
 freightAmountCents:number; driverCommissionCents:number;
};
export type CommissionGroup = {key:string;name:string;freights:number;amountCents:number;commissionCents:number};
export function commissionDriverKey(row:DriverCommissionRow){return row.driverId?`id:${row.driverId}`:`historical:${row.driverName.trim().toLocaleUpperCase('pt-BR')}`;}
export function commissionVehicleKey(row:DriverCommissionRow){return row.vehicleId?`id:${row.vehicleId}`:`historical:${row.vehiclePlate.trim().toLocaleUpperCase('pt-BR')}`;}
export function groupDriverCommissions(rows:DriverCommissionRow[],by:'driver'|'vehicle'):CommissionGroup[]{
 const groups=new Map<string,CommissionGroup>();
 for(const row of rows){const key=by==='driver'?commissionDriverKey(row):commissionVehicleKey(row),name=by==='driver'?(row.driverName||'Motorista não informado'):(row.vehiclePlate||'Veículo não informado');
  const group=groups.get(key)??{key,name,freights:0,amountCents:0,commissionCents:0};group.freights++;group.amountCents+=row.freightAmountCents;group.commissionCents+=row.driverCommissionCents;groups.set(key,group);
 }
 return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}
export type DriverCommissionReport={from:string;to:string;rows:DriverCommissionRow[];drivers:{key:string;name:string}[];vehicles:{key:string;name:string}[];driverLabel:string;vehicleLabel:string};
