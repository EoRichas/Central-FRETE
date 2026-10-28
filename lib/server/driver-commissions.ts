import { currentDatePeriod } from '@/lib/domain/date-period';
import { commissionDriverKey,commissionVehicleKey,type DriverCommissionReport,type DriverCommissionRow } from '@/lib/domain/driver-commissions';
import { readDatePeriod } from './date-period';
import { queryAll } from './d1';
export async function loadDriverCommissions(params:URLSearchParams):Promise<DriverCommissionReport>{
 const period=readDatePeriod(params)??currentDatePeriod();
 // Driver commission belongs to the freight's pickup date, including unbilled freights.
 // Only the operational freight is read, so linked commercial sales are never duplicated.
 const all=await queryAll<DriverCommissionRow>(`select id,sale_number as saleNumber,pickup_date as pickupDate,client_name as clientName,
  driver_id as driverId,driver_name as driverName,vehicle_id as vehicleId,vehicle_plate as vehiclePlate,
  freight_amount_cents as freightAmountCents,driver_commission_cents as driverCommissionCents
  from fleet_freights where pickup_date>=? and pickup_date<=? order by pickup_date desc,created_at desc,id`,[period.from,period.to]);
 const drivers=[...new Map(all.map(r=>[commissionDriverKey(r),{key:commissionDriverKey(r),name:r.driverName||'Motorista não informado'}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 const vehicles=[...new Map(all.map(r=>[commissionVehicleKey(r),{key:commissionVehicleKey(r),name:r.vehiclePlate||'Veículo não informado'}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 const by=params.get('by');
 const driver=by==='vehicle'?'':params.get('driver')||'',vehicle=by==='driver'?'':params.get('vehicle')||'';
 return {...period,drivers,vehicles,rows:all.filter(r=>(!driver||commissionDriverKey(r)===driver)&&(!vehicle||commissionVehicleKey(r)===vehicle)),driverLabel:driver?(drivers.find(d=>d.key===driver)?.name??'Sem correspondência'):'Todos',vehicleLabel:vehicle?(vehicles.find(v=>v.key===vehicle)?.name??'Sem correspondência'):'Todos'};
}
