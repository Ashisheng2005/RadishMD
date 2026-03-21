import { useMemo } from "react"
import { cn } from "@/lib/utils"

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const html = useMemo(() => {
    let result = content

    // Code blocks (must be first to avoid conflicts)
    result = result.replace(
      /```(\w+)?\n([\s\S]*?)```/g,
      '<pre class="bg-muted p-4 rounded-md overflow-x-auto my-4"><code class="text-sm font-mono">$2</code></pre>'
    )

    // Inline code
    result = result.replace(
      /`([^`]+)`/g,
      '<code class="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-primary">$1</code>'
    )

    // Headers
    result = result.replace(
      /^######\s+(.+)$/gm,
      '<h6 class="text-sm font-semibold mt-6 mb-2 text-foreground">$1</h6>'
    )
    result = result.replace(
      /^#####\s+(.+)$/gm,
      '<h5 class="text-sm font-semibold mt-6 mb-2 text-foreground">$1</h5>'
    )
    result = result.replace(
      /^####\s+(.+)$/gm,
      '<h4 class="text-base font-semibold mt-6 mb-3 text-foreground">$1</h4>'
    )
    result = result.replace(
      /^###\s+(.+)$/gm,
      '<h3 class="text-lg font-semibold mt-6 mb-3 text-foreground">$1</h3>'
    )
    result = result.replace(
      /^##\s+(.+)$/gm,
      '<h2 class="text-xl font-semibold mt-8 mb-4 text-foreground border-b border-border pb-2">$1</h2>'
    )
    result = result.replace(
      /^#\s+(.+)$/gm,
      '<h1 class="text-2xl font-bold mt-8 mb-4 text-foreground">$1</h1>'
    )

    // Bold and Italic
    result = result.replace(
      /\*\*\*([^*]+)\*\*\*/g,
      '<strong class="font-bold"><em>$1</em></strong>'
    )
    result = result.replace(
      /\*\*([^*]+)\*\*/g,
      '<strong class="font-semibold text-foreground">$1</strong>'
    )
    result = result.replace(
      /\*([^*]+)\*/g,
      '<em class="italic">$1</em>'
    )

    // Strikethrough
    result = result.replace(
      /~~([^~]+)~~/g,
      '<del class="line-through text-muted-foreground">$1</del>'
    )

    // Links
    result = result.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" class="text-primary hover:underline">$1</a>'
    )

    // Images
    result = result.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      '<img src="$2" alt="$1" class="max-w-full rounded-md my-4" />'
    )

    // Blockquotes
    result = result.replace(
      /^>\s*\*\*(.+?)\*\*:\s*(.+)$/gm,
      '<blockquote class="border-l-4 border-primary pl-4 py-2 my-4 bg-muted/50 rounded-r-md"><strong class="text-primary">$1:</strong> $2</blockquote>'
    )
    result = result.replace(
      /^>\s+(.+)$/gm,
      '<blockquote class="border-l-4 border-primary pl-4 py-2 my-4 bg-muted/50 rounded-r-md text-muted-foreground italic">$1</blockquote>'
    )

    // Horizontal rule
    result = result.replace(
      /^---$/gm,
      '<hr class="my-8 border-border" />'
    )

    // Task lists
    result = result.replace(
      /^-\s+\[x\]\s+(.+)$/gm,
      '<div class="flex items-center gap-2 my-1"><input type="checkbox" checked disabled class="rounded border-border" /><span class="line-through text-muted-foreground">$1</span></div>'
    )
    result = result.replace(
      /^-\s+\[\s?\]\s+(.+)$/gm,
      '<div class="flex items-center gap-2 my-1"><input type="checkbox" disabled class="rounded border-border" /><span>$1</span></div>'
    )

    // Unordered lists
    result = result.replace(
      /^-\s+(.+)$/gm,
      '<li class="ml-4 list-disc">$1</li>'
    )

    // Ordered lists
    result = result.replace(
      /^\d+\.\s+(.+)$/gm,
      '<li class="ml-4 list-decimal">$1</li>'
    )

    // Tables
    result = result.replace(
      /\|(.+)\|\n\|[-|\s]+\|\n((?:\|.+\|\n?)+)/g,
      (_, header, body) => {
        const headerCells = header
          .split("|")
          .filter((cell: string) => cell.trim())
          .map(
            (cell: string) =>
              `<th class="border border-border px-3 py-2 text-left font-medium bg-muted">${cell.trim()}</th>`
          )
          .join("")
        const bodyRows = body
          .trim()
          .split("\n")
          .map((row: string) => {
            const cells = row
              .split("|")
              .filter((cell: string) => cell.trim())
              .map(
                (cell: string) =>
                  `<td class="border border-border px-3 py-2">${cell.trim()}</td>`
              )
              .join("")
            return `<tr>${cells}</tr>`
          })
          .join("")
        return `<table class="w-full border-collapse my-4"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`
      }
    )

    // Paragraphs (must be last)
    result = result
      .split("\n\n")
      .map((block) => {
        if (
          block.startsWith("<") ||
          block.startsWith("-") ||
          block.match(/^\d+\./)
        ) {
          return block
        }
        if (block.trim() && !block.includes("<")) {
          return `<p class="my-3 leading-relaxed">${block}</p>`
        }
        return block
      })
      .join("\n\n")

    return result
  }, [content])

  return (
    <div
      className={cn(
        "prose prose-sm max-w-none",
        "prose-headings:text-foreground prose-p:text-foreground",
        "prose-strong:text-foreground prose-em:text-foreground",
        "prose-code:text-primary",
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
