/** Split PostgreSQL scripts without breaking quoted functions, strings or comments. */
export function sqlStatements(source) {
  const statements = [];
  let start = 0,
    quote = "",
    dollar = "",
    lineComment = false,
    blockDepth = 0;
  for (let index = 0; index < source.length; index++) {
    const char = source[index],
      next = source[index + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockDepth) {
      if (char === "/" && next === "*") {
        blockDepth++;
        index++;
      } else if (char === "*" && next === "/") {
        blockDepth--;
        index++;
      }
      continue;
    }
    if (dollar) {
      if (source.startsWith(dollar, index)) {
        index += dollar.length - 1;
        dollar = "";
      }
      continue;
    }
    if (quote) {
      if (char === quote) {
        if (next === quote) index++;
        else quote = "";
      }
      continue;
    }
    if (char === "-" && next === "-") {
      lineComment = true;
      index++;
      continue;
    }
    if (char === "/" && next === "*") {
      blockDepth = 1;
      index++;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "$") {
      const match = source.slice(index).match(/^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/);
      if (match) {
        dollar = match[0];
        index += dollar.length - 1;
        continue;
      }
    }
    if (char === ";") {
      const statement = source.slice(start, index).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
  }
  if (quote || dollar || blockDepth)
    throw new Error("SQL incompleto: confira strings, comentários e funções.");
  const tail = source.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}
