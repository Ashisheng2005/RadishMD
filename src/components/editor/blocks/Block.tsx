"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { parseTableMarkdownToHtml, renderInlineMarkdown } from "./utils"
import { renderCodeBlockInnerHtml } from "@/lib/code-highlighting"
import type { Block } from "./types"
import mermaid from "mermaid"

// Module-level mermaid initialization flag (prevent re-init on every render)
let mermaidWysiwygInitialized = false
function ensureMermaidWysiwygInitialized() {
  if (mermaidWysiwygInitialized) return
  const isDark = document.documentElement.classList.contains("dark")
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? "dark" : "base",
  })
  mermaidWysiwygInitialized = true
}

interface BlockProps {
  block: Block
  isActive: boolean
  onUpdate: (content: string) => void
  onToggleTask?: () => void
  onFocus?: () => void
  onClick?: () => void
  baseFilePath?: string | null
}

export function Block({
  block,
  isActive,
  onUpdate,
  onToggleTask,
  onFocus,
  onClick,
  baseFilePath,
}: BlockProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  // Local content state for immediate UI response
  const [localContent, setLocalContent] = useState(block.content)
  const debounceRef = useRef<number | null>(null)
  const contentRef = useRef(block.content)
  // Mermaid rendering state
  const [mermaidSvg, setMermaidSvg] = useState<string>("")

  // Sync local content when block content changes externally
  useEffect(() => {
    if (!isEditing) {
      setLocalContent(block.content)
      contentRef.current = block.content
    }
  }, [block.content, isEditing])

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = "auto"
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [localContent, isEditing])

  // Auto-focus when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isEditing])

  // Flush pending updates on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        onUpdate(contentRef.current)
      }
    }
  }, [onUpdate])

  // Render mermaid diagram when in view mode
  useEffect(() => {
    if (block.type !== "mermaid" || isEditing) return

    // Empty content check
    if (!block.content.trim()) {
      setMermaidSvg(`<p class="text-muted-foreground text-sm italic">（空流程图）</p>`)
      return
    }

    ensureMermaidWysiwygInitialized()

    const chartId = `mermaid-wysiwyg-${block.id}`
    setMermaidSvg(`<p class="text-muted-foreground text-sm">正在渲染流程图...</p>`)

    mermaid
      .render(chartId, block.content)
      .then((result) => {
        setMermaidSvg(result.svg)
      })
      .catch((err) => {
        console.error("[RadishMD] mermaid render error:", err)
        const errorMsg = err instanceof Error ? err.message : String(err)
        setMermaidSvg(`<div class="mermaid-error p-4 rounded-lg border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20 my-2">
  <p class="text-sm font-medium text-red-600 dark:text-red-400 mb-1">⚠️ 流程图渲染失败</p>
  <p class="text-xs text-red-500/80 mb-2 font-mono">${errorMsg.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
  <pre class="text-xs text-red-500 whitespace-pre-wrap border-t border-red-200 dark:border-red-800 pt-2 mt-1">${block.content}</pre>
</div>`)
      })
  }, [block.type, block.id, block.content, isEditing])

  const handleFocus = useCallback(() => {
    setIsEditing(true)
    onFocus?.()
  }, [onFocus])

  const handleBlur = useCallback(() => {
    setIsEditing(false)
    // Flush any pending updates
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    if (contentRef.current !== block.content) {
      onUpdate(contentRef.current)
    }
  }, [block.content, onUpdate])

  const handleClick = useCallback(() => {
    if (!isEditing) {
      setIsEditing(true)
    }
    onClick?.()
  }, [isEditing, onClick])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value
      setLocalContent(newValue)
      contentRef.current = newValue

      // Debounce the onUpdate call
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null
        if (contentRef.current !== block.content) {
          onUpdate(contentRef.current)
        }
      }, 300)
    },
    [block.content, onUpdate]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        e.preventDefault()
        // Flush immediately on Escape
        if (debounceRef.current) {
          clearTimeout(debounceRef.current)
          debounceRef.current = null
        }
        if (contentRef.current !== block.content) {
          onUpdate(contentRef.current)
        }
        textareaRef.current?.blur()
        return
      }

      if (e.key === "Tab") {
        e.preventDefault()
        const textarea = e.currentTarget
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const value = textarea.value

        const newValue = value.substring(0, start) + "  " + value.substring(end)
        setLocalContent(newValue)
        contentRef.current = newValue

        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2
        })
        return
      }
    },
    [block.content, onUpdate]
  )

  // Render content based on block type
  const renderContent = () => {
    if (block.type === "hr") {
      return <hr className="border-border" />
    }

    if (isEditing) {
      return (
        <textarea
          ref={textareaRef}
          value={localContent}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={handleFocus}
          className={cn(
            "w-full bg-transparent outline-none resize-none min-h-[1.5em]",
            (block.type === "code" || block.type === "mermaid") && "font-mono text-sm",
            block.type === "heading1" && "text-3xl font-bold",
            block.type === "heading2" && "text-2xl font-semibold",
            block.type === "heading3" && "text-xl font-semibold",
            block.type === "heading4" && "text-lg font-semibold",
            block.type === "heading5" && "text-base font-semibold",
            block.type === "heading6" && "text-sm font-semibold",
            "placeholder:text-muted-foreground"
          )}
          style={{ minHeight: "1.5em" }}
          placeholder="输入内容..."
        />
      )
    }

    // Mermaid diagram render mode
    if (block.type === "mermaid") {
      return (
        <div
          className="mermaid-diagram flex justify-center p-4"
          dangerouslySetInnerHTML={{ __html: mermaidSvg || `<pre class="text-muted-foreground whitespace-pre-wrap">${block.content}</pre>` }}
        />
      )
    }

    // Render mode - use innerHTML for markdown rendering
    const normalizedContent = localContent.replace(/\r\n?/g, "\n")

    // Special handling for table blocks
    if (block.type === "table") {
      return (
        <div
          dangerouslySetInnerHTML={{ __html: parseTableMarkdownToHtml(normalizedContent, baseFilePath) }}
        />
      )
    }

    const htmlContent = block.type === "code"
      ? renderCodeBlockInnerHtml(block.content, block.language)
      : renderInlineMarkdown(normalizedContent, baseFilePath) || "&nbsp;"

    return (
      <div
        dangerouslySetInnerHTML={{ __html: htmlContent }}
        className={cn(
          "whitespace-pre-wrap break-words",
          block.type === "code" && "font-mono text-sm bg-muted p-4 rounded-lg overflow-x-auto",
          block.type === "heading1" && "text-3xl font-bold",
          block.type === "heading2" && "text-2xl font-semibold",
          block.type === "heading3" && "text-xl font-semibold",
          block.type === "heading4" && "text-lg font-semibold",
          block.type === "heading5" && "text-base font-semibold",
          block.type === "heading6" && "text-sm font-semibold",
          block.type === "quote" && "italic",
          block.type === "paragraph" && "text-base leading-relaxed",
          block.type === "list" && "text-base leading-relaxed",
          block.type === "ordered" && "text-base leading-relaxed list-decimal",
          block.type === "task" && "text-base leading-relaxed",
          !localContent && "text-muted-foreground"
        )}
      />
    )
  }

  // Get container classes
  const getContainerClass = () => {
    const base = "py-0.5 px-2 -mx-2 rounded transition-colors cursor-text"

    if (block.type === "hr") {
      return "py-4 cursor-pointer"
    }

    if (isActive) {
      return cn(base, "bg-accent/10 ring-2 ring-primary/30")
    }

    return cn(base, "hover:bg-accent/5")
  }

  const getWrapperClass = () => {
    if (block.type === "quote") {
      return "border-l-4 border-primary pl-4 py-1 bg-muted/30 rounded-r"
    }
    return ""
  }

  if (block.type === "hr") {
    return (
      <div
        className={cn(getContainerClass(), isActive && "bg-accent/10 rounded")}
        onClick={handleClick}
      >
        <hr className="border-border" />
      </div>
    )
  }

  if (block.type === "task") {
    return (
      <div
        className={cn("flex items-start gap-3 py-1 group", getContainerClass())}
        onClick={handleClick}
      >
        <button
          type="button"
          className={cn(
            "mt-1.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors shrink-0",
            block.checked
              ? "bg-primary border-primary text-primary-foreground"
              : "border-muted-foreground/50 hover:border-primary"
          )}
          onClick={(e) => {
            e.stopPropagation()
            onToggleTask?.()
          }}
        >
          {block.checked && (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
        <div className={cn("flex-1", getWrapperClass(), block.checked && "line-through text-muted-foreground")}>
          {renderContent()}
        </div>
      </div>
    )
  }

  if (block.type === "list") {
    return (
      <div
        className={cn("flex items-start gap-3 py-0.5", getContainerClass())}
        onClick={handleClick}
      >
        <span className="mt-2 w-1.5 h-1.5 rounded-full bg-foreground/70 shrink-0" />
        <div className={cn("flex-1", getWrapperClass())}>
          {renderContent()}
        </div>
      </div>
    )
  }

  if (block.type === "ordered") {
    return (
      <div
        className={cn("flex items-start gap-3 py-0.5", getContainerClass())}
        onClick={handleClick}
      >
        <span className="mt-2 w-1.5 h-1.5 rounded-full bg-foreground/70 shrink-0" />
        <div className={cn("flex-1", getWrapperClass())}>
          {renderContent()}
        </div>
      </div>
    )
  }

  if (block.type === "quote") {
    return (
      <div
        className={cn(
          "border-l-4 border-primary pl-4 pr-4 py-2 my-4 bg-muted/30 rounded-r-md",
          isActive && "ring-2 ring-primary/30",
          !isActive && "hover:bg-accent/5"
        )}
        onClick={handleClick}
      >
        {renderContent()}
      </div>
    )
  }

  return (
    <div
      className={cn(getContainerClass(), getWrapperClass())}
      onClick={handleClick}
    >
      {renderContent()}
    </div>
  )
}
