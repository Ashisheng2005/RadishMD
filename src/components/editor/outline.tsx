import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { useEditorStore } from "@/lib/editor-store"

interface HeadingItem {
  level: number
  text: string
  id: string
}

export function Outline() {
  const { content, isOutlineOpen } = useEditorStore()

  const headings = useMemo(() => {
    const lines = content.split("\n")
    const items: HeadingItem[] = []

    lines.forEach((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/)
      if (match) {
        items.push({
          level: match[1].length,
          text: match[2],
          id: `heading-${index}`,
        })
      }
    })

    return items
  }, [content])

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
