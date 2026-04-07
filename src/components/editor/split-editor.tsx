import { useCallback, useDeferredValue, useEffect, useRef, type ClipboardEvent } from "react"
import { useEditorStore } from "@/lib/editor-store"
import { MarkdownRenderer } from "./markdown-renderer"
import { Toolbar, FormatType } from "./toolbar"
import { cn } from "@/lib/utils"
import { extractImageSourceFromClipboard, getImageAltFromSource } from "@/lib/image-utils"

export function SplitEditor() {
  const { content, setContent, splitViewMode, tabSize, contentType, shouldResetScroll, setShouldResetScroll, activeFileId, saveScrollPosition, getScrollPosition } = useEditorStore()
  const deferredContent = useDeferredValue(content) // 使用 useDeferredValue 降低渲染优先级，保持输入流畅
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const isSyncingScrollRef = useRef(false) // 标记是否正在执行滚动同步，防止循环触发
  const ignoreEditorScrollUntilRef = useRef(0) // 忽略编辑器滚动事件的截止时间
  const ignorePreviewScrollUntilRef = useRef(0) // 忽略预览区滚动事件的截止时间
  const countUpdateTimeoutRef = useRef<number | null>(null) // 字数统计防抖定时器
  const lastSyncTimeRef = useRef(0) // ResizeObserver 节流时间戳
  const pendingSyncRef = useRef<{ source: HTMLElement; target: HTMLElement; targetType: "editor" | "preview" } | null>(null) // 待执行的同步任务
  const lastActiveFileIdRef = useRef<string | null>(null) // 跟踪上次的文件 ID，用于保存滚动位置
  const isRestoringScrollRef = useRef(false) // 标记是否正在恢复滚动位置

  const suppressScroll = useCallback((target: "editor" | "preview", duration = 180) => {
    // 抑制目标区域的滚动事件，防止主被动滚动相互触发导致死循环或抖动
    const expiresAt = performance.now() + duration

    if (target === "editor") {
      ignoreEditorScrollUntilRef.current = expiresAt
      return
    }

    ignorePreviewScrollUntilRef.current = expiresAt
  }, [])

  // Percentage-based scroll sync - syncs by scroll percentage instead of delta
  // This ensures visual position alignment regardless of content height differences
  const syncScrollByPercent = useCallback(
    (source: HTMLElement, target: HTMLElement, targetType: "editor" | "preview") => {
      if (isSyncingScrollRef.current) return

      const sourceScrollable = source.scrollHeight - source.clientHeight
      const targetScrollable = target.scrollHeight - target.clientHeight

      // 仅当有可滚动内容时同步
      if (sourceScrollable <= 0 || targetScrollable <= 0) return

      // 计算源元素的滚动百分比
      const sourcePercent = source.scrollTop / sourceScrollable

      // 避免微小滚动导致抖动
      if (Math.abs(sourcePercent) < 0.001) return

      isSyncingScrollRef.current = true
      suppressScroll(targetType)

      // 将百分比应用到目标元素
      const newScrollTop = sourcePercent * targetScrollable
      target.scrollTop = Math.max(0, Math.min(newScrollTop, targetScrollable))

      requestAnimationFrame(() => {
        isSyncingScrollRef.current = false
      })
    },
    [suppressScroll]
  )

  // 处理 ResizeObserver 触发的同步（带节流）
  const handleResizeSync = useCallback(() => {
    // PDF 模式下跳过滚动同步，避免闪烁
    const { contentType: ct } = useEditorStore.getState()
    if (ct === "pdf") return

    const now = performance.now()
    const THROTTLE_MS = 50 // 最多每 50ms 同步一次

    if (now - lastSyncTimeRef.current < THROTTLE_MS) {
      // 记录待执行的同步任务，供下次执行
      const textarea = textareaRef.current
      const preview = previewRef.current
      if (textarea && preview) {
        pendingSyncRef.current = { source: textarea, target: preview, targetType: "preview" }
      }
      return
    }

    lastSyncTimeRef.current = now

    const textarea = textareaRef.current
    const preview = previewRef.current
    if (!textarea || !preview) return

    syncScrollByPercent(textarea, preview, "preview")
  }, [syncScrollByPercent])

  const handleEditorScroll = useCallback(() => {
    // PDF 模式下跳过滚动同步
    const { contentType: ct, splitViewMode: svm } = useEditorStore.getState()
    if (ct === "pdf" || svm === "render") return
    if (performance.now() < ignoreEditorScrollUntilRef.current) return
    if (isRestoringScrollRef.current) return

    const textarea = textareaRef.current
    const preview = previewRef.current
    if (!textarea || !preview) return

    syncScrollByPercent(textarea, preview, "preview")
  }, [syncScrollByPercent])

  const handlePreviewScroll = useCallback(() => {
    if (performance.now() < ignorePreviewScrollUntilRef.current) return
    if (isRestoringScrollRef.current) return

    const textarea = textareaRef.current
    const preview = previewRef.current
    if (!textarea || !preview) return

    syncScrollByPercent(preview, textarea, "editor")
  }, [syncScrollByPercent])

  useEffect(() => {
    // 使用防抖机制更新字数统计，避免每次按键输入都全量遍历计算
    if (countUpdateTimeoutRef.current !== null) {
      window.clearTimeout(countUpdateTimeoutRef.current)
    }
    countUpdateTimeoutRef.current = window.setTimeout(() => {
      countUpdateTimeoutRef.current = null
      useEditorStore.getState().updateCounts(content)
    }, 300)

    return () => {
      if (countUpdateTimeoutRef.current !== null) {
        window.clearTimeout(countUpdateTimeoutRef.current)
      }
    }
  }, [content])

  // 监听文件切换，保存/恢复滚动位置（使用百分比）
  useEffect(() => {
    const textarea = textareaRef.current
    const preview = previewRef.current
    if (!textarea || !preview) return

    // 保存当前文件的滚动位置（转换为百分比）
    if (lastActiveFileIdRef.current && lastActiveFileIdRef.current !== activeFileId) {
      const textareaScrollable = textarea.scrollHeight - textarea.clientHeight
      const previewScrollable = preview.scrollHeight - preview.clientHeight
      const editorPercent = textareaScrollable > 0 ? textarea.scrollTop / textareaScrollable : 0
      const previewPercent = previewScrollable > 0 ? preview.scrollTop / previewScrollable : 0
      saveScrollPosition(lastActiveFileIdRef.current, editorPercent, previewPercent)
    }

    // 切换到新文件
    if (activeFileId && activeFileId !== lastActiveFileIdRef.current) {
      lastActiveFileIdRef.current = activeFileId
      isRestoringScrollRef.current = true

      if (shouldResetScroll) {
        // 新导入文件，重置到顶部
        textarea.scrollTop = 0
        preview.scrollTop = 0
        setShouldResetScroll(false)
        isRestoringScrollRef.current = false
      } else {
        // 恢复该文件之前的滚动位置（百分比转绝对值）
        const savedPosition = getScrollPosition(activeFileId)
        // 使用 requestAnimationFrame 确保 DOM 已完成渲染
        requestAnimationFrame(() => {
          if (savedPosition) {
            const textareaScrollable = textarea.scrollHeight - textarea.clientHeight
            const previewScrollable = preview.scrollHeight - preview.clientHeight
            textarea.scrollTop = savedPosition.editor * textareaScrollable
            isRestoringScrollRef.current = false
            preview.scrollTop = savedPosition.preview * previewScrollable
          } else {
            textarea.scrollTop = 0
            preview.scrollTop = 0
            isRestoringScrollRef.current = false
          }
        })
      }
    }
  }, [activeFileId, shouldResetScroll, saveScrollPosition, getScrollPosition, setShouldResetScroll])

  // 监听预览区高度变化，当渲染稳定时修正滚动位置
  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return

    // 节流后的同步任务执行器
    const executePendingSync = () => {
      const pending = pendingSyncRef.current
      if (pending) {
        pendingSyncRef.current = null
        const now = performance.now()
        if (now - lastSyncTimeRef.current >= 50) {
          lastSyncTimeRef.current = now
          syncScrollByPercent(pending.source, pending.target, pending.targetType)
        }
      }
    }

    const observer = new ResizeObserver(() => {
      handleResizeSync()
      // 如果有待执行的同步任务，延迟执行
      requestAnimationFrame(executePendingSync)
    })

    observer.observe(preview)

    return () => {
      observer.disconnect()
    }
  }, [handleResizeSync, syncScrollByPercent])

  // 使用 Markdown 语法标记包裹文本框中选中的内容 (常用于加粗、斜体等)
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

  // 对当前行进行行级 Markdown 语法格式化 (例如转换标题、列表)
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

  // 在光标所在位置插入文本，并处理链接和图片等快速插入的占位定位
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

  // 处理粘贴事件，自动识别图片和 HTML 图源并转为 Markdown 语法
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

  // 处理文本框按键事件（核心处理 Tab/Shift+Tab 多行缩进的逻辑）
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

  // 处理工具栏等按钮触发的各种格式化操作
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

  // 注册分栏模式与全局快捷键 (例如加粗/标题/引用等 Ctrl/Cmd + ...)
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
              onScroll={contentType === "markdown" ? handlePreviewScroll : undefined}
              className="flex-1 overflow-y-auto p-6 bg-background"
              style={{ overflowAnchor: "none" }}
            >
              {contentType === "pdf" ? (
                <div
                  className="min-h-[80vh] will-change-transform"
                  style={{ contain: "layout style paint" }}
                >
                  <embed
                    src={content}
                    type="application/pdf"
                    className="w-full h-[80vh]"
                  />
                </div>
              ) : (
                <MarkdownRenderer content={deferredContent} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
