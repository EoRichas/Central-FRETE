export function newestCreatedFirst(
  a: { createdDate: string; saleNumber: string; id: string },
  b: { createdDate: string; saleNumber: string; id: string },
) {
  return b.createdDate.localeCompare(a.createdDate)
    || b.saleNumber.localeCompare(a.saleNumber, "pt-BR", { numeric: true })
    || a.id.localeCompare(b.id);
}
