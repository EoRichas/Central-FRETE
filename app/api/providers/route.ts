import { authorize } from "@/lib/server/auth";
import { getD1, jsonError, queryAll } from "@/lib/server/d1";
import { asObject, digits, lower, requiredUpper } from "@/lib/server/validation";

type ProviderRow = {
  id: string;
  name: string;
  referenceName: string | null;
  yardAddress: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  active: number;
};

export async function GET(request: Request) {
  try {
    await authorize(request);
    const providers = await queryAll<ProviderRow>(
      `select id, name, reference_name as referenceName,
        yard_address as yardAddress, document, phone, email, active
       from providers order by active desc, name limit 300`,
    );
    return Response.json({
      providers: providers.map((provider) => ({
        ...provider,
        active: Boolean(provider.active),
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await authorize(request, ["ADMIN"]);
    const payload = asObject(await request.json());
    const id = crypto.randomUUID();
    const data = {
      name: requiredUpper(
        payload.companyName ?? payload.name,
        "Empresa do prestador",
      ),
      referenceName: requiredUpper(
        payload.referenceName,
        "Nome de referência",
      ),
      yardAddress: requiredUpper(payload.yardAddress, "Endereço do pátio"),
      document: digits(payload.document),
      phone: digits(payload.phone),
      email: lower(payload.email),
    };
    const db = await getD1();
    await db.batch([
      db
        .prepare(
          `insert into providers (
            id, name, reference_name, yard_address, document, phone, email, active
          ) values (?, ?, ?, ?, ?, ?, ?, 1)`,
        )
        .bind(
          id,
          data.name,
          data.referenceName,
          data.yardAddress,
          data.document,
          data.phone,
          data.email,
        ),
      db
        .prepare(
          `insert into audit_logs (
            id, entity_type, entity_id, action, actor_user_id, actor_email,
            new_value, request_id
          ) values (?, 'PROVIDER', ?, 'CREATED', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          user.id,
          user.email,
          JSON.stringify(data),
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ),
    ]);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
      return Response.json(
        { error: "Já existe outro prestador com esse CPF/CNPJ." },
        { status: 409 },
      );
    }
    return jsonError(error);
  }
}
