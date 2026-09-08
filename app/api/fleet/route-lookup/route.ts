import { authorize } from "@/lib/server/auth";
import { ApiError, jsonError } from "@/lib/server/d1";
import { asObject, requiredString } from "@/lib/server/validation";
export async function GET(request: Request) {
 try {
  await authorize(request, ["ADMIN", "GERENCIA", "FINANCEIRO", "OPERACIONAL"]);
  const cep = (new URL(request.url).searchParams.get("cep") ?? "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(cep)) throw new ApiError(400, "Informe um CEP de 8 dígitos.");
  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new ApiError(503, "Consulta de CEP indisponível. Preencha o endereço manualmente.");
  const data = await response.json();
  if (data.erro) throw new ApiError(404, "CEP não encontrado. Preencha o endereço manualmente.");
  return Response.json({ address: [data.logradouro, data.bairro, data.localidade, data.uf].filter(Boolean).join(", ") });
 } catch(error) { return jsonError(error); }
}
export async function POST(request: Request) {
 try {
  await authorize(request, ["ADMIN", "GERENCIA", "OPERACIONAL"]);
  const data = asObject(await request.json());
  const origin = requiredString(data.origin, "Origem");
  const destination = requiredString(data.destination, "Destino");
  if (origin.length > 180 || destination.length > 180) throw new ApiError(400, "Endereço muito longo.");
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new ApiError(503, "Cálculo automático de rotas ainda não configurado. Informe a distância manualmente.");
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
   method: "POST", signal: AbortSignal.timeout(12000),
   headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.distanceMeters" },
   body: JSON.stringify({ origin: { address: `${origin}, Brasil` }, destination: { address: `${destination}, Brasil` }, travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE", languageCode: "pt-BR", units: "METRIC" }),
  });
  if (!response.ok) throw new ApiError(503, "Não foi possível calcular a rota. Informe a distância manualmente.");
  const result = await response.json();
  const meters = result.routes?.[0]?.distanceMeters;
  if (!Number.isSafeInteger(meters) || meters < 0) throw new ApiError(404, "Rota não encontrada.");
  return Response.json({ distanceMeters: meters });
 } catch(error) { return jsonError(error); }
}
