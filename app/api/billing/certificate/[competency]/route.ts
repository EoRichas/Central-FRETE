import { authorize } from "@/lib/server/auth";
import { billingCalendar, initialGraceCompetency, validCompetency } from "@/lib/domain/billing";
import { billingConfig } from "@/lib/server/billing-config";
import { billingStatus, periods } from "@/lib/server/billing";
import { LICENSE_HOLDER, licensePdf } from "@/lib/server/license-pdf";
import { ApiError, jsonError } from "@/lib/server/d1";
export async function GET(request: Request, context: { params: Promise<{ competency: string }> }) {
 try {
  await authorize(request, ["ADMIN", "FINANCEIRO"]);
  const { competency } = await context.params;
  if (!validCompetency(competency)) throw new ApiError(400, "Competência inválida.");
  const config = billingConfig();
  const gracePeriod = competency === initialGraceCompetency(config.firstCompetency);
  const period = gracePeriod ? null : (await periods()).find(p => p.competency === competency && p.paid);
  if (!gracePeriod && (!period || competency > billingCalendar().activeCompetency)) throw new ApiError(409, "O certificado estará disponível após pagamento e início da competência no dia 05.");
  const state = await billingStatus();
  const document = licensePdf({
   companyName: LICENSE_HOLDER.name,
   companyCnpj: LICENSE_HOLDER.cnpj,
   competency,
   gracePeriod,
   approvedAt: period?.approvedAt ?? null,
   licenseKey: period?.licenseKey ?? null,
   status: state.blocked ? "blocked" : competency === billingCalendar().activeCompetency ? "active" : "historical",
  });
  return new Response(document as BodyInit, {headers: {"Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="licenca-${competency}.pdf"`, "Cache-Control": "private, no-store"}});
 } catch(error) { return jsonError(error); }
}
