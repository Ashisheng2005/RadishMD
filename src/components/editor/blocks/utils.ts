import type { Block, BlockType } from "./types"

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function isTableSeparatorLine(line: string) {
  const trimmed = line.trim()

  if (!trimmed.includes("|")) {
    return false
  }

  const cells = trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())

  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function isTableRowLine(line: string) {
  return line.includes("|") && line.trim().length > 0
}

export function parseTableMarkdownToHtml(content: string) {
  const lines = content.split("\n").filter((line) => line.trim().length > 0)

  if (lines.length < 2 || !isTableSeparatorLine(lines[1])) {
    return `<div class="rounded-lg border border-border bg-muted/20 p-3 font-mono text-sm whitespace-pre-wrap">${escapeHtml(content)}</div>`
  }

  const headerCells = lines[0]
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => `<th class="border border-border px-3 py-2 text-left font-medium bg-muted">${escapeHtml(cell.trim())}</th>`)
    .join("")

  const bodyRows = lines.slice(2).map((row) => {
    const cells = row
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => `<td class="border border-border px-3 py-2 align-top">${escapeHtml(cell.trim())}</td>`)
      .join("")

    return `<tr>${cells}</tr>`
  }).join("")

  return `<div class="overflow-x-auto rounded-lg border border-border bg-background"><table class="w-full border-collapse text-sm"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`
}

