// Share only an in-flight session request. Never cache a user's permissions.
let pending: Promise<Response> | null = null;

export function fetchSession(): Promise<Response> {
  pending ??= fetchRead('/api/me').finally(() => { pending = null; });
  return pending.then(response => response.clone());
}
import { fetchRead } from "./read-request.ts";

