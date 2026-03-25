import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { useEditorStore } from "@/lib/editor-store"

interface HeadingItem {
  level: number
  text: string
  lineIndex: number
}

export function Outline() {
  const { content, isOutlineOpen, editMode } = useEditorStore()

  const headings = useMemo(() => {
    const lines = content.split("\n")
    const items: HeadingItem[] = []
    let inCodeBlock = false

    lines.forEach((line, index) => {
      if (line.startsWith("```")) {
        inCodeBlock = !inCodeBlock
        return
      }

      if (inCodeBlock) return

      const match = line.match(/^(#{1,6})\s+(.+)$/)
      if (match) {
        items.push({
          level: match[1].length,
          text: match[2],
          lineIndex: index,
        })
      }
    })

    return items
  }, [content])

  const handleHeadingClick = (heading: HeadingItem) => {
    if (editMode === "split") {
      const textarea = document.querySelector(
        "[data-editor-textarea]"
      ) as HTMLTextAreaElement | null
      if (!textarea) return

      const lines = content.split("\n")
      const lineStart = lines
        .slice(0, heading.lineIndex)
        .reduce((total, line) => total + line.length + 1, 0)
      const computedStyle = window.getComputedStyle(textarea)
      const lineHeight = Number.parseFloat(computedStyle.lineHeight) || Number.parseFloat(computedStyle.fontSize) * 1.5 || 24

      textarea.focus()
      textarea.setSelectionRange(lineStart, lineStart)

      requestAnimationFrame(() => {
        const targetScrollTop = Math.max(
          0,
          heading.lineIndex * lineHeight - textarea.clientHeight / 2 + lineHeight / 2
        )
        textarea.scrollTo({
          top: targetScrollTop,
          behavior: "smooth",
        })
      })
      return
    }

    const headingBlocks = Array.from(
      document.querySelectorAll(`[data-source-line="${heading.lineIndex}"]`)
    ) as HTMLElement[]
    const targetBlock = headingBlocks[0]

    if (!targetBlock) return

    targetBlock.scrollIntoView({ behavior: "smooth", block: "center" })

    const editable = targetBlock.querySelector('[contenteditable]') as HTMLElement | null
    editable?.focus()
  }

  if (!isOutlineOpen) return null

  return (
    <aside className="w-56 h-full bg-card border-l border-border flex flex-col">
      <div className="px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          大纲
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {headings.length === 0 ? (
          <p className="text-sm text-muted-foreground px-2 py-4 text-center">
            暂无标题
          </p>
        ) : (
          <nav className="space-y-0.5">
            {headings.map((heading, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleHeadingClick(heading)}
                className={cn(
                  "w-full text-left px-2 py-1 text-sm rounded-sm",
                  "hover:bg-accent hover:text-accent-foreground",
                  "text-muted-foreground transition-colors truncate",
                  heading.level === 1 && "font-medium text-foreground",
                  heading.level === 2 && "pl-4",
                  heading.level === 3 && "pl-6",
                  heading.level === 4 && "pl-8",
                  heading.level === 5 && "pl-10",
                  heading.level === 6 && "pl-12"
                )}
              >
                {heading.text}
              </button>
            ))}
          </nav>
        )}
      </div>
    </aside>
  )
}
