"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useEditorStore } from "@/lib/editor-store"
import { cn } from "@/lib/utils"

interface Block {
  id: string
  type: "paragraph" | "heading1" | "heading2" | "heading3" | "heading4" | "heading5" | "heading6" | "code" | "quote" | "list" | "task" | "hr" | "table"
  content: string
  checked?: boolean
  language?: string
}

function parseMarkdownToBlocks(markdown: string): Block[] {
  const lines = markdown.split("\n")
  const blocks: Block[] = []
  let i = 0
  let blockId = 0

  while (i < lines.length) {
    const line = lines[i]
    const id = `block-${blockId++}`

    // Code block
    if (line.startsWith("```")) {
      const language = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i])
        i++
      }
      blocks.push({
        id,
        type: "code",
        content: codeLines.join("\n"),
        language,
      })
      i++
      continue
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      blocks.push({ id, type: "hr", content: "" })
      i++
      continue
    }

    // Headings
    const h6Match = line.match(/^######\s+(.*)$/)
    if (h6Match) {
      blocks.push({ id, type: "heading6", content: h6Match[1] })
      i++
      continue
    }
    const h5Match = line.match(/^#####\s+(.*)$/)
    if (h5Match) {
      blocks.push({ id, type: "heading5", content: h5Match[1] })
      i++
      continue
    }
    const h4Match = line.match(/^####\s+(.*)$/)
    if (h4Match) {
      blocks.push({ id, type: "heading4", content: h4Match[1] })
      i++
      continue
    }
    const h3Match = line.match(/^###\s+(.*)$/)
    if (h3Match) {
      blocks.push({ id, type: "heading3", content: h3Match[1] })
      i++
      continue
    }
    const h2Match = line.match(/^##\s+(.*)$/)
    if (h2Match) {
      blocks.push({ id, type: "heading2", content: h2Match[1] })
      i++
      continue
    }
    const h1Match = line.match(/^#\s+(.*)$/)
    if (h1Match) {
      blocks.push({ id, type: "heading1", content: h1Match[1] })
      i++
      continue
    }

    // Task list
    const taskMatch = line.match(/^-\s+\[([ x])\]\s+(.*)$/)
    if (taskMatch) {
      blocks.push({
        id,
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
      blocks.push({ id, type: "list", content: listMatch[1] })
      i++
      continue
    }

    // Blockquote
    const quoteMatch = line.match(/^>\s*(.*)$/)
    if (quoteMatch) {
      blocks.push({ id, type: "quote", content: quoteMatch[1] })
      i++
      continue
    }

    // Empty line or paragraph
    if (line.trim() === "") {
      i++
      continue
    }

    blocks.push({ id, type: "paragraph", content: line })
    i++
  }

  if (blocks.length === 0) {
    blocks.push({ id: "block-0", type: "paragraph", content: "" })
  }

  return blocks
}

function blocksToMarkdown(blocks: Block[]): string {
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
        case "task":
          return `- [${block.checked ? "x" : " "}] ${block.content}`
        case "hr":
          return "---"
        default:
          return block.content
      }
    })
    .join("\n")
}

function renderInlineMarkdown(text: string): string {
  let result = text

  // Escape HTML
  result = result.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

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

  // Links
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="text-primary underline underline-offset-2">$1</a>'
  )

  return result
}

interface BlockEditorProps {
  block: Block
  onUpdate: (content: string) => void
  onKeyDown: (e: React.KeyboardEvent, block: Block) => void
  onToggleTask?: () => void
  isActive: boolean
  onClick: () => void
}

function BlockEditor({ block, onUpdate, onKeyDown, onToggleTask, isActive, onClick }: BlockEditorProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [isEditing, setIsEditing] = useState(false)

  const handleBlur = useCallback(() => {
    setIsEditing(false)
    if (ref.current) {
      const newContent = ref.current.innerText
      if (newContent !== block.content) {
        onUpdate(newContent)
      }
    }
  }, [block.content, onUpdate])

  const handleFocus = useCallback(() => {
    setIsEditing(true)
  }, [])

  const handleClick = useCallback(() => {
    onClick()
    if (ref.current && block.type !== "hr") {
      ref.current.focus()
    }
  }, [onClick, block.type])

  const blockStyles: Record<Block["type"], string> = {
    paragraph: "text-base leading-relaxed",
    heading1: "text-3xl font-bold mt-8 mb-4",
    heading2: "text-2xl font-semibold mt-6 mb-3 pb-2 border-b border-border",
    heading3: "text-xl font-semibold mt-5 mb-2",
    heading4: "text-lg font-semibold mt-4 mb-2",
    heading5: "text-base font-semibold mt-3 mb-1",
    heading6: "text-sm font-semibold mt-3 mb-1 text-muted-foreground",
    code: "font-mono text-sm bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre",
    quote: "border-l-4 border-primary pl-4 py-1 italic text-muted-foreground bg-muted/30 rounded-r",
    list: "text-base leading-relaxed",
    task: "text-base leading-relaxed",
    hr: "",
    table: "text-base",
  }

  if (block.type === "hr") {
    return (
      <div
        className={cn(
          "py-4 cursor-pointer",
          isActive && "bg-accent/10 rounded"
        )}
        onClick={handleClick}
      >
        <hr className="border-border" />
      </div>
    )
  }

  if (block.type === "task") {
    return (
      <div
        className={cn(
          "flex items-start gap-3 py-1 group",
          isActive && "bg-accent/10 rounded px-2 -mx-2"
        )}
        onClick={handleClick}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleTask?.()
          }}
          className={cn(
            "mt-1.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
            block.checked
              ? "bg-primary border-primary text-primary-foreground"
              : "border-muted-foreground/50 hover:border-primary"
          )}
        >
          {block.checked && (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onBlur={handleBlur}
          onFocus={handleFocus}
          onKeyDown={(e) => onKeyDown(e, block)}
          className={cn(
            "flex-1 outline-none",
            blockStyles[block.type],
            block.checked && "line-through text-muted-foreground"
          )}
          dangerouslySetInnerHTML={{
            __html: isEditing ? block.content : renderInlineMarkdown(block.content),
          }}
        />
      </div>
    )
  }

  if (block.type === "list") {
    return (
      <div
        className={cn(
          "flex items-start gap-3 py-0.5",
          isActive && "bg-accent/10 rounded px-2 -mx-2"
        )}
        onClick={handleClick}
      >
        <span className="mt-2 w-1.5 h-1.5 rounded-full bg-foreground/70 shrink-0" />
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onBlur={handleBlur}
          onFocus={handleFocus}
          onKeyDown={(e) => onKeyDown(e, block)}
          className={cn("flex-1 outline-none", blockStyles[block.type])}
          dangerouslySetInnerHTML={{
            __html: isEditing ? block.content : renderInlineMarkdown(block.content),
          }}
        />
      </div>
    )
  }

  if (block.type === "code") {
    return (
      <div
        className={cn(
          "my-3",
          isActive && "ring-2 ring-primary/30 rounded-lg"
        )}
        onClick={handleClick}
      >
        {block.language && (
          <div className="bg-muted/80 px-4 py-1.5 rounded-t-lg border-b border-border/50">
            <span className="text-xs font-mono text-muted-foreground">{block.language}</span>
          </div>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onBlur={handleBlur}
          onFocus={handleFocus}
          onKeyDown={(e) => onKeyDown(e, block)}
          className={cn(
            blockStyles[block.type],
            block.language ? "rounded-b-lg rounded-t-none" : "rounded-lg"
          )}
        >
          {block.content}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      onFocus={handleFocus}
      onKeyDown={(e) => onKeyDown(e, block)}
      onClick={handleClick}
      className={cn(
        "outline-none py-0.5 rounded transition-colors",
        blockStyles[block.type],
        isActive && "bg-accent/10 px-2 -mx-2",
        !block.content && "min-h-[1.5em]"
      )}
      data-placeholder={!block.content ? "输入内容..." : undefined}
      dangerouslySetInnerHTML={{
        __html: isEditing ? block.content : renderInlineMarkdown(block.content) || "&nbsp;",
      }}
    />
  )
}

export function WysiwygEditor() {
  const { content, setContent } = useEditorStore()
  const [blocks, setBlocks] = useState<Block[]>(() => parseMarkdownToBlocks(content))
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const isInternalUpdate = useRef(false)

  // Sync blocks with content when content changes externally
  useEffect(() => {
    if (!isInternalUpdate.current) {
      setBlocks(parseMarkdownToBlocks(content))
    }
  }, [content])

  // Sync blocks to content when blocks change internally
  useEffect(() => {
    if (isInternalUpdate.current) {
      setContent(blocksToMarkdown(blocks))
      // Reset after syncing
      isInternalUpdate.current = false
    }
  }, [blocks, setContent])

  const updateBlock = useCallback((blockId: string, newContent: string) => {
    isInternalUpdate.current = true
    setBlocks((prev) => prev.map((b) =>
      b.id === blockId ? { ...b, content: newContent } : b
    ))
  }, [])

  const toggleTask = useCallback((blockId: string) => {
    isInternalUpdate.current = true
    setBlocks((prev) => prev.map((b) =>
      b.id === blockId && b.type === "task" ? { ...b, checked: !b.checked } : b
    ))
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent, block: Block) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      const newBlock: Block = {
        id: `block-${Date.now()}`,
        type: block.type === "list" ? "list" : block.type === "task" ? "task" : "paragraph",
        content: "",
        checked: false,
      }
      isInternalUpdate.current = true
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === block.id)
        return [...prev.slice(0, idx + 1), newBlock, ...prev.slice(idx + 1)]
      })
      setActiveBlockId(newBlock.id)
      // Focus the new block
      setTimeout(() => {
        const el = document.querySelector(`[data-block-id="${newBlock.id}"]`) as HTMLElement
        el?.focus()
      }, 10)
    }

    if (e.key === "Backspace" && block.content === "" && blocks.length > 1) {
      e.preventDefault()
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === block.id)
        if (idx > 0) {
          setActiveBlockId(prev[idx - 1].id)
        }
        return prev.filter((b) => b.id !== block.id)
      })
    }
  }, [blocks.length])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-12">
        {blocks.map((block) => (
          <div key={block.id} data-block-id={block.id}>
            <BlockEditor
              block={block}
              onUpdate={(content) => updateBlock(block.id, content)}
              onKeyDown={handleKeyDown}
              onToggleTask={() => toggleTask(block.id)}
              isActive={activeBlockId === block.id}
              onClick={() => setActiveBlockId(block.id)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
