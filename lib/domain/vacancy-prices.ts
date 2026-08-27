export type VacancyDirectionPrices = {
  baseHatchCents: number;
  baseSuvCents: number;
  hatchCents: number;
  suvCents: number;
};

export type VacancyPriceRow = {
  id: string;
  destination: string;
  centralMarginCents: number;
  insuranceBasisPoints: number;
  outgoing: VacancyDirectionPrices;
  returning: VacancyDirectionPrices;
  deadline: string;
  served: boolean;
};

export type VacancyPriceDocument = {
  fipeCents: number;
  rows: VacancyPriceRow[];
};

function plainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedInteger(value: unknown, fallback = 0, max = 9_000_000_000_000) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= max
    ? parsed
    : fallback;
}

function normalizeDirection(value: unknown): VacancyDirectionPrices {
  const direction = plainObject(value);
  return {
    baseHatchCents: boundedInteger(direction?.baseHatchCents),
    baseSuvCents: boundedInteger(direction?.baseSuvCents),
    hatchCents: boundedInteger(direction?.hatchCents),
    suvCents: boundedInteger(direction?.suvCents),
  };
}

export function defaultVacancyPriceDocument(): VacancyPriceDocument {
  return {
    fipeCents: 0,
    rows: [],
  };
}

export function normalizeVacancyPriceDocument(value: unknown): VacancyPriceDocument {
  const document = plainObject(value);
  if (!document || !Array.isArray(document.rows)) {
    return defaultVacancyPriceDocument();
  }
  const rows = document.rows.slice(0, 100).flatMap((entry, index) => {
    const item = plainObject(entry);
    if (!item) return [];
    const destination = String(item.destination ?? "")
      .normalize("NFKC")
      .trim()
      .slice(0, 120)
      .toLocaleUpperCase("pt-BR");
    if (!destination) return [];
    const rawId = String(item.id ?? `route-${index + 1}`)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .slice(0, 80);
    return [{
      id: rawId || `route-${index + 1}`,
      destination,
      centralMarginCents: boundedInteger(item.centralMarginCents),
      insuranceBasisPoints: boundedInteger(item.insuranceBasisPoints, 0, 9_999),
      outgoing: normalizeDirection(item.outgoing),
      returning: normalizeDirection(item.returning),
      deadline: String(item.deadline ?? "").normalize("NFKC").trim().slice(0, 20),
      served: item.served !== false,
    } satisfies VacancyPriceRow];
  });

  if (!rows.length) return defaultVacancyPriceDocument();
  const usedIds = new Set<string>();
  const uniqueRows = rows.map((item, index) => {
    let id = item.id;
    while (usedIds.has(id)) id = `${item.id}-${index + 1}`;
    usedIds.add(id);
    return { ...item, id };
  });
  return {
    fipeCents: boundedInteger(document.fipeCents),
    rows: uniqueRows,
  };
}
