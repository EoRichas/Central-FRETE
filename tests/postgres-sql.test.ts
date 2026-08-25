import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDatabaseValue, toPostgresSql } from "../lib/server/postgres-sql.ts";

test("converte parâmetros D1 em parâmetros posicionais PostgreSQL", () => {
  assert.equal(
    toPostgresSql("select id from users where username = ? and active = ?"),
    "select id from users where username = $1 and active = $2",
  );
});

test("mantém aliases camelCase necessários para login e telas do sistema", () => {
  assert.equal(
    toPostgresSql("select password_salt as passwordSalt, sale_number AS saleNumber from users"),
    'select password_salt as "passwordSalt", sale_number AS "saleNumber" from users',
  );
});

test("não modifica interrogações ou aliases dentro de strings e comentários", () => {
  assert.equal(
    toPostgresSql("select '?' as literal, 'texto as Nome' as label -- ? as Ignorar\nwhere id = ?"),
    "select '?' as literal, 'texto as Nome' as label -- ? as Ignorar\nwhere id = $1",
  );
});

test("preserva aliases já protegidos com aspas", () => {
  assert.equal(
    toPostgresSql('select password_hash as "passwordHash" from users where id = ?'),
    'select password_hash as "passwordHash" from users where id = $1',
  );
});

test("converte contagens bigint e valores monetários em números seguros", () => {
  assert.deepEqual(normalizeDatabaseValue({ total: 0n, rows: [{ cents: 123_456n }] }), {
    total: 0,
    rows: [{ cents: 123_456 }],
  });
});

test("rejeita valores PostgreSQL que excedem o limite inteiro seguro", () => {
  assert.throws(
    () => normalizeDatabaseValue(BigInt(Number.MAX_SAFE_INTEGER) + 1n),
    /limite inteiro seguro/,
  );
});
