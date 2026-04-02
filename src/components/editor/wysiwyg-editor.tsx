"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useEditorStore } from "@/lib/editor-store"
import { openExternalTarget } from "@/lib/runtime"
import { ImageLightbox } from "./image-lightbox"
import { Toolbar, type FormatType } from "./toolbar"
import { Block } from "./blocks"
import { parseMarkdownToBlocks, blocksToMarkdown } from "./blocks/utils"
import type { Block as BlockType } from "./blocks/types"

export function WysiwygEditor() {
  const { content, setContent, editMode, activeFileId, findNodeById } = useEditorStore()
  const [blocks, setBlocks] = useState<BlockType[]>(() => parseMarkdownToBlocks(content))
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<{ src: string; alt?: string } | null>(null)
  const isInternalUpdate = useRef(false)
  const activeFilePath = activeFileId ? findNodeById(activeFileId)?.filePath ?? null : null
  const editorRef = useRef<HTMLDivElement>(null)

  // Sync blocks when content changes externally
  useEffect(() => {
    if (!isInternalUpdate.current) {
      setBlocks(parseMarkdownToBlocks(content))
    }
  }, [content])

  // Sync blocks to content when blocks change
  useEffect(() => {
    if (isInternalUpdate.current) {
      setContent(blocksToMarkdown(blocks))
      isInternalUpdate.current = false
    }
  }, [blocks, setContent])

  const updateBlock = useCallback((blockId: string, newContent: string) => {
    isInternalUpdate.current = true
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, content: newContent } : b)))
  }, [])

  const toggleTask = useCallback((blockId: string) => {
    isInternalUpdate.current = true
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId && b.type === "task" ? { ...b, checked: !b.checked } : b
      )
    )
  }, [])

  // Wrap selection with formatting markers
  const wrapSelection = useCallback(
    (before: string, after: string) => {
      if (!activeBlockId) return

      const textarea = editorRef.current?.querySelector(
        `[data-block-id="${activeBlockId}"] textarea`
      ) as HTMLTextAreaElement | null

      if (!textarea) return

      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const fullText = textarea.value
      const selectedText = fullText.slice(start, end)

      let newContent: string
      let newCursorPos: number | null = null

      if (selectedText) {
        newContent = fullText.slice(0, start) + before + selectedText + after + fullText.slice(end)
        newCursorPos = start + before.length + selectedText.length + after.length
      } else {
        newContent = fullText.slice(0, start) + before + after + fullText.slice(start)
        newCursorPos = start + before.length
      }

      isInternalUpdate.current = true
      updateBlock(activeBlockId, newContent)

      requestAnimationFrame(() => {
        textarea.focus()
        if (newCursorPos !== null) {
          textarea.selectionStart = textarea.selectionEnd = newCursorPos
        }
      })
    },
    [activeBlockId, updateBlock]
  )

  // Toggle line prefix (for lists, quotes, headings)
  const formatLine = useCallback(
    (prefix: string, pattern: RegExp) => {
      if (!activeBlockId) return

      const textarea = editorRef.current?.querySelector(
        `[data-block-id="${activeBlockId}"] textarea`
      ) as HTMLTextAreaElement | null

      if (!textarea) return

      const fullText = textarea.value
      const cursorPos = textarea.selectionStart

      // Find line boundaries
      const lineStart = fullText.lastIndexOf("\n", cursorPos - 1) + 1
      const lineEnd = fullText.indexOf("\n", cursorPos)
      const actualLineEnd = lineEnd === -1 ? fullText.length : lineEnd

      const line = fullText.slice(lineStart, actualLineEnd)

      let newLine: string
      let cursorOffset: number

      if (pattern.test(line)) {
        // Remove prefix
        newLine = line.replace(pattern, "")
        cursorOffset = -prefix.length
      } else {
        // Add prefix - first remove any existing prefixes
        const cleanLine = line
          .replace(/^#{1,6}\s/, "")
          .replace(/^-\s/, "")
          .replace(/^\d+\.\s/, "")
          .replace(/^>\s/, "")
        newLine = prefix + cleanLine
        cursorOffset = prefix.length
      }

      const newContent = fullText.slice(0, lineStart) + newLine + fullText.slice(actualLineEnd)

      isInternalUpdate.current = true
      updateBlock(activeBlockId, newContent)

      requestAnimationFrame(() => {
        textarea.focus()
        const newCursorPos = Math.max(lineStart, Math.min(cursorPos + cursorOffset, lineStart + newLine.length))
        textarea.selectionStart = textarea.selectionEnd = newCursorPos
      })
    },
    [activeBlockId, updateBlock]
  )

  // Handle format shortcuts from toolbar
  const handleFormatShortcut = useCallback(
    (formatType: FormatType) => {
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
          formatLine("- ", /^-\s/)
          break
        case "ordered":
          formatLine("1. ", /^\d+\.\s/)
          break
        case "quote":
          formatLine("> ", /^>\s/)
          break
        case "heading1":
          formatLine("# ", /^#\s/)
          break
        case "heading2":
          formatLine("## ", /^##\s/)
          break
        case "heading3":
          formatLine("### ", /^###\s/)
          break
        case "heading4":
          formatLine("#### ", /^####\s/)
          break
        case "heading5":
          formatLine("##### ", /^#####\s/)
          break
        case "heading6":
          formatLine("###### ", /^######\s/)
          break
        case "hr":
          // Insert HR block
          isInternalUpdate.current = true
          setBlocks((prev) => {
            const idx = prev.findIndex((b) => b.id === activeBlockId)
            if (idx === -1) return prev
            const newBlocks = [...prev]
            newBlocks.splice(idx + 1, 0, {
              id: `block-${Date.now()}`,
              sourceLine: prev[idx].sourceLine + 1,
              type: "hr",
              content: "",
            })
            return newBlocks
          })
          break
        case "tasklist":
          formatLine("- [ ] ", /^-\s\[\s\]\s/)
          break
        case "table":
          // Insert table block
          isInternalUpdate.current = true
          const tableContent = `| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |`
          setBlocks((prev) => {
            const idx = prev.findIndex((b) => b.id === activeBlockId)
            if (idx === -1) return prev
            const newBlocks = [...prev]
            newBlocks.splice(idx + 1, 0, {
              id: `block-${Date.now()}`,
              sourceLine: prev[idx].sourceLine + 1,
              type: "paragraph",
              content: tableContent,
            })
            return newBlocks
          })
          break
      }
    },
    [activeBlockId, wrapSelection, formatLine]
  )

  // Expose format handler for toolbar
  useEffect(() => {
    if (editMode === "wysiwyg") {
      (window as unknown as { __formatShortcut: typeof handleFormatShortcut }).__formatShortcut = handleFormatShortcut
    }
  }, [editMode, handleFormatShortcut])

  // Global keyboard event handler for toolbar shortcuts
  useEffect(() => {
    if (editMode !== "wysiwyg") return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return

      const key = e.key.toLowerCase()
      const shift = e.shiftKey

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

  const handleRenderedContentClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const target = event.target as HTMLElement | null
      if (!target) return

      // Handle image click
      const img = target.closest("img[src]") as HTMLImageElement | null
      if (img) {
        const src = img.getAttribute("src")
        if (!src) return

        event.preventDefault()

        if (event.ctrlKey || event.metaKey) {
          openExternalTarget(src)
          return
        }

        setPreviewImage({
          src,
          alt: img.getAttribute("alt") || undefined,
        })
        return
      }

      // Handle link click
      const link = target.closest("a[href]") as HTMLAnchorElement | null
      if (link) {
        const href = link.getAttribute("href")
        if (!href) return

        event.preventDefault()

        if (event.ctrlKey || event.metaKey) {
          openExternalTarget(href)
        }
      }
    },
    []
  )

  // Focus active block's textarea when activeBlockId changes
  useEffect(() => {
    if (!activeBlockId) return

    requestAnimationFrame(() => {
      const el = editorRef.current?.querySelector(`[data-block-id="${activeBlockId}"]`)
      if (el) {
        const textarea = el.querySelector("textarea") as HTMLTextAreaElement | null
        if (textarea) {
          textarea.focus()
        }
      }
    })
  }, [activeBlockId])

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Toolbar onFormat={handleFormatShortcut} />
      <div
        ref={editorRef}
        className="flex-1 overflow-y-auto"
        data-editor-scroll-container
        onClickCapture={handleRenderedContentClick}
      >
        <div className="max-w-3xl mx-auto px-8 py-12">
          {blocks.map((block) => (
            <div
              key={block.id}
              data-block-id={block.id}
              data-block-type={block.type}
              data-source-line={block.sourceLine}
              style={{ contentVisibility: "auto" }}
            >
              <Block
                block={block}
                isActive={activeBlockId === block.id}
                onUpdate={(content) => updateBlock(block.id, content)}
                onToggleTask={block.type === "task" ? () => toggleTask(block.id) : undefined}
                onFocus={() => setActiveBlockId(block.id)}
                onClick={() => setActiveBlockId(block.id)}
                baseFilePath={activeFilePath}
              />
            </div>
          ))}
        </div>
      </div>
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
    </div>
  )
}
