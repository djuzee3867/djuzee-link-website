// Minimal Python tokenizer for the editor's highlight layer.
// Returns one HTML string per source line, so the caller can render a <div>
// per line and measure its height (multi-line strings are split correctly).

const KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break",
  "class", "continue", "def", "del", "elif", "else", "except", "finally",
  "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal",
  "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
]);

const BUILTINS = new Set([
  "abs", "all", "any", "bin", "bool", "bytearray", "bytes", "callable", "chr",
  "classmethod", "complex", "dict", "dir", "divmod", "enumerate", "filter",
  "float", "format", "frozenset", "getattr", "hasattr", "hash", "hex", "id",
  "input", "int", "isinstance", "issubclass", "iter", "len", "list", "map",
  "max", "min", "next", "object", "oct", "ord", "pow", "print", "property",
  "range", "repr", "reversed", "round", "set", "setattr", "slice", "sorted",
  "staticmethod", "str", "sum", "super", "tuple", "type", "vars", "zip",
]);

const TOKEN_RE = new RegExp(
  [
    "(?<comment>#[^\\n]*)",
    // triple-quoted strings first, then single-line ones (unterminated allowed
    // so that a string being typed still highlights)
    "(?<string>[fFrRbBuU]{0,2}(?:\"\"\"[\\s\\S]*?(?:\"\"\"|$)|'''[\\s\\S]*?(?:'''|$)|\"(?:\\\\.|[^\"\\\\\\n])*\"?|'(?:\\\\.|[^'\\\\\\n])*'?))",
    "(?<decorator>@[A-Za-z_]\\w*)",
    "(?<number>\\b(?:0[xXbBoO][0-9a-fA-F_]+|\\d[\\d_]*(?:\\.\\d*)?(?:[eE][+-]?\\d+)?j?)\\b)",
    "(?<name>[A-Za-z_]\\w*)",
  ].join("|"),
  "g"
);

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function classifyName(text, source, matchStart, matchEnd, prevKeyword) {
  if (KEYWORDS.has(text)) return "kw";
  if (prevKeyword === "def") return "fn-def";
  if (prevKeyword === "class") return "cls";
  if (text === "self" || text === "cls") return "self";

  // a name directly followed by "(" is being called
  let i = matchEnd;
  while (i < source.length && source[i] === " ") i += 1;
  const isCall = source[i] === "(";

  // ... and one directly after "." is an attribute or a method
  let j = matchStart - 1;
  while (j >= 0 && source[j] === " ") j -= 1;
  if (j >= 0 && source[j] === ".") return isCall ? "fn" : "attr";

  if (isCall) return BUILTINS.has(text) ? "builtin" : "fn";
  if (BUILTINS.has(text)) return "builtin";
  return null;
}

/**
 * @param {string} source
 * @returns {string[]} one HTML string per line of `source`
 */
export function highlightPython(source) {
  const lines = [""];
  let pos = 0;
  let prevKeyword = null;

  const push = (text, cls) => {
    const parts = text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push("");
      if (!part) return;
      const html = escapeHtml(part);
      lines[lines.length - 1] += cls ? `<span class="t-${cls}">${html}</span>` : html;
    });
  };

  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(source)) !== null) {
    if (m.index > pos) push(source.slice(pos, m.index), null);

    const g = m.groups;
    if (g.comment) push(g.comment, "comment");
    else if (g.string) push(g.string, "str");
    else if (g.decorator) push(g.decorator, "decorator");
    else if (g.number) push(g.number, "num");
    else if (g.name) {
      const cls = classifyName(g.name, source, m.index, TOKEN_RE.lastIndex, prevKeyword);
      push(g.name, cls);
      prevKeyword = KEYWORDS.has(g.name) ? g.name : null;
    }

    if (!g.name) prevKeyword = null;
    pos = TOKEN_RE.lastIndex;
  }
  if (pos < source.length) push(source.slice(pos), null);

  return lines;
}
