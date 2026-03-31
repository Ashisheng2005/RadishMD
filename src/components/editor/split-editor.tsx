import { useCallback, useDeferredValue, useEffect, useRef, type ClipboardEvent } from "react"
import { useEditorStore } from "@/lib/editor-store"
import { MarkdownRenderer } from "./markdown-renderer"
import { Toolbar, FormatType } from "./toolbar"
import { cn } from "@/lib/utils"
import { extractImageSourceFromClipboard, getImageAltFromSource } from "@/lib/image-utils"

export function SplitEditor() {
  const { content, setContent, splitViewMode, tabSize } = useEditorStore()
  const deferredContent = useDeferredValue(content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const isSyncingScrollRef = useRef(false)
  const ignoreEditorScrollUntilRef = useRef(0)
  const ignorePreviewScrollUntilRef = useRef(0)

  const suppressScroll = useCallback((target: "editor" | "preview", duration = 180) => {
    const expiresAt = performance.now() + duration

    if (target === "editor") {
      ignoreEditorScrollUntilRef.current = expiresAt
      return
    }

    ignorePreviewScrollUntilRef.current = expiresAt
  }, [])

  const syncScrollPosition = useCallback(
    (source: HTMLElement, target: HTMLElement, targetType: "editor" | "preview") => {
      if (isSyncingScrollRef.current) return

      const sourceMaxScrollTop = source.scrollHeight - source.clientHeight
      const targetMaxScrollTop = target.scrollHeight - target.clientHeight
      const ratio = sourceMaxScrollTop > 0 ? source.scrollTop / sourceMaxScrollTop : 0

      isSyncingScrollRef.current = true
      suppressScroll(targetType)
      target.scrollTop = targetMaxScrollTop > 0 ? ratio * targetMaxScrollTop : 0

      requestAnimationFrame(() => {
        isSyncingScrollRef.current = false
      })
    },
    [suppressScroll]
  )

  const handleEditorScroll = useCallback(() => {
    if (performance.now() < ignoreEditorScrollUntilRef.current) return

    const textarea = textareaRef.current
    const preview = previewRef.current
    if (!textarea || !preview) return

    syncScrollPosition(textarea, preview, "preview")
  }, [syncScrollPosition])

  const handlePreviewScroll = useCallback(() => {
    if (performance.now() < ignorePreviewScrollUntilRef.current) return

    const textarea = textareaRef.current
    const preview = previewRef.current
    if (!textarea || !preview) return

    syncScrollPosition(preview, textarea, "editor")
  }, [syncScrollPosition])

  useEffect(() => {
    // Initialize word count
    useEditorStore.getState().updateCounts(content)
  }, [content])

  // Wrap selection in textarea with markdown syntax
  const wrapTextareaSelection = useCallback((before: string, after: string) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = textarea.value
    const selectedText = text.slice(start, end)

    let newText: string
    let newCursorPos: number

    if (selectedText) {
      // Check if already wrapped
      const textBefore = text.slice(Math.max(0, start - before.length), start)
      const textAfter = text.slice(end, end + after.length)

      if (textBefore === before && textAfter === after) {
        // Remove wrapping
        newText = text.slice(0, start - before.length) + selectedText + text.slice(end + after.length)
        newCursorPos = start - before.length + selectedText.length
      } else {
        // Add wrapping
        newText = text.slice(0, start) + before + selectedText + after + text.slice(end)
        newCursorPos = start + before.length + selectedText.length + after.length
      }
    } else {
      // No selection - insert markers
      newText = text.slice(0, start) + before + after + text.slice(end)
      newCursorPos = start + before.length
    }

    setContent(newText)

    // Restore cursor position after state update
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(newCursorPos, newCursorPos)
    })
  }, [setContent])

  // Format current line with line-level syntax
  const formatTextareaLine = useCallback((prefix: string, pattern: RegExp) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const text = textarea.value

    // Find line boundaries
    const lineStart = text.lastIndexOf("\n", start - 1) + 1
    const lineEnd = text.indexOf("\n", start)
    const actualLineEnd = lineEnd === -1 ? text.length : lineEnd

    const line = text.slice(lineStart, actualLineEnd)

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
        .replace(/^#{1,6}\s/, "")
        .replace(/^-\s/, "")
        .replace(/^\d+\.\s/, "")
        .replace(/^>\s/, "")
      newLine = prefix + cleanLine

      const oldPrefixLen = (oldHeadingMatch?.[0] || oldListMatch?.[0] || oldOrderedMatch?.[0] || oldQuoteMatch?.[0] || "").length
      cursorOffset = prefix.length - oldPrefixLen
    }

    const newText = text.slice(0, lineStart) + newLine + text.slice(actualLineEnd)
    setContent(newText)

    requestAnimationFrame(() => {
      textarea.focus()
      const newPos = Math.max(lineStart, Math.min(start + cursorOffset, lineStart + newLine.length))
      textarea.setSelectionRange(newPos, newPos)
    })
  }, [setContent])

  // Insert text at cursor position
  const insertTextAtCursor = useCallback((textToInsert: string, placeholder: string = "") => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = textarea.value

    const selectedText = text.slice(start, end)
    const insertText = selectedText || placeholder

    const newText = text.slice(0, start) + textToInsert.replace("[]", insertText) + text.slice(end)
    setContent(newText)

    requestAnimationFrame(() => {
      textarea.focus()
      // Find cursor position after insertion
      const cursorPos = start + textToInsert.indexOf("[]")
      if (selectedText) {
        textarea.setSelectionRange(cursorPos + insertText.length + textToInsert.length - 2, cursorPos + insertText.length + textToInsert.length - 2)
      } else {
        const urlPos = start + textToInsert.indexOf("url") + 1
        textarea.setSelectionRange(urlPos, urlPos + 3)
      }
    })
  }, [setContent])

  const handleTextareaPaste = useCallback((event: ClipboardEvent<HTMLTextAreaElement>) => {
    const html = event.clipboardData.getData("text/html")
    const text = event.clipboardData.getData("text/plain")
    const imageSource = extractImageSourceFromClipboard(html, text)

    if (!imageSource) {
      return
    }

    event.preventDefault()

    const textarea = event.currentTarget
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const markdownImage = `![${getImageAltFromSource(imageSource)}](${imageSource})`

    const nextValue = textarea.value.slice(0, start) + markdownImage + textarea.value.slice(end)
    setContent(nextValue)

    requestAnimationFrame(() => {
      textarea.focus()
      const cursor = start + markdownImage.length
      textarea.setSelectionRange(cursor, cursor)
    })
  }, [setContent])

  const handleTextareaKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") {
      return
    }

    event.preventDefault()

    const textarea = textareaRef.current
    if (!textarea) {
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const indent = " ".repeat(tabSize)
    const hasSelection = start !== end

    const getSelectedLineRange = () => {
      const value = textarea.value
      const lineStart = value.lastIndexOf("\n", start - 1) + 1
      let lineEnd = end

      if (lineEnd < value.length && value[lineEnd] !== "\n") {
        const nextLineBreak = value.indexOf("\n", end)
        lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak
      }

      return { lineStart, lineEnd }
    }

    if (event.shiftKey) {
      const { lineStart, lineEnd } = getSelectedLineRange()
      const selectedText = textarea.value.slice(lineStart, lineEnd)
      const lines = selectedText.split("\n")

      const transformedLines = lines.map((line) => {
        const lineIndent = line.match(/^[ \t]*/)?.[0] ?? ""

        if (!lineIndent) {
          return line
        }

        const removeCount = lineIndent.startsWith("\t") ? 1 : Math.min(tabSize, lineIndent.length)
        return line.slice(removeCount)
      })

      if (!hasSelection) {
        const lineIndent = selectedText.match(/^[ \t]*/)?.[0] ?? ""

        if (!lineIndent) {
          return
        }

        const removeCount = lineIndent.startsWith("\t") ? 1 : Math.min(tabSize, lineIndent.length)
        const nextValue = textarea.value.slice(0, lineStart) + textarea.value.slice(lineStart + removeCount)
        setContent(nextValue)

        requestAnimationFrame(() => {
          textarea.focus()
          const nextStart = Math.max(lineStart, start - removeCount)
          const nextEnd = Math.max(lineStart, end - removeCount)
          textarea.setSelectionRange(nextStart, nextEnd)
        })
        return
      }

      const nextValue = textarea.value.slice(0, lineStart) + transformedLines.join("\n") + textarea.value.slice(lineEnd)
      setContent(nextValue)

      requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(lineStart, lineStart + transformedLines.join("\n").length)
      })
      return
    }

    if (hasSelection) {
      const { lineStart, lineEnd } = getSelectedLineRange()
      const selectedText = textarea.value.slice(lineStart, lineEnd)
      const nextValue = textarea.value.slice(0, lineStart) + selectedText.split("\n").map((line) => indent + line).join("\n") + textarea.value.slice(lineEnd)

      setContent(nextValue)

      requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(lineStart, lineStart + selectedText.split("\n").map((line) => indent + line).join("\n").length)
      })
      return
    }

    const nextValue = textarea.value.slice(0, start) + indent + textarea.value.slice(end)

    setContent(nextValue)

    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(start + indent.length, start + indent.length)
    })
  }, [setContent])

  // Handle format button clicks
  const handleFormat = useCallback((type: FormatType) => {
    switch (type) {
      case "bold":
        wrapTextareaSelection("**", "**")
        break
      case "italic":
        wrapTextareaSelection("*", "*")
        break
      case "strikethrough":
        wrapTextareaSelection("~~", "~~")
        break
      case "code":
        wrapTextareaSelection("`", "`")
        break
      case "link":
        insertTextAtCursor("[](url)", "链接文本")
        break
      case "image":
        insertTextAtCursor("![](url)", "图片描述")
        break
      case "list":
        formatTextareaLine("- ", /^-\s/)
        break
      case "ordered":
        formatTextareaLine("1. ", /^\d+\.\s/)
        break
      case "quote":
        formatTextareaLine("> ", /^>\s/)
        break
      case "heading1":
        formatTextareaLine("# ", /^#\s/)
        break
      case "heading2":
        formatTextareaLine("## ", /^##\s/)
        break
      case "heading3":
        formatTextareaLine("### ", /^###\s/)
        break
      case "tasklist": {
        const textarea = textareaRef.current
        if (!textarea) return
        const start = textarea.selectionStart
        const text = textarea.value
        const lineStart = text.lastIndexOf("\n", start - 1) + 1
        const newText = text.slice(0, lineStart) + "- [ ] " + text.slice(lineStart)
        setContent(newText)
        requestAnimationFrame(() => {
          textarea.focus()
          textarea.setSelectionRange(start + 6, start + 6)
        })
        break
      }
      case "table": {
        const tableText = "\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n"
        insertTextAtCursor(tableText)
        break
      }
      case "hr": {
        const textarea = textareaRef.current
        if (!textarea) return
        const start = textarea.selectionStart
        const text = textarea.value
        const needsNewline = start > 0 && text[start - 1] !== "\n"
        const hrText = (needsNewline ? "\n" : "") + "---\n"
        const newText = text.slice(0, start) + hrText + text.slice(start)
        setContent(newText)
        requestAnimationFrame(() => {
          textarea.focus()
          textarea.setSelectionRange(start + hrText.length, start + hrText.length)
        })
        break
      }
    }
  }, [wrapTextareaSelection, formatTextareaLine, insertTextAtCursor, setContent])

  // Keyboard shortcuts for split mode
  useEffect(() => {
    if (splitViewMode === "render") {
      return
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return

      const key = e.key.toLowerCase()
      const shift = e.shiftKey

      // Inline formatting: Ctrl+Key
      if (!shift) {
        switch (key) {
          case "b":
            e.preventDefault()
            handleFormat("bold")
            return
          case "i":
            e.preventDefault()
            handleFormat("italic")
            return
          case "k":
            e.preventDefault()
            handleFormat("link")
            return
          case "1":
            e.preventDefault()
            handleFormat("heading1")
            return
          case "2":
            e.preventDefault()
            handleFormat("heading2")
            return
          case "3":
            e.preventDefault()
            handleFormat("heading3")
            return
        }
      }

      // Shift+Ctrl+Key
      if (shift && e.ctrlKey) {
        switch (key) {
          case "s":
            e.preventDefault()
            handleFormat("strikethrough")
            return
          case "`":
            e.preventDefault()
            handleFormat("code")
            return
          case "i":
            e.preventDefault()
            handleFormat("image")
            return
          case "8":
            e.preventDefault()
            handleFormat("list")
            return
          case "7":
            e.preventDefault()
            handleFormat("ordered")
            return
          case "q":
            e.preventDefault()
            handleFormat("quote")
            return
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleFormat, splitViewMode])

  const showEditor = splitViewMode === "split" || splitViewMode === "editor"
  const showPreview = splitViewMode === "split" || splitViewMode === "render"

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {splitViewMode !== "render" && <Toolbar onFormat={handleFormat} />}
      <div className={cn("flex-1 flex overflow-hidden", splitViewMode === "editor" && "flex-col") }>
        {showEditor && (
          <div
            className={cn(
              "flex flex-col overflow-hidden",
              showPreview ? "flex-1 border-r border-border" : "flex-1"
            )}
          >
            <div className="px-3 py-1.5 border-b border-border bg-muted/30">
              <span className="text-xs font-medium text-muted-foreground">
                {splitViewMode === "editor" ? "编辑独显" : "编辑"}
              </span>
            </div>
            <textarea
              ref={textareaRef}
              data-editor-textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              onPaste={handleTextareaPaste}
              onScroll={handleEditorScroll}
              className={cn(
                "flex-1 w-full resize-none p-6 bg-background text-foreground",
                "font-mono text-sm leading-relaxed",
                "focus:outline-none focus:ring-0",
                "placeholder:text-muted-foreground"
              )}
              placeholder="开始编写 Markdown..."
              spellCheck={false}
            />
          </div>
        )}

        {showPreview && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-3 py-1.5 border-b border-border bg-muted/30">
              <span className="text-xs font-medium text-muted-foreground">
                {splitViewMode === "render" ? "渲染独显" : "预览"}
              </span>
            </div>
            <div
              ref={previewRef}
              onScroll={handlePreviewScroll}
              className="flex-1 overflow-y-auto p-6 bg-background"
              style={{ overflowAnchor: "none" }}
            >
              <MarkdownRenderer content={deferredContent} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
