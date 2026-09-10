export function todaySaoPaulo(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function currentCompetency(now = new Date()) {
  return todaySaoPaulo(now).slice(0, 7);
}

export function isCompetency(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
