import { assertTrustedMutation } from './request-security';
import { assertAccessGateway } from './access-gateway';
import type { CurrentUser, Role } from "@/lib/contracts";
import { roleCan } from "@/lib/domain/permissions";
import { ApiError, queryFirst } from "@/lib/server/d1";
import { verifyLocalSession } from "@/lib/server/local-session";

const ALLOWED_ROLES: Role[] = ["ADMIN", "GERENCIA", "VENDEDOR", "FINANCEIRO", "OPERACIONAL"];

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  active: number;
  commissionBasisPoints: number;
};

export async function authorize(
  request: Request,
  allowedRoles: Role[] = ALLOWED_ROLES,
): Promise<CurrentUser> {
  assertTrustedMutation(request);
  await assertAccessGateway(request);
  const session = await verifyLocalSession(request);
  if (!session) {
    throw new ApiError(401, "Informe usuário e senha para acessar o sistema.");
  }

  const row = await queryFirst<UserRow>(
    `select id, email, name, role, active, commission_basis_points as commissionBasisPoints from users where id = ? limit 1`,
    [session.userId],
  );

  if (!row) throw new ApiError(401, "Sessão inválida. Entre novamente.");
  if (!row.active) throw new ApiError(403, "Usuário inativo.");
  if (!ALLOWED_ROLES.includes(row.role as Role)) {
    throw new ApiError(403, "Perfil de acesso inválido.");
  }
  if (!allowedRoles.includes(row.role as Role)) {
    throw new ApiError(403, "Seu perfil não permite esta operação.");
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as Role,
    ...(row.role === "VENDEDOR" ? {commissionBasisPoints: row.commissionBasisPoints} : {}),
  };
}

export function canManagePayments(role: Role) {
  return roleCan(role, "MANAGE_PAYMENTS");
}

export function canManageMasterData(role: Role) {
  return roleCan(role, "MANAGE_CLIENTS");
}
