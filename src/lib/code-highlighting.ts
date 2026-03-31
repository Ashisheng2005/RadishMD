type SupportedCodeLanguage =
  | "python"
  | "cpp"
  | "javascript"
  | "typescript"
  | "bash"
  | "json"
  | "html"
  | "css"
  | "sql"
  | "yaml"
  | "markdown"

const LANGUAGE_ALIASES: Record<string, SupportedCodeLanguage> = {
  py: "python",
  python: "python",
  cpp: "cpp",
  "c++": "cpp",
  cxx: "cpp",
  cc: "cpp",
  js: "javascript",
  jsx: "javascript",
  javascript: "javascript",
  ts: "typescript",
  tsx: "typescript",
  typescript: "typescript",
  bash: "bash",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  json: "json",
  html: "html",
  xml: "html",
  css: "css",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  markdown: "markdown",
}

const KEYWORDS: Record<SupportedCodeLanguage, string[]> = {
  python: ["and", "as", "assert", "async", "await", "class", "continue", "def", "del", "elif", "else", "except", "False", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "None", "nonlocal", "not", "or", "pass", "raise", "return", "True", "try", "while", "with", "yield"],
  cpp: ["alignas", "alignof", "and", "and_eq", "asm", "auto", "bitand", "bitor", "bool", "break", "case", "catch", "char", "char8_t", "char16_t", "char32_t", "class", "compl", "concept", "const", "consteval", "constexpr", "const_cast", "continue", "co_await", "co_return", "co_yield", "decltype", "default", "delete", "do", "double", "dynamic_cast", "else", "enum", "explicit", "export", "extern", "false", "float", "for", "friend", "goto", "if", "inline", "int", "long", "mutable", "namespace", "new", "noexcept", "not", "not_eq", "nullptr", "operator", "or", "or_eq", "private", "protected", "public", "register", "reinterpret_cast", "return", "short", "signed", "sizeof", "static", "static_assert", "static_cast", "struct", "switch", "template", "this", "thread_local", "throw", "true", "try", "typedef", "typeid", "typename", "union", "unsigned", "using", "virtual", "void", "volatile", "wchar_t", "while", "xor", "xor_eq"],
  javascript: ["async", "await", "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else", "export", "extends", "false", "finally", "for", "function", "if", "import", "in", "instanceof", "let", "new", "null", "return", "super", "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while", "with", "yield"],
  typescript: ["as", "async", "await", "break", "case", "catch", "class", "const", "continue", "default", "delete", "do", "else", "enum", "export", "extends", "false", "finally", "for", "from", "function", "if", "import", "in", "infer", "instanceof", "interface", "is", "keyof", "let", "namespace", "new", "null", "number", "object", "private", "protected", "public", "readonly", "return", "string", "super", "switch", "this", "throw", "true", "try", "type", "typeof", "undefined", "unique", "unknown", "var", "void", "while", "with", "yield"],
  bash: ["case", "do", "done", "elif", "else", "esac", "fi", "for", "function", "if", "in", "local", "return", "select", "then", "time", "until", "while"],
  json: [],
  html: [],
  css: ["@media", "@import", "@keyframes", "background", "border", "color", "display", "flex", "font", "grid", "height", "margin", "padding", "position", "width"],
  sql: ["alter", "and", "as", "between", "by", "case", "create", "delete", "distinct", "drop", "else", "end", "exists", "from", "group", "having", "in", "insert", "into", "join", "left", "like", "limit", "not", "null", "on", "or", "order", "select", "set", "table", "then", "union", "update", "values", "where"],
  yaml: ["false", "no", "null", "on", "off", "true", "yes"],
  markdown: [],
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function normalizeLanguage(language?: string | null): SupportedCodeLanguage | null {
  if (!language) {
    return null
  }

  const normalized = language.trim().toLowerCase()
  return LANGUAGE_ALIASES[normalized] ?? null
}

function highlightPlainTextSegment(segment: string, keywords: string[]) {
  if (keywords.length === 0) {
    return escapeHtml(segment)
  }

  const keywordPattern = new RegExp(`\\b(${keywords.map(escapeRegExp).join("|")})\\b`, "g")
  let result = ""
  let lastIndex = 0

  for (let match = keywordPattern.exec(segment); match; match = keywordPattern.exec(segment)) {
    result += escapeHtml(segment.slice(lastIndex, match.index))
    result += `<span class="text-violet-600 dark:text-violet-300 font-semibold">${escapeHtml(match[0])}</span>`
    lastIndex = match.index + match[0].length
  }

  result += escapeHtml(segment.slice(lastIndex))
  return result
}

function highlightLine(line: string, language: SupportedCodeLanguage) {
  const keywords = KEYWORDS[language]

  if (language === "python") {
    const commentIndex = line.indexOf("#")
    const codePart = commentIndex >= 0 ? line.slice(0, commentIndex) : line
    const commentPart = commentIndex >= 0 ? line.slice(commentIndex) : ""

    return `${highlightPlainTextSegment(codePart, keywords)}${commentPart ? `<span class="text-muted-foreground italic">${escapeHtml(commentPart)}</span>` : ""}`
  }

  if (language === "cpp" || language === "javascript" || language === "typescript" || language === "bash" || language === "css" || language === "sql") {
    const lineCommentIndex = line.indexOf("//")
    const hashCommentIndex = language === "bash" ? line.indexOf("#") : -1
    const commentIndexCandidates = [lineCommentIndex, hashCommentIndex].filter((value) => value >= 0)
    const commentIndex = commentIndexCandidates.length > 0 ? Math.min(...commentIndexCandidates) : -1
    const codePart = commentIndex >= 0 ? line.slice(0, commentIndex) : line
    const commentPart = commentIndex >= 0 ? line.slice(commentIndex) : ""

    let highlighted = highlightPlainTextSegment(codePart, keywords)

    if (language === "cpp" && codePart.includes("/*") && codePart.includes("*/")) {
      highlighted = highlighted.replace(/\/\*([\s\S]*?)\*\//g, (_match, comment) => `<span class="text-muted-foreground italic">/*${escapeHtml(comment)}*/</span>`)
    }

    return `${highlighted}${commentPart ? `<span class="text-muted-foreground italic">${escapeHtml(commentPart)}</span>` : ""}`
  }

  return highlightPlainTextSegment(line, keywords)
}

export function normalizeCodeLanguage(language?: string | null) {
  return normalizeLanguage(language)
}

export function renderCodeBlockInnerHtml(content: string, language?: string | null) {
  const normalizedLanguage = normalizeLanguage(language)

  if (!normalizedLanguage) {
    return escapeHtml(content).replace(/\n/g, "<br>")
  }

  return content
    .split("\n")
    .map((line) => highlightLine(line, normalizedLanguage))
    .join("<br>")
}

export function renderCodeBlockHtml(content: string, language?: string | null) {
  const normalizedLanguage = normalizeLanguage(language)
  const codeClass = normalizedLanguage
    ? "text-sm !font-mono whitespace-pre"
    : "text-sm !font-mono whitespace-pre text-muted-foreground"

  return `<pre class="bg-muted p-4 rounded-md overflow-x-auto my-4 !font-mono"><code class="${codeClass}"${normalizedLanguage ? ` data-language="${escapeHtml(normalizedLanguage)}"` : ""}>${renderCodeBlockInnerHtml(content, language)}</code></pre>`
}