import { authorize } from "@/lib/server/auth";
import { billingCalendar, shiftMonth, validCompetency } from "@/lib/domain/billing";
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
  const document = licensePdf(["CENTRAL FRETE", "Certificado de licença de uso mensal", "", `Cliente: ${config.companyName.slice(0,65)}`, `Competência: ${competency}`, "Valor pago: R$ 149,99", `Pagamento aprovado: ${period.approvedAt ?? "Confirmado"}`, `Início: ${competency}-05`, `Próximo vencimento: ${shiftMonth(competency, 1)}-05`, "", "Código da licença:", period.licenseKey, "", state.blocked ? "Situação atual: acesso suspenso por pendência." : competency === billingCalendar().activeCompetency ? "Situação atual: licença vigente." : "Documento histórico; esta chave não libera meses posteriores.", "Validade sujeita à confirmação de pagamento no sistema.", "Consulte a aba Certificado digital para verificar a situação."]);
  return new Response(document as BodyInit, {headers: {"Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="licenca-${competency}.pdf"`, "Cache-Control": "private, no-store"}});
 } catch(error) { return jsonError(error); }
}
