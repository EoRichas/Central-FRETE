import type { CurrentUser } from "@/lib/contracts";
import { getD1, queryFirst } from "@/lib/server/d1";

type EditableToolRow<T> = {
  payload: T;
  updatedAt: string;
  updatedByName: string | null;
};

export type EditableToolDocument<T> = {
  document: T;
  persisted: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
};

export async function loadEditableToolDocument<T>(
  documentKey: string,
  ownerKey: string,
  fallback: T,
): Promise<EditableToolDocument<T>> {
  const row = await queryFirst<EditableToolRow<T>>(
    `select d.payload, d.updated_at as updatedAt, u.name as updatedByName
     from editable_tool_documents d
     left join users u on u.id = d.updated_by
     where d.document_key = ? and d.owner_key = ?`,
    [documentKey, ownerKey],
  );
  return row
    ? {
        document: row.payload,
        persisted: true,
        updatedAt: row.updatedAt,
        updatedByName: row.updatedByName,
      }
    : {
        document: fallback,
        persisted: false,
        updatedAt: null,
        updatedByName: null,
      };
}

export async function saveEditableToolDocument<T>(
  request: Request,
  actor: CurrentUser,
  documentKey: string,
  ownerKey: string,
  document: T,
) {
  const serialized = JSON.stringify(document);
  const db = await getD1();
  await db.batch([
    db
      .prepare(
        `insert into editable_tool_documents (
          document_key, owner_key, payload, updated_by
        ) values (?, ?, ?::jsonb, ?)
        on conflict (document_key, owner_key) do update set
          payload = excluded.payload,
          updated_by = excluded.updated_by,
          updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
      )
      .bind(documentKey, ownerKey, serialized, actor.id),
    db
      .prepare(
        `insert into audit_logs (
          id, entity_type, entity_id, action, actor_user_id, actor_email,
          new_value, request_id
        ) values (?, 'EDITABLE_TOOL', ?, 'SAVED', ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        `${documentKey}:${ownerKey}`,
        actor.id,
        actor.email,
        JSON.stringify({ documentKey, ownerKey, bytes: serialized.length }),
        request.headers.get("x-request-id") ?? crypto.randomUUID(),
      ),
  ]);
}
