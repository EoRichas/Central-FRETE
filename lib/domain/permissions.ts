export type PermissionRole = "ADMIN" | "GERENCIA" | "VENDEDOR" | "FINANCEIRO" | "OPERACIONAL";

export type Capability =
  | "VIEW_ALL"
  | "MANAGE_SALES"
  | "MANAGE_CLIENTS"
  | "MANAGE_PAYMENTS"
  | "MANAGE_USERS"
  | "IMPORT_DATA";

const grants: Record<PermissionRole, ReadonlySet<Capability>> = {
  ADMIN: new Set([
    "VIEW_ALL",
    "MANAGE_SALES",
    "MANAGE_CLIENTS",
    "MANAGE_PAYMENTS",
    "MANAGE_USERS",
    "IMPORT_DATA",
  ]),
  GERENCIA: new Set(["VIEW_ALL"]),
  VENDEDOR: new Set(["MANAGE_SALES", "MANAGE_CLIENTS"]),
  FINANCEIRO: new Set(["VIEW_ALL", "MANAGE_PAYMENTS"]),
  OPERACIONAL: new Set(),
};

export function roleCan(role: PermissionRole, capability: Capability): boolean {
  return grants[role].has(capability);
}
