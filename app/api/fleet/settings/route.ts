import { authorize } from "@/lib/server/auth";
import { getD1, jsonError, queryFirst } from "@/lib/server/d1";
import { asObject } from "@/lib/server/validation";
import { parseFleetSettingsPayload } from "@/lib/server/fleet-validation";

type SettingsSnapshot = {
  fuelPriceCents: number;
  averageConsumptionMilliKmPerLiter: number;
  fallbackFixedCostPerKmCents: number;
  matchWindowDays: number;
  officeMonthlyCostCents: number | null;
};

export async function PUT(request: Request) {
  try {
    const user = await authorize(request, ["ADMIN", "GERENCIA"]);
    const data = parseFleetSettingsPayload(asObject(await request.json()));
    const previous = await queryFirst<SettingsSnapshot>(
      `select fuel_price_cents as fuelPriceCents,
        average_consumption_milli_km_per_liter as averageConsumptionMilliKmPerLiter,
        fallback_fixed_cost_per_km_cents as fallbackFixedCostPerKmCents,
        match_window_days as matchWindowDays,
        office_monthly_cost_cents as officeMonthlyCostCents
       from fleet_settings where id = 'GLOBAL'`,
    );
    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `insert into fleet_settings (
            id, fuel_price_cents, average_consumption_milli_km_per_liter,
            fallback_fixed_cost_per_km_cents, match_window_days,
            office_monthly_cost_cents, updated_by
          ) values ('GLOBAL', ?, ?, ?, ?, ?, ?)
          on conflict (id) do update set
            fuel_price_cents = excluded.fuel_price_cents,
            average_consumption_milli_km_per_liter = excluded.average_consumption_milli_km_per_liter,
            fallback_fixed_cost_per_km_cents = excluded.fallback_fixed_cost_per_km_cents,
            match_window_days = excluded.match_window_days,
            office_monthly_cost_cents = excluded.office_monthly_cost_cents,
            updated_by = excluded.updated_by,
            updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
        )
        .bind(
          data.fuelPriceCents,
          data.averageConsumptionMilliKmPerLiter,
          data.fallbackFixedCostPerKmCents,
          data.matchWindowDays,
          data.officeMonthlyCostCents,
          user.id,
        ),
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            previous_value, new_value, request_id
          ) values (?, 'FLEET_SETTINGS', 'GLOBAL', 'UPDATED', ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          user.email,
          JSON.stringify(previous),
          JSON.stringify(data),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
    ]);
    return Response.json({ updated: true });
  } catch (error) {
    return jsonError(error);
  }
}
