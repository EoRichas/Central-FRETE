import { authorize } from '@/lib/server/auth';
import { jsonError, queryAll } from '@/lib/server/d1';
export async function GET(request: Request) {
  try {
    await authorize(request, ['ADMIN']);
    const freights = await queryAll<{id:string; label:string}>(`select f.id,
      f.client_name || ' • ' || f.origin || ' → ' || f.destination || ' • ' || f.pickup_date as label
      from fleet_freights f where not exists(select 1 from freight_sales s where s.fleet_freight_id=f.id)
      order by f.pickup_date desc, f.id`);
    return Response.json({freights});
  } catch (error) { return jsonError(error); }
}
