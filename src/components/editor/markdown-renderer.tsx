import { useMemo, useState } from "react"
import { ImageLightbox } from "./image-lightbox"
import { buildImageTag, parseImageReference } from "@/lib/image-utils"
import { useEditorStore } from "@/lib/editor-store"
import { cn } from "@/lib/utils"
import { openExternalTarget } from "@/lib/runtime"

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const [previewImage, setPreviewImage] = useState<{ src: string; alt?: string } | null>(null)
  const activeFilePath = useEditorStore((state) => {
    if (!state.activeFileId) {
      return null
    }

    return state.findNodeById(state.activeFileId)?.filePath ?? null
  })

  const html = useMemo(() => {
    let result = content

    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")

    const codeBlocks: Array<{ token: string; html: string }> = []

    // Code blocks: extract first so later markdown rules do not touch code contents.
    result = result.replace(
      /```(\w+)?\n([\s\S]*?)```/g,
      (_match, language = "", code) => {
        const token = `__CODE_BLOCK_${codeBlocks.length}__`
        codeBlocks.push({
          token,
          html: `<pre class="bg-muted p-4 rounded-md overflow-x-auto my-4 !font-mono"><code class="text-sm !font-mono whitespace-pre" data-language="${escapeHtml(language)}">${escapeHtml(code)}</code></pre>`,
        })
        return token
      }
    )

    // Inline code
    result = result.replace(
      /`([^`]+)`/g,
      (_match, code) =>
        `<code class="bg-muted px-1.5 py-0.5 rounded text-sm !font-mono text-primary">${escapeHtml(code)}</code>`
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

    // Images
    result = result.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (_match, alt, src) => buildImageTag(src, alt, activeFilePath)
    )
    result = result.replace(
      /!([^\[\]\(\)\n]+)\(([^)]+)\)/g,
      (_match, alt, src) => buildImageTag(src, alt, activeFilePath)
    )
    result = result.replace(
      /!?([^\[\]\(\)（）\n]+)[（(]([^()（）\n]+)[)）]/g,
      (_match, alt, src) => buildImageTag(src, alt, activeFilePath)
    )

    // Links
    result = result.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" class="text-primary hover:underline">$1</a>'
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
        const trimmedBlock = block.trim()
        const parsedImageReference = parseImageReference(trimmedBlock)

        if (parsedImageReference) {
          return buildImageTag(parsedImageReference.src, parsedImageReference.alt, activeFilePath)
        }

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

    for (const { token, html } of codeBlocks) {
      result = result.split(token).join(html)
    }

    return result
  }, [content, activeFilePath])

  function openRenderedTarget(target: string) {
    void openExternalTarget(target)
  }

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    if (!target) return

    const imageElement = target.closest("img[src]") as HTMLImageElement | null
    if (imageElement) {
      const imageSource = imageElement.getAttribute("src")
      if (!imageSource) return

      event.preventDefault()

      if (event.ctrlKey || event.metaKey) {
        openRenderedTarget(imageSource)
        return
      }

      setPreviewImage({
        src: imageSource,
        alt: imageElement.getAttribute("alt") || undefined,
      })
      return
    }

    const linkElement = target.closest("a[href]") as HTMLAnchorElement | null
    if (!linkElement) return

    const targetUrl = linkElement.getAttribute("href")
    if (!targetUrl) return

    event.preventDefault()

    if (!event.ctrlKey && !event.metaKey) {
      return
    }

    openRenderedTarget(targetUrl)
  }

  return (
    <>
      <div
        className={cn(
          "prose prose-sm max-w-none",
          "prose-headings:text-foreground prose-p:text-foreground",
          "prose-strong:text-foreground prose-em:text-foreground",
          "prose-code:text-primary",
          className
        )}
        onClickCapture={handleClickCapture}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {previewImage && (
        <ImageLightbox
          open={Boolean(previewImage)}
          onOpenChange={(open) => {
            if (!open) {
              setPreviewImage(null)
            }
          }}
          src={previewImage.src}
          alt={previewImage.alt}
        />
      )}
    </>
  )
}
