import type { Block, BlockType } from "./types"
import katex from "katex"
import "katex/dist/katex.min.css"
import { resolveImageSource } from "@/lib/image-utils"
import { parseMarkdownHeadingLine } from "@/lib/heading-utils"
import { renderMarkdownEmphasis, splitMarkdownTableRow } from "@/lib/markdown-inline-utils"

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function renderMathInline(formula: string): string {
  try {
    return katex.renderToString(formula, {
      throwOnError: false,
      displayMode: false,
    })
  } catch {
    return `<code class="text-red-500">${escapeHtml(formula)}</code>`
  }
}

function renderMathBlock(formula: string): string {
  try {
    return `<div class="katex-display">${katex.renderToString(formula, {
      throwOnError: false,
      displayMode: true,
    })}</div>`
  } catch {
    return `<div class="katex-display text-red-500"><code>${escapeHtml(formula)}</code></div>`
  }
}

function isTableSeparatorLine(line: string) {
  const trimmed = line.trim()

  if (!trimmed.includes("|")) {
    return false
  }

  const cells = splitMarkdownTableRow(trimmed)

  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function isTableRowLine(line: string) {
  return line.includes("|") && line.trim().length > 0
}

export function parseTableMarkdownToHtml(content: string, baseFilePath?: string | null) {
  const lines = content.split("\n").filter((line) => line.trim().length > 0)

  if (lines.length < 2 || !isTableSeparatorLine(lines[1])) {
    return `<div class="rounded-lg border border-border bg-muted/20 p-3 font-mono text-sm whitespace-pre-wrap">${escapeHtml(content)}</div>`
  }

  const headerCells = splitMarkdownTableRow(lines[0])
    .map((cell) => `<th class="border border-border px-3 py-2 text-left font-medium bg-muted">${renderInlineMarkdown(cell.trim(), baseFilePath)}</th>`)
    .join("")

  const bodyRows = lines.slice(2).map((row) => {
    const cells = splitMarkdownTableRow(row)
      .map((cell) => `<td class="border border-border px-3 py-2 align-top">${renderInlineMarkdown(cell.trim(), baseFilePath)}</td>`)
      .join("")

    return `<tr>${cells}</tr>`
  }).join("")

  return `<div class="overflow-x-auto rounded-lg border border-border bg-background"><table class="w-full border-collapse text-sm"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`
}

export function parseMarkdownToBlocks(markdown: string): Block[] {
  // Normalize line endings to handle CRLF files
  const normalizedMarkdown = markdown.replace(/\r\n?/g, "\n")
  const lines = normalizedMarkdown.split("\n")
  const blocks: Block[] = []
  let i = 0
  let blockId = 0

  while (i < lines.length) {
    const line = lines[i]
    const id = `block-${blockId++}`
    const trimmedLine = line.trim()

    // Code block
    if (trimmedLine.startsWith("```")) {
      const sourceLine = i
      const language = trimmedLine.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i])
        i++
      }
      // Mermaid diagrams use special rendering
      if (language === "mermaid") {
        blocks.push({
          id,
          sourceLine,
          type: "mermaid",
          content: codeLines.join("\n"),
          language: "mermaid",
        })
      } else {
        blocks.push({
          id,
          sourceLine,
          type: "code",
          content: codeLines.join("\n"),
          language,
        })
      }
      i++
      continue
    }

    // Block math formula $$ ... $$
    if (line.trim() === "$$") {
      const formulaLines: string[] = []
      let j = i + 1
      while (j < lines.length && lines[j].trim() !== "$$") {
        formulaLines.push(lines[j])
        j++
      }
      if (j < lines.length && lines[j].trim() === "$$") {
        blocks.push({ id, sourceLine: i, type: "paragraph", content: `$$MATH$$:${formulaLines.join("\n")}` })
        i = j + 1
        continue
      }
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      blocks.push({ id, sourceLine: i, type: "hr", content: "" })
      i++
      continue
    }

    // Headings
    const headingMatch = parseMarkdownHeadingLine(line)
    if (headingMatch) {
      blocks.push({ id, sourceLine: i, type: `heading${headingMatch.level}`, content: headingMatch.text })
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
      let content = listMatch[1]
      // Collect continuation lines (indented lines that are part of this list item)
      let j = i + 1
      while (j < lines.length) {
        const nextLine = lines[j]
        const nextTrimmed = nextLine.trim()
        // Continuation line: starts with 2+ spaces/tabs
        // But not a code block start/end marker
        if (/^[ \t]{2,}/.test(nextLine) && !nextTrimmed.startsWith("```")) {
          content += "\n" + nextLine.replace(/^[ \t]+/, "")
          j++
        } else {
          break
        }
      }
      blocks.push({ id, sourceLine: i, type: "list", content })
      i = j
      continue
    }

    // Ordered list
    const orderedMatch = line.match(/^(\d+)\.\s+(.*)$/)
    if (orderedMatch) {
      let content = orderedMatch[2]
      // Collect continuation lines (indented lines that are part of this list item)
      let j = i + 1
      while (j < lines.length) {
        const nextLine = lines[j]
        const nextTrimmed = nextLine.trim()
        // Continuation line: starts with 2+ spaces/tabs
        // But not a code block start/end marker
        if (/^[ \t]{2,}/.test(nextLine) && !nextTrimmed.startsWith("```")) {
          content += "\n" + nextLine.replace(/^[ \t]+/, "")
          j++
        } else {
          break
        }
      }
      blocks.push({ id, sourceLine: i, type: "ordered", content })
      i = j
      continue
    }

    // Blockquote
    const quoteMatch = line.match(/^>\s*(.*)$/)
    if (quoteMatch) {
      let content = quoteMatch[1]
      let j = i + 1
      // Collect continuation blockquote lines (including empty lines)
      while (j < lines.length) {
        const nextLine = lines[j]
        if (nextLine.trim() === "") {
          // Empty line within blockquote
          content += "\n"
          j++
        } else {
          const nextQuoteMatch = nextLine.match(/^>\s*(.*)$/)
          if (nextQuoteMatch) {
            content += "\n" + nextQuoteMatch[1]
            j++
          } else {
            break
          }
        }
      }
      blocks.push({ id, sourceLine: i, type: "quote", content })
      i = j
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
      if (parseMarkdownHeadingLine(nextLine)) break
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

export function renderInlineMarkdown(text: string, baseFilePath?: string | null): string {
  // Normalize line endings first to prevent extra spacing with CRLF files
  let result = text.replace(/\r\n?/g, "\n")
  const codePlaceholders: string[] = []

  // Block math formula $$MATH$$: - must be handled before inline math
  if (result.startsWith("$$MATH$$:")) {
    const formula = result.slice(9).replace(/\n/g, " ")
    return renderMathBlock(formula)
  }

  // Don't escape HTML - let browser parse it as HTML
  // WYSIWYG mode uses textarea for editing, so no XSS risk from user input

  // If content starts with < (HTML tag), resolve image paths and process math
  if (result.trim().startsWith("<")) {
    let resolvedHtml = result

    // Resolve image paths in raw HTML
    resolvedHtml = resolvedHtml.replace(
      /<img\s+([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi,
      (_match, before, src, after) => {
        const resolvedSrc = resolveImageSource(src, baseFilePath)
        const escapedSrc = resolvedSrc
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
        return `<img ${before}src="${escapedSrc}"${after}>`
      }
    )

    // Process inline math $...$ within HTML
    resolvedHtml = resolvedHtml.replace(
      /\$([^$\n]+)\$/g,
      (_match, formula) => renderMathInline(formula)
    )

    return resolvedHtml
  }

  // Convert newlines to <br> for multi-line support
  result = result.replace(/`([^`]+)`/g, (_match, code) => {
    const key = `\x00CODE:${codePlaceholders.length}\x00`
    codePlaceholders.push(`<code class="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-primary">${escapeHtml(code)}</code>`)
    return key
  })
  result = result.replace(/\n/g, "<br>")

  result = renderMarkdownEmphasis(result)

  // Inline math $...$
  result = result.replace(/\$([^$\n]+)\$/g, (_match, formula) => renderMathInline(formula))

  // Images (markdown style) - resolve local image paths to asset URLs
  result = result.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_match, alt, src) => {
      const resolvedSrc = resolveImageSource(src, baseFilePath)
      return `<img src="${escapeHtml(resolvedSrc)}" alt="${escapeHtml(alt || "图片")}" class="max-w-full rounded-md my-2" />`
    }
  )

  // Links
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="text-primary underline underline-offset-2 cursor-pointer">$1</a>'
  )
  result = result.replace(/\x00CODE:(\d+)\x00/g, (_match, index) => codePlaceholders[Number(index)] ?? "")

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
    mermaid: "font-mono text-sm bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre",
  }
  return styles[type]
}
