export type CalculatorLineId =
  | "insurance"
  | "yard-receipt"
  | "slot-1"
  | "slot-2"
  | "slot-3"
  | "origin-pickup"
  | "destination-delivery"
  | "central-margin"
  | "icms"
  | "seller-commission"
  | "invoice";

export type CalculatorLine = {
  id: CalculatorLineId;
  code: string;
  description: string;
  advanceCents: number;
  valueCents: number;
  observationBasisPoints: number | null;
};

export type CalculatorDocument = {
  collaboratorName: string;
  functionName: string;
  message: string;
  icmsBaseCents: number;
  fipeCents: number;
  insurer: string;
  deadlineDays: number;
  lines: CalculatorLine[];
};

export type CalculatorResult = {
  lineValues: Record<CalculatorLineId, number>;
  advanceTotalCents: number;
  subtotalCents: number;
  operationCostCents: number;
  totalCents: number;
  invoiceTotalCents: number;
  netReceivableCents: number;
};

const DEFAULT_LINES: CalculatorLine[] = [
  { id: "insurance", code: "1012", description: "SEGURO", advanceCents: 0, valueCents: 0, observationBasisPoints: 0 },
  { id: "yard-receipt", code: "1113", description: "RECEBIMENTO PÁTIO", advanceCents: 0, valueCents: 0, observationBasisPoints: null },
  { id: "slot-1", code: "1047", description: "VAGA 1", advanceCents: 0, valueCents: 0, observationBasisPoints: null },
  { id: "slot-2", code: "1047", description: "VAGA 2", advanceCents: 0, valueCents: 0, observationBasisPoints: null },
  { id: "slot-3", code: "1047", description: "VAGA 3", advanceCents: 0, valueCents: 0, observationBasisPoints: null },
  { id: "origin-pickup", code: "1240", description: "COLETA ORIGEM", advanceCents: 0, valueCents: 0, observationBasisPoints: null },
  { id: "destination-delivery", code: "1241", description: "ENTREGA DESTINO", advanceCents: 0, valueCents: 0, observationBasisPoints: null },
  { id: "central-margin", code: "1010", description: "MARGEM CENTRAL", advanceCents: 0, valueCents: 0, observationBasisPoints: null },
  { id: "icms", code: "1011", description: "ICMS", advanceCents: 0, valueCents: 0, observationBasisPoints: 0 },
  { id: "seller-commission", code: "1310", description: "COMISSÃO", advanceCents: 0, valueCents: 0, observationBasisPoints: 0 },
  { id: "invoice", code: "1144", description: "NOTA FISCAL", advanceCents: 0, valueCents: 0, observationBasisPoints: 0 },
];

const DERIVED_LINES = new Set<CalculatorLineId>([
  "insurance",
  "icms",
  "seller-commission",
  "invoice",
]);

const OPERATION_COST_LINES = new Set<CalculatorLineId>([
  "insurance",
  "yard-receipt",
  "slot-1",
  "slot-2",
  "slot-3",
  "origin-pickup",
  "destination-delivery",
  "icms",
]);

function plainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedInteger(value: unknown, fallback: number, max = 9_000_000_000_000) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= max
    ? parsed
    : fallback;
}

function boundedText(value: unknown, fallback: string, maxLength: number) {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  return (normalized || fallback).slice(0, maxLength);
}

export function defaultCalculatorDocument(): CalculatorDocument {
  return {
    collaboratorName: "",
    functionName: "VENDEDOR(A)",
    message: "",
    icmsBaseCents: 0,
    fipeCents: 0,
    insurer: "",
    deadlineDays: 0,
    lines: DEFAULT_LINES.map((line) => ({ ...line })),
  };
}

