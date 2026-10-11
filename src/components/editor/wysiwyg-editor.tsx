"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useEditorStore } from "@/lib/editor-store"
import { openExternalTarget } from "@/lib/runtime"
import { ImageLightbox } from "./image-lightbox"
import { Toolbar, type FormatType } from "./toolbar"
import { Block } from "./blocks"
import { parseMarkdownToBlocks, blocksToMarkdown } from "./blocks/utils"
import type { Block as BlockType } from "./blocks/types"

function updateSourceLines(blocks: BlockType[]) {
  let sourceLine = 0
  return blocks.map((block) => {
    const updated = block.sourceLine === sourceLine ? block : { ...block, sourceLine }
    sourceLine += blocksToMarkdown([block]).split("\n").length + (block.type === "quote" ? 0 : 1)
    return updated
  })
}

export function WysiwygEditor() {
  const { content, setContent, editMode, activeFileId, findNodeById } = useEditorStore()
  const [blocks, setBlocks] = useState<BlockType[]>(() => parseMarkdownToBlocks(content))
  const [activeBlockId, setActiveBlockIdState] = useState<string | null>(null)
  const activeBlockIdRef = useRef<string | null>(null)
  const setActiveBlockId = useCallback((id: string | null) => {
    activeBlockIdRef.current = id
    setActiveBlockIdState(id)
  }, [])
  const [previewImage, setPreviewImage] = useState<{ src: string; alt?: string } | null>(null)
  const blocksRef = useRef(blocks)
  const blocksFileIdRef = useRef(activeFileId)
  const pendingInternalUpdateRef = useRef<{ content: string; fileId: string | null } | null>(null)
  const activeFilePath = activeFileId ? findNodeById(activeFileId)?.filePath ?? null : null
  const editorRef = useRef<HTMLDivElement>(null)

  // Sync blocks when content changes externally
  useEffect(() => {
    const pending = pendingInternalUpdateRef.current
    pendingInternalUpdateRef.current = null
    if (pending?.fileId === activeFileId && pending.content === content) return
    const nextBlocks = parseMarkdownToBlocks(content)
    blocksRef.current = nextBlocks
    blocksFileIdRef.current = activeFileId
    setBlocks(nextBlocks)
    setActiveBlockId(null)
  }, [activeFileId, content, setActiveBlockId])

  // Publish from the input event so an immediate save sees the latest buffer.
  const commitBlocks = useCallback((nextBlocks: BlockType[], requiresReparse = false) => {
    const fileId = blocksFileIdRef.current
    if (useEditorStore.getState().activeFileId !== fileId) return
    const nextContent = blocksToMarkdown(nextBlocks)
    const updatedBlocks = updateSourceLines(nextBlocks)
    const previousByLine = requiresReparse
      ? new Map(updatedBlocks.map((block) => [block.sourceLine, block]))
      : null
    const displayBlocks = requiresReparse ? parseMarkdownToBlocks(nextContent).map((block) => {
      const previous = previousByLine?.get(block.sourceLine)
      if (previous && previous.type === block.type && previous.content === block.content &&
        previous.language === block.language && previous.checked === block.checked) return previous
      return { ...block, id: `block-${crypto.randomUUID()}` }
    }) : updatedBlocks
    blocksRef.current = displayBlocks
    setBlocks(displayBlocks)
    pendingInternalUpdateRef.current = { content: nextContent, fileId }
    if (requiresReparse) setActiveBlockId(null)
    if (nextContent !== useEditorStore.getState().content) setContent(nextContent)
  }, [setContent, setActiveBlockId])

  const updateBlock = useCallback((blockId: string, newContent: string) => {
    const previous = blocksRef.current
    const block = previous.find((b) => b.id === blockId)
    if (!block || block.content === newContent) return
    commitBlocks(previous.map((b) => (b.id === blockId ? { ...b, content: newContent } : b)))
  }, [commitBlocks])

  const toggleTask = useCallback((blockId: string) => {
    commitBlocks(
      blocksRef.current.map((b) =>
        b.id === blockId && b.type === "task" ? { ...b, checked: !b.checked } : b
      )
    )
  }, [commitBlocks])

  // Normalize structure on blur/Escape, never while the user is typing.
  const commitBlockStructure = useCallback((blockId: string) => {
    const block = blocksRef.current.find((b) => b.id === blockId)
    if (!block) return
    const parsed = parseMarkdownToBlocks(blocksToMarkdown([block]))
    if (parsed.length !== 1 || parsed[0].type !== block.type || parsed[0].content !== block.content ||
      parsed[0].language !== block.language || parsed[0].checked !== block.checked) {
      commitBlocks(blocksRef.current, true)
    }
  }, [commitBlocks])

  const activateBlock = useCallback((blockId: string) => {
    const previousId = activeBlockIdRef.current
    if (previousId && previousId !== blockId) commitBlockStructure(previousId)
    if (blocksRef.current.some((block) => block.id === blockId)) setActiveBlockId(blockId)
  }, [commitBlockStructure, setActiveBlockId])

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
      const block = blocksRef.current.find((b) => b.id === activeBlockId)
      if (!block) return
      const existingPrefix = blocksToMarkdown([{ ...block, content: "" }]).split("\n")[0]

      let newLine: string

      if (pattern.test(line) || (lineStart === 0 && existingPrefix === prefix)) {
        // Remove prefix
        newLine = line.replace(pattern, "")
      } else {
        // Add prefix - first remove any existing prefixes
        const cleanLine = line
          .replace(/^#{1,6}\s/, "")
          .replace(/^-\s/, "")
          .replace(/^\d+\.\s/, "")
          .replace(/^>\s/, "")
        newLine = prefix + cleanLine
      }

      const newContent = fullText.slice(0, lineStart) + newLine + fullText.slice(actualLineEnd)

      // Parse the formatted source without reapplying the previous block prefix.
      const nextBlocks = [...blocksRef.current]
      const idx = nextBlocks.findIndex((b) => b.id === activeBlockId)
      nextBlocks.splice(idx, 1, ...parseMarkdownToBlocks(newContent).map((block) => ({
        ...block,
        id: `block-${crypto.randomUUID()}`,
      })))
      commitBlocks(nextBlocks, true)
    },
    [activeBlockId, commitBlocks]
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
          {
            const prev = blocksRef.current
            const idx = prev.findIndex((b) => b.id === activeBlockId)
            if (idx === -1) return
            const newBlocks = [...prev]
            newBlocks.splice(idx + 1, 0, {
              id: `block-${crypto.randomUUID()}`,
              sourceLine: prev[idx].sourceLine + 1,
              type: "hr",
              content: "",
            })
            commitBlocks(newBlocks, true)
          }
          break
        case "tasklist":
          formatLine("- [ ] ", /^-\s\[\s\]\s/)
          break
        case "table":
          // Insert table block
          const tableContent = `| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |`
          {
            const prev = blocksRef.current
            const idx = prev.findIndex((b) => b.id === activeBlockId)
            if (idx === -1) return
            const newBlocks = [...prev]
            newBlocks.splice(idx + 1, 0, {
              id: `block-${crypto.randomUUID()}`,
              sourceLine: prev[idx].sourceLine + 1,
              type: "table",
              content: tableContent,
            })
            commitBlocks(newBlocks, true)
          }
          break
      }
    },
    [activeBlockId, wrapSelection, formatLine, commitBlocks]
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
        onMouseDownCapture={(event) => {
          const targetBlock = (event.target as HTMLElement).closest("[data-block-id]")
          // Commit structure from the click handler, after its target is known.
          if (event.button === 0 && activeBlockId && targetBlock &&
            targetBlock.getAttribute("data-block-id") !== activeBlockId) event.preventDefault()
        }}
        onClickCapture={handleRenderedContentClick}
      >
        <div key={activeFileId} className="max-w-3xl mx-auto px-8 py-12 space-y-2">
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
                onUpdate={updateBlock}
                onCommit={commitBlockStructure}
                onToggleTask={block.type === "task" ? toggleTask : undefined}
                onFocus={activateBlock}
                onClick={activateBlock}
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
