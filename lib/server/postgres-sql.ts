type SqlState = "normal" | "single" | "double" | "line-comment" | "block-comment";

function isWordCharacter(value: string | undefined) {
  return value !== undefined && /[A-Za-z0-9_]/.test(value);
}

/**
 * Preserve the D1-style queries used by the application without changing
 * quoted values, comments, or camelCase result names expected by the UI.
 */
export function toPostgresSql(query: string): string {
  let result = "";
  let parameterIndex = 0;
  let state: SqlState = "normal";

  for (let index = 0; index < query.length; index += 1) {
    const character = query[index];
    const next = query[index + 1];

    if (state === "single") {
      result += character;
      if (character === "'" && next === "'") {
        result += next;
        index += 1;
      } else if (character === "'") {
        state = "normal";
      }
      continue;
    }

    if (state === "double") {
      result += character;
      if (character === '"' && next === '"') {
        result += next;
        index += 1;
      } else if (character === '"') {
        state = "normal";
      }
      continue;
    }

    if (state === "line-comment") {
      result += character;
      if (character === "\n") state = "normal";
      continue;
    }

    if (state === "block-comment") {
      result += character;
      if (character === "*" && next === "/") {
        result += next;
        index += 1;
        state = "normal";
      }
      continue;
    }

    if (character === "'") {
      state = "single";
      result += character;
      continue;
    }

    if (character === '"') {
      state = "double";
      result += character;
      continue;
    }

    if (character === "-" && next === "-") {
      state = "line-comment";
      result += character;
      continue;
    }

    if (character === "/" && next === "*") {
      state = "block-comment";
      result += character;
      continue;
    }

    if (character === "?") {
      parameterIndex += 1;
      result += `$${parameterIndex}`;
      continue;
    }

    if (
      character.toLowerCase() === "a" &&
      next?.toLowerCase() === "s" &&
      !isWordCharacter(query[index - 1]) &&
      !isWordCharacter(query[index + 2])
    ) {
      const aliasMatch = query.slice(index + 2).match(/^(\s+)([A-Za-z_][A-Za-z0-9_]*)/);
      if (aliasMatch && /[A-Z]/.test(aliasMatch[2])) {
        result += `${character}${next}${aliasMatch[1]}"${aliasMatch[2]}"`;
        index += 1 + aliasMatch[0].length;
        continue;
      }
    }

    result += character;
  }

  return result;
}

export function normalizeDatabaseValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) {
      throw new RangeError("O banco retornou um número maior que o limite inteiro seguro.");
    }
    return number;
  }

  if (Array.isArray(value)) return value.map(normalizeDatabaseValue);

  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeDatabaseValue(entry)]),
    );
  }

  return value;
}
