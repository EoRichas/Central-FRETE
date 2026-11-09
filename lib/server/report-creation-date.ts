import { todaySaoPaulo } from "@/lib/domain/dates";
import { ApiError } from "./d1";

/** Use the effective creation day, falling back to the original São Paulo day. */
export function reportCreationDateSql(alias = "") {
  const col = alias ? alias + "." : "";
  return `coalesce(${col}report_creation_date, (${col}created_at::timestamptz at time zone 'America/Sao_Paulo')::date)`;
}

export function readReportCreationDate(value: unknown, today = todaySaoPaulo()): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, "Informe uma data de criação válida.");
  }
  if (value > today) throw new ApiError(400, "A data de criação não pode ser futura.");
  return value;
}