export function parseMarkdownToBlocks(markdown: string): Block[] {
  const lines = markdown.split("\n")
  const blocks: Block[] = []
  let i = 0
  let blockId = 0

  while (i < lines.length) {
    const line = lines[i]
    const id = `block-${blockId++}`

    // Code block
    if (line.startsWith("```")) {
      const sourceLine = i
      const language = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i])
        i++
      }
      blocks.push({
        id,
        sourceLine,
        type: "code",
        content: codeLines.join("\n"),
        language,
      })
      i++
      continue
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      blocks.push({ id, sourceLine: i, type: "hr", content: "" })
      i++
      continue
    }

    // Headings
    const h6Match = line.match(/^######\s+(.*)$/)
    if (h6Match) {
      blocks.push({ id, sourceLine: i, type: "heading6", content: h6Match[1] })
      i++
      continue
    }
    const h5Match = line.match(/^#####\s+(.*)$/)
    if (h5Match) {
      blocks.push({ id, sourceLine: i, type: "heading5", content: h5Match[1] })
      i++
      continue
    }
    const h4Match = line.match(/^####\s+(.*)$/)
    if (h4Match) {
      blocks.push({ id, sourceLine: i, type: "heading4", content: h4Match[1] })
      i++
      continue
    }
    const h3Match = line.match(/^###\s+(.*)$/)
    if (h3Match) {
      blocks.push({ id, sourceLine: i, type: "heading3", content: h3Match[1] })
      i++
      continue
    }
    const h2Match = line.match(/^##\s+(.*)$/)
    if (h2Match) {
      blocks.push({ id, sourceLine: i, type: "heading2", content: h2Match[1] })
      i++
      continue
    }
    const h1Match = line.match(/^#\s+(.*)$/)
    if (h1Match) {
      blocks.push({ id, sourceLine: i, type: "heading1", content: h1Match[1] })
      i++
      continue
    }

    // Task list
    const taskMatch = line.match(/^-\s+\[([ x])\]\s+(.*)$/)
    if (taskMatch) {
      blocks.push({
        id,
        sourceLine: i,
        type: "task",
        content: taskMatch[2],
        checked: taskMatch[1] === "x",
      })
      i++
      continue
    }

    // Unordered list
    const listMatch = line.match(/^-\s+(.*)$/)
    if (listMatch) {
      blocks.push({ id, sourceLine: i, type: "list", content: listMatch[1] })
      i++
      continue
    }

    // Ordered list
    const orderedMatch = line.match(/^(\d+)\.\s+(.*)$/)
    if (orderedMatch) {
      blocks.push({ id, sourceLine: i, type: "ordered", content: orderedMatch[2] })
      i++
      continue
    }

    // Blockquote
    const quoteMatch = line.match(/^>\s*(.*)$/)
    if (quoteMatch) {
      blocks.push({ id, sourceLine: i, type: "quote", content: quoteMatch[1] })
      i++
      continue
    }

    // Table
    if (i + 1 < lines.length && isTableRowLine(line) && isTableSeparatorLine(lines[i + 1])) {
      const tableLines: string[] = [line, lines[i + 1]]
      i += 2

      while (i < lines.length && isTableRowLine(lines[i])) {
        tableLines.push(lines[i])
        i++
      }

      blocks.push({ id, sourceLine: i - tableLines.length, type: "table", content: tableLines.join("\n") })
      continue
    }

    // Empty line - skip
    if (line.trim() === "") {
      i++
      continue
    }

    // Collect consecutive non-empty lines for this paragraph
    const paragraphLines: string[] = [line]
    i++
    while (i < lines.length) {
      const nextLine = lines[i]
      // Stop if empty line or a special block type starts a new line
      if (nextLine.trim() === "") break
      if (nextLine.startsWith("```")) break
      if (nextLine.match(/^---+$/)) break
      if (nextLine.match(/^#{1,6}\s/)) break
      if (nextLine.match(/^-\s/)) break
      if (nextLine.match(/^\d+\.\s/)) break
      if (nextLine.match(/^>\s/)) break
      paragraphLines.push(nextLine)
      i++
    }

    blocks.push({ id, sourceLine: i - paragraphLines.length, type: "paragraph", content: paragraphLines.join("\n") })
  }

  if (blocks.length === 0) {
    blocks.push({ id: "block-0", sourceLine: 0, type: "paragraph", content: "" })
  }

  return blocks
}

export function blocksToMarkdown(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "heading1":
          return `# ${block.content}`
        case "heading2":
          return `## ${block.content}`
        case "heading3":
          return `### ${block.content}`
        case "heading4":
          return `#### ${block.content}`
        case "heading5":
          return `##### ${block.content}`
        case "heading6":
          return `###### ${block.content}`
        case "code":
          return `\`\`\`${block.language || ""}\n${block.content}\n\`\`\``
        case "quote":
          return `> ${block.content}`
        case "list":
          return `- ${block.content}`
        case "ordered":
          return `1. ${block.content}`
        case "task":
          return `- [${block.checked ? "x" : " "}] ${block.content}`
        case "hr":
          return "---"
        case "table":
          return block.content
        default:
          return block.content
      }
    })
    .join("\n")
}

export function renderInlineMarkdown(text: string, _baseFilePath?: string | null): string {
  let result = text

  // Escape HTML first
  result = result.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

  // Convert newlines to <br> for multi-line support
  result = result.replace(/\n/g, "<br>")

  // Bold + Italic
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')

  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')

  // Italic
  result = result.replace(/\*(.+?)\*/g, '<em class="italic">$1</em>')

  // Strikethrough
  result = result.replace(/~~(.+?)~~/g, '<del class="line-through opacity-60">$1</del>')

  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code class="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-primary">$1</code>')

  // Images (markdown style)
  result = result.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_match, alt, src) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt || "图片")}" class="max-w-full rounded-md my-2" />`
  )

  // Links
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="text-primary underline underline-offset-2 cursor-pointer">$1</a>'
  )

  return result
}

export function getBlockStyles(type: BlockType): string {
  const styles: Record<BlockType, string> = {
    paragraph: "text-base leading-relaxed whitespace-pre-wrap",
    heading1: "text-3xl font-bold mt-8 mb-4",
    heading2: "text-2xl font-semibold mt-6 mb-3 pb-2 border-b border-border",
    heading3: "text-xl font-semibold mt-5 mb-2",
    heading4: "text-lg font-semibold mt-4 mb-2",
    heading5: "text-base font-semibold mt-3 mb-1",
    heading6: "text-sm font-semibold mt-3 mb-1 text-muted-foreground",
    code: "font-mono text-sm bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre",
    quote: "border-l-4 border-primary pl-4 py-1 italic text-muted-foreground bg-muted/30 rounded-r",
    list: "text-base leading-relaxed whitespace-pre-wrap",
    ordered: "text-base leading-relaxed whitespace-pre-wrap list-decimal",
    task: "text-base leading-relaxed whitespace-pre-wrap",
    hr: "",
    table: "text-base",
  }
  return styles[type]
}
