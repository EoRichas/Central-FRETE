import { authorize } from "@/lib/server/auth";
import { ApiError, jsonError } from "@/lib/server/d1";
import { asObject, requiredString } from "@/lib/server/validation";
async function addressForCep(input: unknown) {
  const cep = String(input ?? "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(cep))
    throw new ApiError(400, "Informe um CEP de 8 dígitos.");
  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok)
    throw new ApiError(
      503,
      "Consulta de CEP indisponível. Preencha manualmente.",
    );
  const data = await response.json();
  if (data.erro)
    throw new ApiError(404, "CEP não encontrado. Preencha manualmente.");
  return [data.logradouro, data.bairro, data.localidade, data.uf]
    .filter(Boolean)
    .join(", ");
}
export async function GET(request: Request) {
  try {
    await authorize(request, [
      "ADMIN",
      "GERENCIA",
      "FINANCEIRO",
      "OPERACIONAL",
    ]);
    return Response.json({
      address: await addressForCep(
        new URL(request.url).searchParams.get("cep"),
      ),
    });
  } catch (error) {
    return jsonError(
      error instanceof ApiError
        ? error
        : new ApiError(
            503,
            "Consulta de CEP indisponível. Preencha manualmente.",
          ),
    );
  }
}
export async function POST(request: Request) {
  try {
    await authorize(request, ["ADMIN", "GERENCIA", "OPERACIONAL"]);
    const data = asObject(await request.json());
    const [origin, destination] =
      data.originCep || data.destinationCep
        ? await Promise.all([
            addressForCep(data.originCep),
            addressForCep(data.destinationCep),
          ])
        : [
            requiredString(data.origin, "Origem"),
            requiredString(data.destination, "Destino"),
          ];
    if (origin.length > 180 || destination.length > 180)
      throw new ApiError(400, "Endereço muito longo.");
    const key = process.env.GOOGLE_MAPS_API_KEY;
    const failure = (notice: string) =>
      Response.json({ origin, destination, distanceMeters: null, notice });
    if (!key)
      return failure(
        "Cálculo de rota indisponível: integração não configurada. Informe a distância manualmente.",
      );
    try {
      const response = await fetch(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {
          method: "POST",
          signal: AbortSignal.timeout(12000),
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": "routes.distanceMeters",
          },
          body: JSON.stringify({
            origin: { address: `${origin}, Brasil` },
            destination: { address: `${destination}, Brasil` },
            travelMode: "DRIVE",
            routingPreference: "TRAFFIC_UNAWARE",
            languageCode: "pt-BR",
            units: "METRIC",
          }),
        },
      );
      if (!response.ok)
        return failure(
          "Não foi possível calcular a rota. Informe a distância manualmente.",
        );
      const result = await response.json();
      const meters = result.routes?.[0]?.distanceMeters;
      if (!Number.isSafeInteger(meters) || meters < 0 || meters > 100_000_000)
        return failure("Rota não encontrada. Informe a distância manualmente.");
      return Response.json({ origin, destination, distanceMeters: meters });
    } catch {
      return failure(
        "O serviço de rotas não respondeu. Informe a distância manualmente.",
      );
    }
  } catch (error) {
    return jsonError(
      error instanceof ApiError
        ? error
        : new ApiError(
            503,
            "Não foi possível consultar os CEPs. Preencha a rota e a distância manualmente.",
          ),
    );
  }
}
