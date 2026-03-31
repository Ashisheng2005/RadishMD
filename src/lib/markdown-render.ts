import { buildImageTag, parseImageReference } from "@/lib/image-utils"
import { renderCodeBlockHtml } from "@/lib/code-highlighting"

export interface MarkdownRenderChunk {
  key: string
  html: string
  sourceLine: number
}

interface MarkdownBlock {
  type: "paragraph" | "heading1" | "heading2" | "heading3" | "heading4" | "heading5" | "heading6" | "code" | "quote" | "list" | "task" | "hr" | "table"
  content: string
  sourceLine: number
  checked?: boolean
  language?: string
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function hashString(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }

  return (hash >>> 0).toString(36)
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

function parseTableMarkdownToHtml(content: string) {
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

function renderPlainText(text: string) {
  return escapeHtml(text).replace(/\n/g, "<br>")
}

function parseMarkdownToBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.split("\n")
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (line.startsWith("```") ) {
      const language = line.slice(3).trim()
      const codeLines: string[] = []
      const sourceLine = index
      index += 1

      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index])
        index += 1
      }

      blocks.push({ type: "code", content: codeLines.join("\n"), language, sourceLine })
      index += 1
      continue
    }

    if (line.match(/^---+$/)) {
      blocks.push({ type: "hr", content: "", sourceLine: index })
      index += 1
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6
      blocks.push({ type: `heading${level}` as MarkdownBlock["type"], content: headingMatch[2], sourceLine: index })
      index += 1
      continue
    }

    const taskMatch = line.match(/^-\s+\[([ x])\]\s+(.*)$/)
    if (taskMatch) {
      blocks.push({ type: "task", content: taskMatch[2], checked: taskMatch[1] === "x", sourceLine: index })
      index += 1
      continue
    }

    const listMatch = line.match(/^-\s+(.*)$/)
    if (listMatch) {
      blocks.push({ type: "list", content: listMatch[1], sourceLine: index })
      index += 1
      continue
    }

    const quoteMatch = line.match(/^>\s*(.*)$/)
    if (quoteMatch) {
      blocks.push({ type: "quote", content: quoteMatch[1], sourceLine: index })
      index += 1
      continue
    }

    if (index + 1 < lines.length && isTableRowLine(line) && isTableSeparatorLine(lines[index + 1])) {
      const tableLines: string[] = [line, lines[index + 1]]
      index += 2

      while (index < lines.length && isTableRowLine(lines[index])) {
        tableLines.push(lines[index])
        index += 1
      }

      blocks.push({ type: "table", content: tableLines.join("\n"), sourceLine: index - tableLines.length })
      continue
    }

    if (line.trim() === "") {
      index += 1
      continue
    }

    const paragraphLines: string[] = [line]
    index += 1

    while (index < lines.length) {
      const nextLine = lines[index]
      if (nextLine.trim() === "") break
      if (nextLine.startsWith("```")) break
      if (nextLine.match(/^---+$/)) break
      if (nextLine.match(/^#{1,6}\s/)) break
      if (nextLine.match(/^-\s/)) break
      if (nextLine.match(/^>\s/)) break
      if (isTableRowLine(nextLine)) break
      paragraphLines.push(nextLine)
      index += 1
    }

    blocks.push({ type: "paragraph", content: paragraphLines.join("\n"), sourceLine: index - paragraphLines.length })
  }

  if (blocks.length === 0) {
    blocks.push({ type: "paragraph", content: "", sourceLine: 0 })
  }

  return blocks
}

