export function splitMarkdownTableRow(row: string): string[] {
  const trimmedRow = row.trim().replace(/^\|/, "").replace(/\|$/, "")
  const cells: string[] = []
  let current = ""
  let escaped = false
  let bracketDepth = 0
  let parenDepth = 0

  for (const char of trimmedRow) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }

    if (char === "\\") {
      current += char
      escaped = true
      continue
    }

    if (char === "[" && parenDepth === 0) {
      bracketDepth += 1
    } else if (char === "]" && bracketDepth > 0 && parenDepth === 0) {
      bracketDepth -= 1
    } else if (char === "(" && bracketDepth === 0) {
      parenDepth += 1
    } else if (char === ")" && parenDepth > 0) {
      parenDepth -= 1
    }

    if (char === "|" && bracketDepth === 0 && parenDepth === 0) {
      cells.push(current.trim())
      current = ""
      continue
    }

    current += char
  }

  cells.push(current.trim())
  return cells.map((cell) => cell.replace(/\\\|/g, "|"))
}

export function renderMarkdownEmphasis(text: string): string {
  let result = text

  result = result.replace(/(?<!\\)\*\*\*([\s\S]+?)(?<!\\)\*\*\*/g, '<strong><em>$1</em></strong>')
  result = result.replace(/(?<!\\)___([\s\S]+?)(?<!\\)___/g, '<strong><em>$1</em></strong>')
  result = result.replace(/(?<!\\)\*\*([\s\S]+?)(?<!\\)\*\*/g, '<strong class="font-semibold">$1</strong>')
  result = result.replace(/(?<!\\)__([\s\S]+?)(?<!\\)__/g, '<strong class="font-semibold">$1</strong>')
  result = result.replace(/(?<!\\)\*([^*\n]+?)(?<!\\)\*/g, '<em class="italic">$1</em>')
  result = result.replace(/(?<!\\)_([^_\n]+?)(?<!\\)_/g, '<em class="italic">$1</em>')
  result = result.replace(/(?<!\\)~~([\s\S]+?)(?<!\\)~~/g, '<del class="line-through opacity-60">$1</del>')

  return result
}
