import { ApiError } from "@/lib/server/d1";
export function userPhone(value: unknown): string | null {
  const input = String(value ?? "").trim();
  if (!input) return null;
  if (!/^[+\d\s().-]+$/.test(input)) throw new ApiError(400, "Telefone inválido. Informe o DDD e o número.");
  const digits = input.replace(/\D/g, "");
  if (!/^(?:\d{10,11}|55\d{10,11})$/.test(digits)) throw new ApiError(400, "Telefone inválido. Informe o DDD e o número.");
  return digits;
}
