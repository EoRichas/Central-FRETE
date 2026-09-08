import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/server/d1";
export async function mercadoPago<T>(path: string, init: RequestInit = {}): Promise<T> {
 const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
 if (!token) throw new ApiError(503, "Pagamento online ainda não configurado.");
 const response = await fetch(`https://api.mercadopago.com${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers } });
 if (!response.ok) throw new ApiError(502, `Não foi possível consultar o Mercado Pago (HTTP ${response.status}). Tente novamente.`);
 return response.json() as Promise<T>;
}
export function validateWebhook(request: Request) {
 const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
 if (!secret) throw new ApiError(503, "Notificações de pagamento ainda não configuradas.");
 const id = new URL(request.url).searchParams.get("data.id");
 const requestId = request.headers.get("x-request-id");
 const parts = (request.headers.get("x-signature") ?? "").split(",").map(p => p.trim().split("="));
 const timestamp = parts.find(p => p[0] === "ts")?.[1];
 const hashes = parts.filter(p => p[0] === "v1").map(p => p[1]);
 if (!id || !/^[a-zA-Z0-9_-]+$/.test(id) || !requestId || !timestamp || !/^\d+$/.test(timestamp)) throw new ApiError(401, "Notificação inválida.");
 const expected = createHmac("sha256", secret).update(`id:${id.toLowerCase()};request-id:${requestId};ts:${timestamp};`).digest();
 if (!hashes.some(hash => /^[a-f0-9]{64}$/i.test(hash ?? "") && timingSafeEqual(Buffer.from(hash, "hex"), expected))) throw new ApiError(401, "Assinatura de notificação inválida.");
 // Retries can be delayed. Fresh state is always fetched from the provider;
 // idempotent persistence makes replay safe without discarding valid retries.
 return id;
}
export type MpPayment = { id: number; status: string; transaction_amount: number; transaction_amount_refunded?: number; currency_id: string; collector_id: number; external_reference?: string; date_approved?: string; live_mode: boolean };
export type MpPlan = { id: string; collector_id: number; status: string; init_point: string; auto_recurring: { frequency: number; frequency_type: string; transaction_amount: number; currency_id: string; billing_day?: number; billing_day_proportional?: boolean } };
export async function verifiedPlan() {
 const id = process.env.MERCADO_PAGO_PLAN_ID;
 if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new ApiError(503, "Plano de assinatura ainda não validado.");
 const plan = await mercadoPago<MpPlan>(`/preapproval_plan/${id}`);
 const auto = plan.auto_recurring;
 if (String(plan.collector_id) !== process.env.MERCADO_PAGO_COLLECTOR_ID || plan.status !== "active" || auto.currency_id !== "BRL" || Math.round(Number(auto.transaction_amount) * 100) !== 14999 || auto.frequency !== 1 || auto.frequency_type !== "months" || auto.billing_day !== 5 || auto.billing_day_proportional === true) throw new ApiError(409, "O plano deve ser mensal, R$ 149,99, dia 05, sem rateio proporcional e da conta recebedora configurada.");
 const url = new URL(plan.init_point);
 if (url.protocol !== "https:" || !/(^|\.)mercadopago\.com(\.br)?$/.test(url.hostname)) throw new ApiError(502, "Endereço de assinatura inválido.");
 return plan;
}
