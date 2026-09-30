export type PermissionRole = "ADMIN" | "GERENCIA" | "VENDEDOR" | "FINANCEIRO" | "OPERACIONAL";

export type Capability =
  | "CREATE_CEGONHA_SALE"
  | "CREATE_FLEET_SALE"
  | "FLEET_SALES_ONLY"
  | "VIEW_SERVICE_ORDERS"
  | "VIEW_ALL"
  | "MANAGE_SALES"
  | "MANAGE_CLIENTS"
  | "MANAGE_PAYMENTS"
  | "MANAGE_USERS"
  | "IMPORT_DATA";

const grants: Record<PermissionRole, ReadonlySet<Capability>> = {
  ADMIN: new Set([
    "CREATE_CEGONHA_SALE", "CREATE_FLEET_SALE", "VIEW_SERVICE_ORDERS",
    "VIEW_ALL",
    "MANAGE_SALES",
    "MANAGE_CLIENTS",
    "MANAGE_PAYMENTS",
    "MANAGE_USERS",
    "IMPORT_DATA",
  ]),
  GERENCIA: new Set(["VIEW_ALL", "VIEW_SERVICE_ORDERS"]),
  VENDEDOR: new Set(["MANAGE_SALES", "MANAGE_CLIENTS", "CREATE_CEGONHA_SALE", "CREATE_FLEET_SALE", "FLEET_SALES_ONLY", "VIEW_SERVICE_ORDERS"]),
  FINANCEIRO: new Set(["VIEW_ALL", "MANAGE_PAYMENTS", "VIEW_SERVICE_ORDERS"]),
  OPERACIONAL: new Set(["CREATE_CEGONHA_SALE", "CREATE_FLEET_SALE", "MANAGE_CLIENTS"]),
};

export function roleCan(role: PermissionRole, capability: Capability): boolean {
  return grants[role].has(capability);
}

export function canViewSellerCommission(role: PermissionRole): boolean {
  return role === "ADMIN" || role === "VENDEDOR";
}
