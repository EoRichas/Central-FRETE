import { authorize } from "@/lib/server/auth";
import { billingCalendar, validCompetency } from "@/lib/domain/billing";
import { billingConfig } from "@/lib/server/billing-config";
import { billingStatus, periods } from "@/lib/server/billing";
import { licensePdf } from "@/lib/server/license-pdf";
import { ApiError, jsonError } from "@/lib/server/d1";
export async function GET(request: Request, context: { params: Promise<{ competency: string }> }) {
 try {
  await authorize(request, ["ADMIN", "FINANCEIRO"]);
  const { competency } = await context.params;
  if (!validCompetency(competency)) throw new ApiError(400, "Competência inválida.");
  const period = (await periods()).find(p => p.competency === competency && p.paid);
  if (!period || competency > billingCalendar().activeCompetency) throw new ApiError(409, "O certificado estará disponível após pagamento e início da competência no dia 05.");
  const state = await billingStatus();
  const config = billingConfig();
  const document = licensePdf({
   companyName: config.companyName,
   competency,
   approvedAt: period.approvedAt,
   licenseKey: period.licenseKey,
   status: state.blocked ? "blocked" : competency === billingCalendar().activeCompetency ? "active" : "historical",
  });
  return new Response(document as BodyInit, {headers: {"Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="licenca-${competency}.pdf"`, "Cache-Control": "private, no-store"}});
 } catch(error) { return jsonError(error); }
}
