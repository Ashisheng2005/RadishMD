"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useEditorStore } from "@/lib/editor-store"
import { cn } from "@/lib/utils"
import { FormatType, Toolbar } from "./toolbar"

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

// Helper: get text offset from node/offset to element start
function getTextOffset(element: HTMLElement, node: Node, offset: number): number {
  const treeWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null)
  let totalOffset = 0
  let currentNode: Node | null = null

  while ((currentNode = treeWalker.nextNode())) {
    if (currentNode === node) {
      return totalOffset + offset
    }
    totalOffset += (currentNode as Text).textContent?.length || 0
  }
  return totalOffset + offset
}

// Helper: get caret position in element
function getCaretPosition(element: HTMLElement): number {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return 0

  const range = selection.getRangeAt(0)
  const preRange = range.cloneRange()
  preRange.selectNodeContents(element)
  preRange.setEnd(range.startContainer, range.startOffset)
  return preRange.toString().length
}

// Helper: set caret position in element
function setCaretPosition(element: HTMLElement, position: number) {
  const range = document.createRange()
  const selection = window.getSelection()

  let charCount = 0
  let found = false

  function traverseNodes(node: Node) {
    if (found) return
    if (node.nodeType === Node.TEXT_NODE) {
      const nodeLength = node.textContent?.length || 0
      if (charCount + nodeLength >= position) {
        range.setStart(node, position - charCount)
        range.collapse(true)
        found = true
      }
      charCount += nodeLength
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        traverseNodes(node.childNodes[i])
        if (found) return
      }
    }
  }

  traverseNodes(element)
  if (!found) {
    range.selectNodeContents(element)
    range.collapse(false)
  }
  selection?.removeAllRanges()
  selection?.addRange(range)
}

