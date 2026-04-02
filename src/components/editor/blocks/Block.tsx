"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { renderInlineMarkdown } from "./utils"
import type { Block } from "./types"

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
            block.type === "code" && "font-mono text-sm",
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

    // Render mode - use innerHTML for markdown rendering
    const htmlContent = block.type === "code"
      ? localContent.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")
      : renderInlineMarkdown(localContent, baseFilePath) || "&nbsp;"

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

  return (
    <div
      className={cn(getContainerClass(), getWrapperClass())}
      onClick={handleClick}
    >
      {renderContent()}
    </div>
  )
}
