import { authorize } from "@/lib/server/auth";
import { ApiError, jsonError } from "@/lib/server/d1";
import {
  defaultCalculatorDocument,
  normalizeCalculatorDocument,
} from "@/lib/domain/calculator";
import {
  loadEditableToolDocument,
  saveEditableToolDocument,
} from "@/lib/server/editable-tools";
import { asObject } from "@/lib/server/validation";

const DOCUMENT_KEY = "CALCULATOR";
const TEMPLATE_KEY = "CALCULATOR_TEMPLATE";
const GLOBAL_OWNER = "GLOBAL";

async function loadCalculatorTemplate() {
  return loadEditableToolDocument(
    TEMPLATE_KEY,
    GLOBAL_OWNER,
    defaultCalculatorDocument(),
  );
}

export async function GET(request: Request) {
  try {
    const user = await authorize(request);
    const stored = await loadEditableToolDocument(
      DOCUMENT_KEY,
      user.id,
      defaultCalculatorDocument(),
    );
    const source = stored.persisted ? stored : await loadCalculatorTemplate();
    return Response.json({
      ...source,
      persisted: stored.persisted,
      document: normalizeCalculatorDocument(source.document),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await authorize(request);
    const template = await loadCalculatorTemplate();
    if (!template.persisted) {
      throw new ApiError(503, "O modelo original da calculadora ainda não foi configurado.");
    }
    const document = normalizeCalculatorDocument(template.document);
    await saveEditableToolDocument(
      request,
      user,
      DOCUMENT_KEY,
      user.id,
      document,
    );
    return Response.json({ document, saved: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await authorize(request);
    const payload = asObject(await request.json());
    if (!("document" in payload)) {
      throw new ApiError(400, "Informe os dados da calculadora.");
    }
    const document = normalizeCalculatorDocument(payload.document);
    await saveEditableToolDocument(
      request,
      user,
      DOCUMENT_KEY,
      user.id,
      document,
    );
    return Response.json({ document, saved: true });
  } catch (error) {
    return jsonError(error);
  }
}