export function normalizeCalculatorDocument(value: unknown): CalculatorDocument {
  const fallback = defaultCalculatorDocument();
  const document = plainObject(value);
  if (!document) return fallback;
  const suppliedLines = Array.isArray(document.lines) ? document.lines : [];
  const suppliedById = new Map(
    suppliedLines
      .map((line) => plainObject(line))
      .filter((line): line is Record<string, unknown> => Boolean(line))
      .map((line) => [String(line.id), line]),
  );

  return {
    collaboratorName: boundedText(document.collaboratorName, fallback.collaboratorName, 80).toLocaleUpperCase("pt-BR"),
    functionName: boundedText(document.functionName, fallback.functionName, 80).toLocaleUpperCase("pt-BR"),
    message: boundedText(document.message, fallback.message, 500).toLocaleUpperCase("pt-BR"),
    icmsBaseCents: boundedInteger(document.icmsBaseCents, fallback.icmsBaseCents),
    fipeCents: boundedInteger(document.fipeCents, fallback.fipeCents),
    insurer: boundedText(document.insurer, fallback.insurer, 80).toLocaleUpperCase("pt-BR"),
    deadlineDays: boundedInteger(document.deadlineDays, fallback.deadlineDays, 365),
    lines: fallback.lines.map((defaultLine) => {
      const supplied = suppliedById.get(defaultLine.id);
      if (!supplied) return defaultLine;
      return {
        ...defaultLine,
        code: boundedText(supplied.code, defaultLine.code, 20),
        description: boundedText(supplied.description, defaultLine.description, 80).toLocaleUpperCase("pt-BR"),
        advanceCents: boundedInteger(supplied.advanceCents, defaultLine.advanceCents),
        valueCents: DERIVED_LINES.has(defaultLine.id)
          ? 0
          : boundedInteger(supplied.valueCents, defaultLine.valueCents),
        observationBasisPoints:
          defaultLine.observationBasisPoints === null
            ? null
            : boundedInteger(
                supplied.observationBasisPoints,
                defaultLine.observationBasisPoints,
                9_999,
              ),
      };
    }),
  };
}

function percentageOf(valueCents: number, basisPoints: number) {
  return Math.round((valueCents * basisPoints) / 10_000);
}

export function calculateCalculator(document: CalculatorDocument): CalculatorResult {
  const lineValues = Object.fromEntries(
    document.lines.map((line) => [line.id, line.valueCents]),
  ) as Record<CalculatorLineId, number>;
  const linesById = new Map(document.lines.map((line) => [line.id, line]));

  lineValues.insurance = Math.round(
    percentageOf(
      document.fipeCents,
      linesById.get("insurance")?.observationBasisPoints ?? 0,
    ) / 2,
  );
  lineValues.icms = percentageOf(
    document.icmsBaseCents,
    linesById.get("icms")?.observationBasisPoints ?? 0,
  );

  const subtotalCents = document.lines
    .filter((line) => line.id !== "seller-commission" && line.id !== "invoice")
    .reduce((total, line) => total + lineValues[line.id], 0);
  const operationCostCents = document.lines
    .filter((line) => OPERATION_COST_LINES.has(line.id))
    .reduce((total, line) => total + lineValues[line.id], 0);
  const commissionBasisPoints =
    linesById.get("seller-commission")?.observationBasisPoints ?? 0;
  lineValues["seller-commission"] =
    commissionBasisPoints >= 10_000
      ? 0
      : Math.round(
          subtotalCents / (1 - commissionBasisPoints / 10_000) - subtotalCents,
        );
  const totalCents = subtotalCents + lineValues["seller-commission"];
  lineValues.invoice = percentageOf(
    totalCents,
    linesById.get("invoice")?.observationBasisPoints ?? 0,
  );

  return {
    lineValues,
    advanceTotalCents: document.lines.reduce(
      (total, line) => total + line.advanceCents,
      0,
    ),
    subtotalCents,
    operationCostCents,
    totalCents,
    invoiceTotalCents: totalCents + lineValues.invoice,
    netReceivableCents:
      totalCents - lineValues["seller-commission"] - operationCostCents,
  };
}

export function isDerivedCalculatorLine(id: CalculatorLineId) {
  return DERIVED_LINES.has(id);
}
