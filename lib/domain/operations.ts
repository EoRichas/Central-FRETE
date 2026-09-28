export const OPERATIONAL_STATUS_OPTIONS = [
  { value: "CONFIRMAR", label: "CONFIRMAR" },
  { value: "AGUARDANDO REEMBARQUE", label: "AGUARDANDO REEMBARQUE" },
  { value: "EM VIAGEM", label: "EM VIAGEM" },
  { value: "FINALIZADO", label: "FINALIZADO" },
  { value: "PÁTIO DE APOIO", label: "PÁTIO DE APOIO" },
  { value: "PÁTIO CENTRAL", label: "PÁTIO CENTRAL" },
] as const;

export const OPERATIONAL_STATUSES = OPERATIONAL_STATUS_OPTIONS.map(
  (option) => option.value,
);

export type OperationalStatus = (typeof OPERATIONAL_STATUSES)[number];

export const ORIGIN_LOCATION_TYPES = [
  "PATIO",
  "PORTA",
  "PONTO_DE_ENCONTRO",
] as const;

export type OriginLocationType = (typeof ORIGIN_LOCATION_TYPES)[number];

export const ORIGIN_LOCATION_TYPE_LABELS: Record<OriginLocationType, string> = {
  PATIO: "PÁTIO",
  PORTA: "PORTA",
  PONTO_DE_ENCONTRO: "PONTO DE ENCONTRO",
};

export const FIXED_COST_ROWS = [
  {
    key: "NOTA_FISCAL_IMPOSTO",
    category: "NOTA_FISCAL_IMPOSTO",
    label: "NOTA FISCAL / IMPOSTO",
  },
  {
    key: "SEGURO_ALLIANZ",
    category: "SEGURO_ALLIANZ",
    label: "SEGURO ALLIANZ",
  },
  { key: "ICMS", category: "ICMS", label: "ICMS" },
  { key: "CTE_MDFE", category: "CTE_MDFE", label: "CTE / MDF" },
  {
    key: "COLETA_ORIGEM",
    category: "COLETA_ORIGEM",
    label: "COLETA NA ORIGEM",
  },
  {
    key: "ENTREGA_DESTINO",
    category: "ENTREGA_DESTINO",
    label: "ENTREGA NO DESTINO",
  },
  {
    key: "PATIO_ORIGEM",
    category: "PATIO_ORIGEM",
    label: "PÁTIO DE ORIGEM",
  },
  {
    key: "PATIO_DESTINO",
    category: "PATIO_DESTINO",
    label: "PÁTIO DE DESTINO",
  },
  {
    key: "PRESTADOR_SERVICO_1",
    category: "PRESTADOR_SERVICO",
    label: "PRESTADOR DE SERVIÇO 1",
  },
  {
    key: "PRESTADOR_SERVICO_2",
    category: "PRESTADOR_SERVICO",
    label: "PRESTADOR DE SERVIÇO 2",
  },
  {
    key: "PRESTADOR_SERVICO_3",
    category: "PRESTADOR_SERVICO",
    label: "PRESTADOR DE SERVIÇO 3",
  },
  {
    key: "OUTRAS_DESPESAS",
    category: "OUTRAS_DESPESAS",
    label: "OUTRAS DESPESAS",
  },
] as const;

export const COST_CATEGORIES = [
  "NOTA_FISCAL_IMPOSTO",
  "SEGURO_ALLIANZ",
  "ICMS",
  "CTE_MDFE",
  // Categorias antigas continuam válidas para preservar vendas já cadastradas.
  "CTE",
  "MDFE",
  "ICMS_CTE_MDFE",
  "COLETA_ORIGEM",
  "ENTREGA_DESTINO",
  "PATIO_ORIGEM",
  "PATIO_DESTINO",
  "PRESTADOR_SERVICO",
  "OUTRAS_DESPESAS",
] as const;

export const ICMS_COST_CATEGORIES = ["ICMS"] as const;

export const OPERATION_PAYMENT_CATEGORIES = [
  "COLETA_ORIGEM",
  "ENTREGA_DESTINO",
] as const;

export const PAYMENT_CONTROL_COST_CATEGORIES = [
  ...OPERATION_PAYMENT_CATEGORIES,
  "PATIO_ORIGEM",
  "PATIO_DESTINO",
] as const;

// Custos editáveis no detalhe da venda. A edição permanece restrita ao
// Administrador e ao Financeiro no endpoint; o vendedor apenas consulta.
export const EDITABLE_OPERATION_COST_CATEGORIES = [
  ...PAYMENT_CONTROL_COST_CATEGORIES,
  "NOTA_FISCAL_IMPOSTO",
  "OUTRAS_DESPESAS",
  "SEGURO_ALLIANZ", "ICMS", "CTE_MDFE", "CTE", "MDFE", "ICMS_CTE_MDFE",
] as const;

export const DIRECT_PAID_OPERATION_COST_CATEGORIES = [
  "NOTA_FISCAL_IMPOSTO",
  "SEGURO_ALLIANZ",
  ...ICMS_COST_CATEGORIES,
] as const;

export function isDirectPaidOperationCostCategory(category: string) {
  return DIRECT_PAID_OPERATION_COST_CATEGORIES.some((item) => item === category);
}


export function isOperationPaymentCategory(category: string) {
  return OPERATION_PAYMENT_CATEGORIES.some((item) => item === category);
}

export function isEditableOperationCostCategory(category: string) {
  return EDITABLE_OPERATION_COST_CATEGORIES.some((item) => item === category);
}

export function isPaymentControlCostCategory(category: string) {
  return PAYMENT_CONTROL_COST_CATEGORIES.some((item) => item === category);
}

export function isIcmsCostCategory(category: string) {
  return ICMS_COST_CATEGORIES.some((item) => item === category);
}

export function normalizeCostCategory(category: string) {
  return category;
}

export function costCategoryLabel(category: string) {
  if (category === "ICMS_CTE_MDFE") return "ICMS / CTE / MDF (LEGADO COMBINADO)";
  if (category === "CTE" || category === "MDFE") return `${category} (LEGADO)`;
  if (isIcmsCostCategory(category)) return "ICMS";
  if (category === "PRESTADOR_SERVICO") {
    return "PRESTADOR DE SERVIÇO";
  }
  return (
    FIXED_COST_ROWS.find((row) => row.category === category)?.label ?? category
  );
}

export function calculateDestinationArrivalDate(
  originYardEntryDate: string,
  operationalDeadlineDays: string | number,
) {
  const days = Number(operationalDeadlineDays);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(originYardEntryDate) ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 365
  ) {
    return "";
  }
  const date = new Date(`${originYardEntryDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatRouteLocationType(origin: OriginLocationType | null | undefined, destination: OriginLocationType | null | undefined): string {
  if (origin === 'PATIO' && destination === 'PATIO') return 'PÁTIO A PÁTIO';
  if (origin === 'PORTA' && destination === 'PORTA') return 'PORTA A PORTA';
  return `${origin ? ORIGIN_LOCATION_TYPE_LABELS[origin] : 'NÃO INFORMADO'} → ${destination ? ORIGIN_LOCATION_TYPE_LABELS[destination] : 'NÃO INFORMADO'}`;
}
export function visibleOperationCosts<T extends { amountCents: number }>(costs: T[]): T[] {
  return costs.filter(cost => cost.amountCents > 0);
}
