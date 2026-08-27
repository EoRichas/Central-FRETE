import { authorize } from "@/lib/server/auth";
import { ApiError, jsonError } from "@/lib/server/d1";
import {
  defaultVacancyPriceDocument,
  normalizeVacancyPriceDocument,
} from "@/lib/domain/vacancy-prices";
import {
  loadEditableToolDocument,
  saveEditableToolDocument,
} from "@/lib/server/editable-tools";
import { asObject } from "@/lib/server/validation";

const DOCUMENT_KEY = "VACANCY_PRICES";
const TEMPLATE_KEY = "VACANCY_PRICES_TEMPLATE";
const OWNER_KEY = "GLOBAL";

async function loadVacancyPriceTemplate() {
  return loadEditableToolDocument(
    TEMPLATE_KEY,
    OWNER_KEY,
    defaultVacancyPriceDocument(),
  );
}

export async function GET(request: Request) {
  try {
    const user = await authorize(request);
    const stored = await loadEditableToolDocument(
      DOCUMENT_KEY,
      OWNER_KEY,
      defaultVacancyPriceDocument(),
    );
    const source = stored.persisted ? stored : await loadVacancyPriceTemplate();
    return Response.json({
      ...source,
      persisted: stored.persisted,
      document: normalizeVacancyPriceDocument(source.document),
      canEdit: user.role === "ADMIN" || user.role === "FINANCEIRO",
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await authorize(request, ["ADMIN", "FINANCEIRO"]);
    const template = await loadVacancyPriceTemplate();
    if (!template.persisted) {
      throw new ApiError(503, "O arquivo original de preços ainda não foi configurado.");
    }
    const document = normalizeVacancyPriceDocument(template.document);
    await saveEditableToolDocument(
      request,
      user,
      DOCUMENT_KEY,
      OWNER_KEY,
      document,
    );
    return Response.json({ document, saved: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await authorize(request, ["ADMIN", "FINANCEIRO"]);
    const payload = asObject(await request.json());
    if (!("document" in payload)) {
      throw new ApiError(400, "Informe a tabela de preços.");
    }
    const document = normalizeVacancyPriceDocument(payload.document);
    await saveEditableToolDocument(
      request,
      user,
      DOCUMENT_KEY,
      OWNER_KEY,
      document,
    );
    return Response.json({ document, saved: true });
  } catch (error) {
    return jsonError(error);
  }
}
