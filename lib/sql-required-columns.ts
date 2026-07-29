import type { FlowDraft, FlowInput } from "./flow-types.ts";

type SqlToken = {
  kind: "identifier" | "symbol";
  value: string;
  depth: number;
};

const aliasBoundaryWords = new Set([
  "AS", "CROSS", "FULL", "GROUP", "HAVING", "INNER", "JOIN", "LEFT", "LIMIT",
  "OFFSET", "ON", "ORDER", "QUALIFY", "RIGHT", "UNION", "WHERE", "WINDOW",
]);

export function applySqlRequiredColumns<T extends Pick<FlowDraft, "sql" | "inputs">>(draft: T): T {
  if (!draft.sql.trim()) return draft;
  const required = requiredColumnsByInput(draft.sql, draft.inputs);
  return {
    ...draft,
    inputs: draft.inputs.map((input) => ({
      ...input,
      requiredColumns: input.requiredColumns.map((column) => ({
        ...column,
        required: required.get(input.tableName)?.has(column.name.toLocaleLowerCase()) ?? false,
      })),
    })),
  };
}

export function requiredColumnsByInput(sql: string, inputs: FlowInput[]) {
  const tokens = tokenizeSql(sql);
  const inputByName = new Map(inputs.map((input) => [input.tableName.toLocaleLowerCase(), input]));
  const inputByAlias = new Map(inputByName);
  const required = new Map(inputs.map((input) => [input.tableName, new Set<string>()]));

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind !== "identifier" || !["FROM", "JOIN"].includes(token.value.toUpperCase())) continue;
    const table = tokens[index + 1];
    if (table?.kind !== "identifier") continue;
    const input = inputByName.get(table.value.toLocaleLowerCase());
    if (!input) continue;
    let alias = tokens[index + 2];
    if (alias?.kind === "identifier" && alias.value.toUpperCase() === "AS") alias = tokens[index + 3];
    if (alias?.kind === "identifier" && !aliasBoundaryWords.has(alias.value.toUpperCase())) {
      inputByAlias.set(alias.value.toLocaleLowerCase(), input);
    }
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.value === "*" && isUnqualifiedSelectWildcard(tokens, index)) {
      inputs.forEach((input) => markAll(required, input));
      continue;
    }
    if (token.kind !== "identifier") continue;

    if (tokens[index + 1]?.value === "." && tokens[index + 2]?.value === "*") {
      const input = inputByAlias.get(token.value.toLocaleLowerCase());
      if (input) markAll(required, input);
      continue;
    }
    if (tokens[index + 1]?.value === "." && tokens[index + 2]?.kind === "identifier") {
      const input = inputByAlias.get(token.value.toLocaleLowerCase());
      if (input) markColumn(required, input, tokens[index + 2].value);
      continue;
    }
    if (tokens[index - 1]?.value === "." || tokens[index - 1]?.value.toUpperCase() === "AS") continue;
    for (const input of inputs) markColumn(required, input, token.value);
  }

  return required;

  function markAll(target: Map<string, Set<string>>, input: FlowInput) {
    const columns = target.get(input.tableName);
    input.requiredColumns.forEach((column) => columns?.add(column.name.toLocaleLowerCase()));
  }

  function markColumn(target: Map<string, Set<string>>, input: FlowInput, candidate: string) {
    const normalized = candidate.toLocaleLowerCase();
    const column = input.requiredColumns.find((item) => item.name.toLocaleLowerCase() === normalized);
    if (column) target.get(input.tableName)?.add(normalized);
  }
}

function isUnqualifiedSelectWildcard(tokens: SqlToken[], index: number) {
  if (tokens[index - 1]?.value === ".") return false;
  const depth = tokens[index].depth;
  let previousAtDepth: SqlToken | undefined;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (tokens[cursor].depth !== depth) continue;
    previousAtDepth = tokens[cursor];
    break;
  }
  if (!previousAtDepth || !["SELECT", "DISTINCT", "ALL", ","].includes(previousAtDepth.value.toUpperCase())) return false;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = tokens[cursor];
    if (candidate.depth !== depth || candidate.kind !== "identifier") continue;
    const word = candidate.value.toUpperCase();
    if (word === "SELECT") return true;
    if (word === "FROM") return false;
  }
  return false;
}

function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let depth = 0;
  for (let index = 0; index < sql.length;) {
    const char = sql[index];
    const next = sql[index + 1];
    if (/\s/.test(char)) { index += 1; continue; }
    if (char === "-" && next === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < sql.length && !(sql[index] === "*" && sql[index + 1] === "/")) index += 1;
      index += 2;
      continue;
    }
    if (char === "'") {
      index += 1;
      while (index < sql.length) {
        if (sql[index] === "'" && sql[index + 1] === "'") { index += 2; continue; }
        if (sql[index] === "'") { index += 1; break; }
        index += 1;
      }
      continue;
    }
    if (char === '"') {
      let value = "";
      index += 1;
      while (index < sql.length) {
        if (sql[index] === '"' && sql[index + 1] === '"') { value += '"'; index += 2; continue; }
        if (sql[index] === '"') { index += 1; break; }
        value += sql[index];
        index += 1;
      }
      tokens.push({ kind: "identifier", value, depth });
      continue;
    }
    if (char === "(") {
      tokens.push({ kind: "symbol", value: char, depth });
      depth += 1;
      index += 1;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      tokens.push({ kind: "symbol", value: char, depth });
      index += 1;
      continue;
    }
    if (".,*".includes(char)) {
      tokens.push({ kind: "symbol", value: char, depth });
      index += 1;
      continue;
    }
    if (/[A-Za-z0-9_$\u0080-\uFFFF]/.test(char)) {
      let value = char;
      index += 1;
      while (index < sql.length && /[A-Za-z0-9_$\u0080-\uFFFF]/.test(sql[index])) {
        value += sql[index];
        index += 1;
      }
      tokens.push({ kind: "identifier", value, depth });
      continue;
    }
    tokens.push({ kind: "symbol", value: char, depth });
    index += 1;
  }
  return tokens;
}
