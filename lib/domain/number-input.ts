/** Aceita números pt-BR, sem confundir o separador de milhar com decimais. */
export function decimalValue(value: unknown, label: string): number {
  const raw = String(value ?? "").trim().replace(/\s/g, "");
  let normalized = raw;
  if (typeof value !== "number" && raw.includes(",")) {
    if (!/^(?:\d+|[1-9]\d{0,2}(?:\.\d{3})+),\d+$/.test(raw)) {
      throw new Error(`${label} deve ser um número válido.`);
    }
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (typeof value !== "number" && /^[1-9]\d{0,2}(?:\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, "");
  } else if (!/^\d+(?:\.\d+)?$/.test(raw)) {
    throw new Error(`${label} deve ser um número válido.`);
  }
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} deve ser um número válido.`);
  }
  return number;
}

export function distanceToInput(distanceMeters: number): string {
  return (distanceMeters / 1_000).toLocaleString("pt-BR", {
    useGrouping: false,
    maximumFractionDigits: 3,
  });
}

export function distanceInputToMeters(value: unknown): number {
  return Math.round(decimalValue(value, "Distância") * 1_000);
}
