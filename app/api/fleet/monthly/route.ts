import { authorize } from '@/lib/server/auth';
import { ApiError, getD1, jsonError } from '@/lib/server/d1';
import { loadMonthlyReport, MONTHLY_SOURCE_SQL } from '@/lib/server/monthly-results';
import { resultCompetency, resultMoney, resultText } from '@/lib/server/fleet-results-validation';
import { asObject, enumValue } from '@/lib/server/validation';
import { currentCompetency } from '@/lib/domain/dates';

export async function GET(request: Request) {
  try {
    const user = await authorize(request, ['ADMIN','GERENCIA','FINANCEIRO']);
    const competency = resultCompetency(new URL(request.url).searchParams.get('competency') || currentCompetency());
    return Response.json({ ...await loadMonthlyReport(competency), canManage: ['ADMIN','GERENCIA','FINANCEIRO'].includes(user.role) });
  } catch (error) { return jsonError(error); }
}
export async function POST(request: Request) {
  try {
    const user = await authorize(request, ['ADMIN','GERENCIA','FINANCEIRO']);
    const payload = asObject(await request.json());
    const competency = resultCompetency(payload.competency);
    const action = enumValue(payload.action, 'Ação', ['ENTRY','DELETE_ENTRY','CLOSE','REOPEN'] as const);
    const db = await getD1();
    const id = crypto.randomUUID();
    const lock = db.prepare('select pg_advisory_xact_lock(hashtext(?))').bind(`company-month:${competency}`);
    const notClosed = 'not exists(select 1 from company_monthly_closings where competency=? and reopened_at is null)';
    let sql: string;
    let params: unknown[];
    if (action === 'ENTRY') {
      const kind = enumValue(payload.kind, 'Tipo', ['REVENUE','VARIABLE','FIXED'] as const);
      const description = resultText(payload.description, 'Descrição', 200);
      const amount = resultMoney(payload.amountCents, 'Valor');
      if (amount <= 0) throw new ApiError(400, 'Informe um valor maior que zero.');
      sql = `insert into company_monthly_entries(id,competency,kind,description,amount_cents,created_by)
        select ?,?,?,?,?,? where ${notClosed} returning *`;
      params = [id,competency,kind,description,amount,user.id,competency];
    } else if (action === 'DELETE_ENTRY') {
      sql = `delete from company_monthly_entries where id=? and competency=? and ${notClosed} returning *`;
      params = [resultText(payload.id,'Lançamento',80),competency,competency];
    } else if (action === 'CLOSE') {
      if (payload.reviewed !== true) throw new ApiError(400, 'Confirme a conferência das receitas e de todos os custos do mês.');
      sql = `insert into company_monthly_closings(id,competency,snapshot,closed_by)
        select ?,?,source.snapshot,? from (${MONTHLY_SOURCE_SQL}) source
        where ${notClosed}
        and not exists(select 1 from jsonb_array_elements(source.snapshot->'freights') f where (f->>'fuelPending')::boolean)
        returning *`;
      params = [id,competency,user.id,competency,competency];
    } else {
      const reason = resultText(payload.reason,'Motivo da reabertura',1000);
      if (reason.length < 5) throw new ApiError(400, 'Descreva o motivo da reabertura com pelo menos 5 caracteres.');
      sql = `update company_monthly_closings set reopened_at=to_char(timezone('UTC',now()),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        reopened_by=?,reopen_reason=? where id=? and competency=? and reopened_at is null returning *`;
      params = [user.id,reason,resultText(payload.id,'Fechamento',80),competency];
    }
    const mutation = db.prepare(`with changed as (${sql})
      insert into audit_logs(id,entity_type,entity_id,action,actor_user_id,actor_email,new_value,request_id)
      select ?,'MONTHLY_RESULT',?,?,?,?,row_to_json(changed)::text,? from changed returning id`)
      .bind(...params,crypto.randomUUID(),competency,action,user.id,user.email,request.headers.get('x-request-id') ?? crypto.randomUUID());
    const results = await db.batch([lock, mutation]);
    if (!results[1].results.length) throw new ApiError(409, action === 'CLOSE'
      ? 'O mês já está fechado ou há diesel realizado pendente nos fretes avulsos.'
      : 'Registro não encontrado ou mês fechado. Reabra o mês para alterar lançamentos.');
    return Response.json({ updated: true });
  } catch (error) { return jsonError(error); }
}
