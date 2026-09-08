import { ApiError } from "@/lib/server/d1";
import { validCompetency } from "@/lib/domain/billing";
export function billingEnabled() { return process.env.BILLING_ENABLED === "true"; }
export function billingConfig() {
 const companyId = process.env.BILLING_COMPANY_ID?.trim();
 const companyName = process.env.BILLING_COMPANY_NAME?.trim();
 const firstCompetency = process.env.BILLING_FIRST_COMPETENCY?.trim();
 if (!companyId || !companyName || !firstCompetency || !validCompetency(firstCompetency)) throw new ApiError(503, "Licenciamento ainda não configurado. Contate o responsável pelo sistema.");
 return { companyId, companyName, firstCompetency };
}
export function appUrl() {
 const url = new URL(process.env.APP_URL || "http://localhost:3000");
 if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new ApiError(503, "Configure APP_URL com HTTPS.");
 return url.origin;
}