export function WysiwygEditor() {
  const { content, setContent, editMode } = useEditorStore()
  const [blocks, setBlocks] = useState<Block[]>(() => parseMarkdownToBlocks(content))
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const isInternalUpdate = useRef(false)

  // Get current block content and selection
  const getActiveBlockContent = useCallback((): { block: Block; element: HTMLElement } | null => {
    if (!activeBlockId) return null
    const block = blocks.find((b) => b.id === activeBlockId)
    const element = document.querySelector(`[data-block-id="${activeBlockId}"]`)?.querySelector('[contenteditable]') as HTMLElement | null
    if (!block || !element) return null
    return { block, element }
  }, [activeBlockId, blocks])

  // Wrap or unwrap selection with formatting markers
  const wrapSelection = useCallback((before: string, after: string) => {
    const result = getActiveBlockContent()
    if (!result) return
    const { block, element } = result

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    const selectedText = selection.toString()

    let newContent: string
    let newCursorPos: number | null = null

    if (selectedText) {
      // Check if selection is already wrapped
      const fullText = element.innerText
      const startOffset = getTextOffset(element, range.startContainer, range.startOffset)
      const endOffset = getTextOffset(element, range.endContainer, range.endOffset)
      const textBefore = fullText.slice(Math.max(0, startOffset - before.length), startOffset)
      const textAfter = fullText.slice(endOffset, endOffset + after.length)

      if (textBefore === before && textAfter === after) {
        // Unwrap: remove formatting
        newContent =
          fullText.slice(0, startOffset - before.length) +
          selectedText +
          fullText.slice(endOffset + after.length)
        newCursorPos = startOffset - before.length + selectedText.length
      } else {
        // Wrap: add formatting
        newContent =
          fullText.slice(0, startOffset) +
          before + selectedText + after +
          fullText.slice(endOffset)
        newCursorPos = startOffset + before.length + selectedText.length + after.length
      }
    } else {
      // No selection: insert markers with cursor in middle
      const cursorPos = getCaretPosition(element)
      newContent =
        element.innerText.slice(0, cursorPos) +
        before + after +
        element.innerText.slice(cursorPos)
      newCursorPos = cursorPos + before.length
    }

    // Update block
    const blockIndex = blocks.findIndex((b) => b.id === block.id)
    if (blockIndex === -1) return

    isInternalUpdate.current = true
    setBlocks((prev) => {
      const newBlocks = [...prev]
      newBlocks[blockIndex] = { ...newBlocks[blockIndex], content: newContent }
      return newBlocks
    })

    // Restore cursor position after DOM update
    setTimeout(() => {
      element.innerText = newContent
      if (newCursorPos !== null) {
        setCaretPosition(element, newCursorPos)
      }
    }, 0)
  }, [getActiveBlockContent, blocks])

  // Format entire line (for lists, quotes, and headings)
  const formatLine = useCallback((type: "list" | "ordered" | "quote" | "heading1" | "heading2" | "heading3" | "heading4" | "heading5" | "heading6") => {
    const result = getActiveBlockContent()
    if (!result) return
    const { block, element } = result

    const fullText = element.innerText
    const cursorPos = getCaretPosition(element)

    // Find line boundaries
    let lineStart = fullText.lastIndexOf("\n", cursorPos - 1) + 1
    let lineEnd = fullText.indexOf("\n", cursorPos)
    if (lineEnd === -1) lineEnd = fullText.length

    const line = fullText.slice(lineStart, lineEnd)

    // Determine prefix and pattern
    let prefix: string
    let pattern: RegExp
    switch (type) {
      case "list":
        prefix = "- "
        pattern = /^-\s/
        break
      case "ordered":
        prefix = "1. "
        pattern = /^\d+\.\s/
        break
      case "quote":
        prefix = "> "
        pattern = /^>\s/
        break
      case "heading1":
        prefix = "# "
        pattern = /^#\s/
        break
      case "heading2":
        prefix = "## "
        pattern = /^##\s/
        break
      case "heading3":
        prefix = "### "
        pattern = /^###\s/
        break
      case "heading4":
        prefix = "#### "
        pattern = /^####\s/
        break
      case "heading5":
        prefix = "##### "
        pattern = /^#####\s/
        break
      case "heading6":
        prefix = "###### "
        pattern = /^######\s/
        break
    }

    let newLine: string
    let cursorOffset: number
    if (pattern.test(line)) {
      // Remove prefix (toggle off)
      newLine = line.replace(pattern, "")
      cursorOffset = -prefix.length
    } else {
      // Add prefix - first remove any existing heading/list/quote prefixes
      const oldHeadingMatch = line.match(/^#{1,6}\s/)
      const oldListMatch = line.match(/^-\s/)
      const oldOrderedMatch = line.match(/^\d+\.\s/)
      const oldQuoteMatch = line.match(/^>\s/)

      let cleanLine = line
        .replace(/^#{1,6}\s/, "")  // Remove any heading prefix
        .replace(/^-\s/, "")       // Remove list prefix
        .replace(/^\d+\.\s/, "")   // Remove ordered list prefix
        .replace(/^>\s/, "")       // Remove quote prefix
      newLine = prefix + cleanLine

      // Calculate cursor offset based on what prefix was removed
      const oldPrefixLen = (oldHeadingMatch?.[0] || oldListMatch?.[0] || oldOrderedMatch?.[0] || oldQuoteMatch?.[0] || "").length
      cursorOffset = prefix.length - oldPrefixLen
    }

    const newContent = fullText.slice(0, lineStart) + newLine + fullText.slice(lineEnd)
    const blockIndex = blocks.findIndex((b) => b.id === block.id)
    if (blockIndex === -1) return

    isInternalUpdate.current = true
    setBlocks((prev) => {
      const newBlocks = [...prev]
      newBlocks[blockIndex] = { ...newBlocks[blockIndex], content: newContent }
      return newBlocks
    })

    setTimeout(() => {
      element.innerText = newContent
      const newCursorPos = cursorPos + cursorOffset
      setCaretPosition(element, Math.max(lineStart, Math.min(newCursorPos, lineStart + newLine.length)))
    }, 0)
  }, [getActiveBlockContent, blocks])

  // Handle keyboard shortcuts
  const handleFormatShortcut = useCallback((formatType: FormatType) => {
    switch (formatType) {
      case "bold":
        wrapSelection("**", "**")
        break
      case "italic":
        wrapSelection("*", "*")
        break
      case "strikethrough":
        wrapSelection("~~", "~~")
        break
      case "code":
        wrapSelection("`", "`")
        break
      case "link":
        wrapSelection("[", "](url)")
        break
      case "image":
        wrapSelection("![", "](url)")
        break
      case "list":
        formatLine("list")
        break
      case "ordered":
        formatLine("ordered")
        break
      case "quote":
        formatLine("quote")
        break
      case "heading1":
        formatLine("heading1")
        break
      case "heading2":
        formatLine("heading2")
        break
      case "heading3":
        formatLine("heading3")
        break
      case "heading4":
        formatLine("heading4")
        break
      case "heading5":
        formatLine("heading5")
        break
      case "heading6":
        formatLine("heading6")
        break
    }
  }, [wrapSelection, formatLine])

  // Expose format handler for toolbar
  useEffect(() => {
    if (editMode === "wysiwyg") {
      (window as unknown as { __formatShortcut: typeof handleFormatShortcut }).__formatShortcut = handleFormatShortcut
    }
  }, [editMode, handleFormatShortcut])

  // Global keyboard event handler
  useEffect(() => {
    if (editMode !== "wysiwyg") return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return

      const key = e.key.toLowerCase()
      const shift = e.shiftKey

      // Inline formatting: Ctrl+Key
      if (!shift) {
        switch (key) {
          case "b":
            e.preventDefault()
            handleFormatShortcut("bold")
            return
          case "i":
            e.preventDefault()
            handleFormatShortcut("italic")
            return
          case "k":
            e.preventDefault()
            handleFormatShortcut("link")
            return
          case "1":
            e.preventDefault()
            handleFormatShortcut("heading1")
            return
          case "2":
            e.preventDefault()
            handleFormatShortcut("heading2")
            return
          case "3":
            e.preventDefault()
            handleFormatShortcut("heading3")
            return
          case "4":
            e.preventDefault()
            handleFormatShortcut("heading4")
            return
          case "5":
            e.preventDefault()
            handleFormatShortcut("heading5")
            return
          case "6":
            e.preventDefault()
            handleFormatShortcut("heading6")
            return
        }
      }

      // Shift+Ctrl+Key
      if (shift && e.ctrlKey) {
        switch (key) {
          case "s":
            e.preventDefault()
            handleFormatShortcut("strikethrough")
            return
          case "`":
            e.preventDefault()
            handleFormatShortcut("code")
            return
          case "i":
            e.preventDefault()
            handleFormatShortcut("image")
            return
          case "8":
            e.preventDefault()
            handleFormatShortcut("list")
            return
          case "7":
            e.preventDefault()
            handleFormatShortcut("ordered")
            return
          case "q":
            e.preventDefault()
            handleFormatShortcut("quote")
            return
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [editMode, handleFormatShortcut])

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
      const result = getActiveBlockContent()
      if (!result) return
      const { element } = result

      // Get caret position and split content
      const caretPos = getCaretPosition(element)
      const fullText = element.innerText
      const textBefore = fullText.slice(0, caretPos)
      const textAfter = fullText.slice(caretPos)

      const newBlock: Block = {
        id: `block-${Date.now()}`,
        type: block.type === "list" ? "list" : block.type === "task" ? "task" : "paragraph",
        content: textAfter,
        checked: false,
      }

      isInternalUpdate.current = true

      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === block.id)
        if (idx === -1) return prev
        return [
          ...prev.slice(0, idx),
          { ...prev[idx], content: textBefore },
          newBlock,
          ...prev.slice(idx + 1)
        ]
      })
      setActiveBlockId(newBlock.id)

      // Focus the new block's contenteditable element and set cursor at start
      setTimeout(() => {
        const el = document.querySelector(`[data-block-id="${newBlock.id}"] [contenteditable]`) as HTMLElement
        if (el) {
          el.focus()
          setCaretPosition(el, 0)
        }
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
  }, [blocks.length, getActiveBlockContent])

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Toolbar onFormat={handleFormatShortcut} />
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
    </div>
  )
}
