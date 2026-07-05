import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { useEditorStore } from "@/lib/editor-store"
import { parseMarkdownHeadings, type MarkdownHeading } from "@/lib/heading-utils"

function findScrollContainer(element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element.parentElement

  while (current) {
    const style = window.getComputedStyle(current)
    const overflowY = style.overflowY

    if ((overflowY === "auto" || overflowY === "scroll") && current.scrollHeight > current.clientHeight) {
      return current
    }

    current = current.parentElement
  }

  return null
}

function scrollElementToContainerCenter(element: HTMLElement) {
  const scrollContainer = findScrollContainer(element)

  if (!scrollContainer) {
    element.scrollIntoView({ behavior: "smooth", block: "center" })
    return
  }

  const containerRect = scrollContainer.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const targetScrollTop =
    scrollContainer.scrollTop +
    elementRect.top -
    containerRect.top -
    scrollContainer.clientHeight / 2 +
    elementRect.height / 2

  scrollContainer.scrollTo({
    top: Math.max(0, targetScrollTop),
    behavior: "smooth",
  })
}

function scrollRenderedHeadingIntoView(lineIndex: number, attempt = 0) {
  const headingBlocks = Array.from(
    document.querySelectorAll(`[data-source-line="${lineIndex}"]`)
  ) as HTMLElement[]
  const targetBlock = headingBlocks[0]

  if (!targetBlock) {
    if (attempt < 20) {
      window.setTimeout(() => scrollRenderedHeadingIntoView(lineIndex, attempt + 1), 50)
    }
    return
  }

  scrollElementToContainerCenter(targetBlock)

  const editable = targetBlock.querySelector('[contenteditable]') as HTMLElement | null
  editable?.focus()
}

function getTextareaLineStart(value: string, lineIndex: number) {
  let lineStart = 0

  for (let index = 0; index < lineIndex; index += 1) {
    const nextLineBreak = value.indexOf("\n", lineStart)

    if (nextLineBreak === -1) {
      return value.length
    }

    lineStart = nextLineBreak + 1
  }

  return lineStart
}

function measureTextareaOffsetTop(textarea: HTMLTextAreaElement, position: number) {
  const computedStyle = window.getComputedStyle(textarea)
  const mirror = document.createElement("div")
  const marker = document.createElement("span")
  const copiedProperties = [
    "boxSizing",
    "width",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "letterSpacing",
    "lineHeight",
    "textTransform",
    "wordSpacing",
    "tabSize",
  ] as const

  copiedProperties.forEach((property) => {
    mirror.style[property] = computedStyle[property]
  })

  mirror.style.position = "absolute"
  mirror.style.visibility = "hidden"
  mirror.style.pointerEvents = "none"
  mirror.style.whiteSpace = "pre-wrap"
  mirror.style.overflowWrap = "break-word"
  mirror.style.overflow = "hidden"
  mirror.style.left = "-9999px"
  mirror.style.top = "0"
  mirror.style.height = "auto"
  mirror.style.minHeight = "0"
  mirror.style.maxHeight = "none"
  mirror.style.width = `${textarea.clientWidth}px`
  mirror.textContent = textarea.value.slice(0, position)
  marker.textContent = "\u200b"
  mirror.appendChild(marker)
  document.body.appendChild(mirror)

  const offsetTop = marker.offsetTop
  mirror.remove()

  return offsetTop
}

function scrollTextareaLineIntoView(textarea: HTMLTextAreaElement, content: string, lineIndex: number) {
  const lineStart = getTextareaLineStart(textarea.value || content, lineIndex)
  const targetTop = measureTextareaOffsetTop(textarea, lineStart)
  const computedStyle = window.getComputedStyle(textarea)
  const lineHeight = Number.parseFloat(computedStyle.lineHeight) || Number.parseFloat(computedStyle.fontSize) * 1.5 || 24

  textarea.focus()
  textarea.setSelectionRange(lineStart, lineStart)
  textarea.scrollTo({
    top: Math.max(0, targetTop - textarea.clientHeight / 2 + lineHeight / 2),
    behavior: "smooth",
  })
}

export function Outline() {
  const { content, isOutlineOpen, editMode, splitViewMode } = useEditorStore()

  const headings = useMemo(() => {
    return parseMarkdownHeadings(content)
  }, [content])

  const handleHeadingClick = (heading: MarkdownHeading) => {
    if (editMode === "split" && splitViewMode !== "render") {
      const textarea = document.querySelector(
        "[data-editor-textarea]"
      ) as HTMLTextAreaElement | null
      if (!textarea) return

      requestAnimationFrame(() => {
        scrollTextareaLineIntoView(textarea, content, heading.lineIndex)

        if (splitViewMode === "split") {
          scrollRenderedHeadingIntoView(heading.lineIndex)
        }
      })
      return
    }

    scrollRenderedHeadingIntoView(heading.lineIndex)
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
