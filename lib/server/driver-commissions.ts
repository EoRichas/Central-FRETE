import { currentDatePeriod } from '@/lib/domain/date-period';
import { commissionDriverKey,commissionVehicleKey,type DriverCommissionReport,type DriverCommissionRow } from '@/lib/domain/driver-commissions';
import { readDatePeriod } from './date-period';
import { queryAll } from './d1';
import { reportCreationDateSql } from './report-creation-date';
import { newestCreatedFirst } from '@/lib/domain/report-order';
export async function loadDriverCommissions(params:URLSearchParams):Promise<DriverCommissionReport>{
 const period=readDatePeriod(params)??currentDatePeriod();
 const dateBasis=params.get('dateBasis')==='creation'?'creation':'operational';
 const creationDate=reportCreationDateSql('f');
 const dateColumn=dateBasis==='creation'?creationDate:'f.pickup_date';
 const dateParam=dateBasis==='creation'?'?::date':'?';
 // The commission payments screen still uses the actual pickup period.
 // Only the operational freight is read, so linked commercial sales are never duplicated.
 const all=await queryAll<DriverCommissionRow>(`select f.id,f.sale_number as saleNumber,f.pickup_date as pickupDate,${creationDate}::text as createdDate,f.client_name as clientName,
  f.driver_id as driverId,f.driver_name as driverName,f.vehicle_id as vehicleId,f.vehicle_plate as vehiclePlate,
  f.freight_amount_cents as freightAmountCents,f.driver_commission_cents as driverCommissionCents,
  coalesce(p.status,'EM_ABERTO') as commissionStatus,p.paid_at as commissionPaidAt,u.name as commissionPaidByName,
  coalesce(p.pix_details,d.pix_details) as pixDetails
  from fleet_freights f left join driver_commission_payments p on p.freight_id=f.id
  left join fleet_drivers d on d.id=f.driver_id left join users u on u.id=p.paid_by
  where ${dateColumn} between ${dateParam} and ${dateParam} order by f.pickup_date desc,f.created_at desc,f.id`,[period.from,period.to]);
 if(dateBasis==='creation')all.sort((a,b)=>newestCreatedFirst(
  {...a,createdDate:a.createdDate ?? a.pickupDate},{...b,createdDate:b.createdDate ?? b.pickupDate}));
 const drivers=[...new Map(all.map(r=>[commissionDriverKey(r),{key:commissionDriverKey(r),name:r.driverName||'Motorista não informado'}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 const vehicles=[...new Map(all.map(r=>[commissionVehicleKey(r),{key:commissionVehicleKey(r),name:r.vehiclePlate||'Veículo não informado'}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 const by=params.get('by');
 const driver=by==='vehicle'?'':params.get('driver')||'',vehicle=by==='driver'?'':params.get('vehicle')||'';
 return {...period,dateBasis,drivers,vehicles,rows:all.filter(r=>(!driver||commissionDriverKey(r)===driver)&&(!vehicle||commissionVehicleKey(r)===vehicle)),driverLabel:driver?(drivers.find(d=>d.key===driver)?.name??'Sem correspondência'):'Todos',vehicleLabel:vehicle?(vehicles.find(v=>v.key===vehicle)?.name??'Sem correspondência'):'Todos'};
}