function renderInlineMarkdown(text: string, baseFilePath?: string | null): string {
  let result = text

  const trimmedText = text.trim()
  const parsedImageReference = parseImageReference(trimmedText)
  if (parsedImageReference) {
    return buildImageTag(parsedImageReference.src, parsedImageReference.alt, baseFilePath)
  }

  result = result.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  result = result.replace(/\n/g, "<br>")
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
  result = result.replace(/\*(.+?)\*/g, '<em class="italic">$1</em>')
  result = result.replace(/~~(.+?)~~/g, '<del class="line-through opacity-60">$1</del>')
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => buildImageTag(src, alt, baseFilePath))
  result = result.replace(/!([^\[\]\(\)\n]+)\(([^)]+)\)/g, (_match, alt, src) => buildImageTag(src, alt, baseFilePath))
  result = result.replace(/!?([^\[\]\(\)（）\n]+)[（(]([^()（）\n]+)[)）]/g, (_match, alt, src) => buildImageTag(src, alt, baseFilePath))
  result = result.replace(/`([^`]+)`/g, '<code class="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-primary">$1</code>')
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary underline underline-offset-2 cursor-pointer">$1</a>')

  return result
}

function renderMarkdownBlockToHtml(block: MarkdownBlock, activeFilePath?: string | null) {
  switch (block.type) {
    case "heading1":
      return `<h1 class="text-2xl font-bold mt-8 mb-4 text-foreground">${renderInlineMarkdown(block.content, activeFilePath)}</h1>`
    case "heading2":
      return `<h2 class="text-xl font-semibold mt-8 mb-4 text-foreground border-b border-border pb-2">${renderInlineMarkdown(block.content, activeFilePath)}</h2>`
    case "heading3":
      return `<h3 class="text-lg font-semibold mt-6 mb-3 text-foreground">${renderInlineMarkdown(block.content, activeFilePath)}</h3>`
    case "heading4":
      return `<h4 class="text-base font-semibold mt-6 mb-3 text-foreground">${renderInlineMarkdown(block.content, activeFilePath)}</h4>`
    case "heading5":
      return `<h5 class="text-sm font-semibold mt-6 mb-2 text-foreground">${renderInlineMarkdown(block.content, activeFilePath)}</h5>`
    case "heading6":
      return `<h6 class="text-sm font-semibold mt-6 mb-2 text-foreground">${renderInlineMarkdown(block.content, activeFilePath)}</h6>`
    case "code":
      return renderCodeBlockHtml(block.content, block.language)
    case "quote":
      return `<blockquote class="border-l-4 border-primary pl-4 py-2 my-4 bg-muted/50 rounded-r-md text-muted-foreground italic">${renderInlineMarkdown(block.content, activeFilePath)}</blockquote>`
    case "list":
      return `<ul class="my-3 pl-6 list-disc"><li class="leading-relaxed">${renderInlineMarkdown(block.content, activeFilePath)}</li></ul>`
    case "task":
      return `<ul class="my-3 pl-6 list-disc"><li class="flex items-start gap-2 leading-relaxed"><input type="checkbox" ${block.checked ? "checked" : ""} disabled class="mt-1 rounded border-border" /><span class="${block.checked ? "line-through text-muted-foreground" : ""}">${renderInlineMarkdown(block.content, activeFilePath)}</span></li></ul>`
    case "hr":
      return '<hr class="my-8 border-border" />'
    case "table":
      return parseTableMarkdownToHtml(block.content)
    case "paragraph": {
      const trimmed = block.content.trim()
      const parsedImageReference = parseImageReference(trimmed)

      if (parsedImageReference) {
        return buildImageTag(parsedImageReference.src, parsedImageReference.alt, activeFilePath)
      }

      if (!trimmed) {
        return ""
      }

      if (block.content.startsWith("<") || block.content.startsWith("-") || block.content.match(/^\d+\./)) {
        return block.content
      }

      return `<p class="my-3 leading-relaxed">${renderInlineMarkdown(block.content, activeFilePath)}</p>`
    }
    default:
      return renderPlainText(block.content)
  }
}

export function renderMarkdownToHtmlChunks(
  content: string,
  activeFilePath?: string | null,
  cache: Map<string, string> = new Map(),
) {
  const blocks = parseMarkdownToBlocks(content)
  const signatureCount = new Map<string, number>()

  return blocks
    .map((block) => {
      const signature = hashString([
        block.type,
        block.checked ? "1" : "0",
        block.language || "",
        block.content,
        activeFilePath || "",
      ].join("\u0000"))

      const occurrence = signatureCount.get(signature) ?? 0
      signatureCount.set(signature, occurrence + 1)

      let html = cache.get(signature)
      if (html === undefined) {
        html = renderMarkdownBlockToHtml(block, activeFilePath)
        cache.set(signature, html)
      }

      return {
        key: `${signature}:${occurrence}`,
        html,
        sourceLine: block.sourceLine,
      }
    })
    .filter((chunk) => chunk.html.length > 0)
}

export function renderMarkdownToHtml(content: string, activeFilePath?: string | null) {
  return renderMarkdownToHtmlChunks(content, activeFilePath)
    .map((chunk) => chunk.html)
    .join("")
}
