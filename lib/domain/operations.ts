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

export const ICMS_COST_CATEGORIES = [
  "ICMS",
  "CTE",
  "MDFE",
  "CTE_MDFE",
  "ICMS_CTE_MDFE",
] as const;

export const OPERATION_PAYMENT_CATEGORIES = [
  "COLETA_ORIGEM",
  "ENTREGA_DESTINO",
] as const;

export const PAYMENT_CONTROL_COST_CATEGORIES = [
  ...OPERATION_PAYMENT_CATEGORIES,
  "ICMS",
  "SEGURO_ALLIANZ",
  "PATIO_ORIGEM",
  "PATIO_DESTINO",
] as const;

export const EDITABLE_OPERATION_COST_CATEGORIES = PAYMENT_CONTROL_COST_CATEGORIES;

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
  return isIcmsCostCategory(category) ? "ICMS" : category;
}

export function costCategoryLabel(category: string) {
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
