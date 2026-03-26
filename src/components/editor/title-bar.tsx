import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Moon,
  Sun,
  Settings,
  FileEdit,
  Search,
  FileText,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useEditorStore } from "@/lib/editor-store"
import { searchLoadedFiles, type FileSearchResult } from "@/lib/search-utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function renderHighlightedText(text: string, query: string) {
  const trimmedQuery = query.trim()

  if (!trimmedQuery) {
    return text
  }

  const parts = text.split(new RegExp(`(${escapeRegExp(trimmedQuery)})`, "ig"))

  return parts.map((part, index) =>
    part.toLowerCase() === trimmedQuery.toLowerCase() ? (
      <mark key={`${part}-${index}`} className="rounded-sm bg-primary/20 text-foreground">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    )
  )
}

function waitForLayout() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

function jumpToSplitLine(line: number, fileContent: string) {
  const textarea = document.querySelector("[data-editor-textarea]") as HTMLTextAreaElement | null

  if (!textarea) {
    return
  }

  const lines = fileContent.split("\n")
  const safeLine = Math.max(0, Math.min(line, Math.max(0, lines.length - 1)))
  const startOffset = lines.slice(0, safeLine).reduce((total, currentLine) => total + currentLine.length + 1, 0)
  const computedStyle = window.getComputedStyle(textarea)
  const lineHeight = Number.parseFloat(computedStyle.lineHeight) || Number.parseFloat(computedStyle.fontSize) * 1.5 || 24

  textarea.focus()
  textarea.setSelectionRange(startOffset, startOffset)
  textarea.scrollTo({
    top: Math.max(0, safeLine * lineHeight - textarea.clientHeight / 2 + lineHeight / 2),
    behavior: "smooth",
  })
}

function jumpToWysiwygLine(line: number) {
  const sourceBlocks = Array.from(document.querySelectorAll("[data-source-line]")) as HTMLElement[]

  if (sourceBlocks.length === 0) {
    return
  }

  const targetBlock = sourceBlocks.reduce<HTMLElement | null>((closest, block) => {
    const sourceLine = Number.parseInt(block.dataset.sourceLine || "-1", 10)

    if (Number.isNaN(sourceLine) || sourceLine > line) {
      return closest
    }

    if (!closest) {
      return block
    }

    const closestLine = Number.parseInt(closest.dataset.sourceLine || "-1", 10)
    return sourceLine >= closestLine ? block : closest
  }, null)

  const block = targetBlock || sourceBlocks[0]

  block.scrollIntoView({ behavior: "smooth", block: "center" })

  const editable = block.querySelector("[contenteditable]") as HTMLElement | null
  editable?.focus()
}

export function TitleBar() {
  const {
    files,
    activeFileId,
    isSidebarOpen,
    isOutlineOpen,
    isSearchOpen,
    theme,
    editMode,
    openSearch,
    closeSearch,
    toggleSidebar,
    toggleOutline,
    toggleTheme,
    toggleEditMode,
    setActiveFile,
    findNodeById,
    content,
  } = useEditorStore()

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const activeFile = activeFileId ? findNodeById(activeFileId) : null
  const searchResults = useMemo(
    () => searchLoadedFiles(files, searchQuery, activeFileId),
    [files, searchQuery, activeFileId]
  )

  useEffect(() => {
    setSelectedIndex(0)
  }, [isSearchOpen, searchQuery])

  const displayLabel = activeFile?.filePath || activeFile?.name || "RadishMD"

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        openSearch()
        return
      }

      closeSearch()
    },
    [closeSearch, openSearch]
  )

  const handleResultSelect = useCallback(
    async (result: FileSearchResult) => {
      await setActiveFile(result.fileId)
      await waitForLayout()

      const nextContent = useEditorStore.getState().content || content

      if (editMode === "split") {
        jumpToSplitLine(result.line, nextContent)
      } else {
        jumpToWysiwygLine(result.line)
      }

      closeSearch()
    },
    [closeSearch, content, editMode, setActiveFile]
  )

  const clearAndCloseSearch = useCallback(() => {
    setSearchQuery("")
    setSelectedIndex(0)
    closeSearch()
  }, [closeSearch])

  const handleSearchInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.ctrlKey && event.key === "/") {
        event.preventDefault()
        event.stopPropagation()
        clearAndCloseSearch()
        return
      }

      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        clearAndCloseSearch()
        return
      }

      if (searchResults.length === 0) {
        return
      }

      if (event.key === "ArrowDown") {
        event.preventDefault()
        setSelectedIndex((current) => (current + 1) % searchResults.length)
        return
      }

      if (event.key === "ArrowUp") {
        event.preventDefault()
        setSelectedIndex((current) => (current - 1 + searchResults.length) % searchResults.length)
        return
      }

      if (event.key === "Enter") {
        event.preventDefault()
        const selectedResult = searchResults[selectedIndex] || searchResults[0]
        if (selectedResult) {
          void handleResultSelect(selectedResult)
        }
      }
    },
    [clearAndCloseSearch, handleResultSelect, searchResults, selectedIndex]
  )

  const shellWidth = isSearchOpen
    ? "min(56rem, calc(100vw - 1.5rem))"
    : "min(34rem, calc(100vw - 20rem))"

  return (
    <header className="h-10 bg-card border-b border-border flex items-center justify-between px-2 overflow-visible">
      {/* Left Controls */}
      <div className="flex items-center gap-1">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={toggleSidebar}
              >
                {isSidebarOpen ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeftOpen className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {isSidebarOpen ? "隐藏侧边栏" : "显示侧边栏"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Center - Search */}
      <div className="relative flex flex-1 justify-center px-2 overflow-visible">
        <Popover open={isSearchOpen} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "h-8 justify-start gap-2 overflow-hidden rounded-lg border border-border/80 bg-muted/40 px-3 text-left text-sm font-medium text-foreground shadow-sm transition-all duration-200 hover:bg-muted/60",
                isSearchOpen && "rounded-b-none border-b-0 bg-card shadow-md"
              )}
              style={{ width: shellWidth, maxWidth: "100%" }}
            >
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/90">
                {displayLabel}
              </span>
              <span className="ml-auto flex items-center gap-1 text-muted-foreground">
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>/</Kbd>
                </KbdGroup>
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="center"
            side="bottom"
            sideOffset={0}
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              searchInputRef.current?.focus()
            }}
            className="w-[min(56rem,calc(100vw-1.5rem))] border-0 bg-transparent p-0 shadow-none"
          >
            <div className="overflow-hidden rounded-xl border border-border/80 bg-card/95 shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  autoFocus
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={handleSearchInputKeyDown}
                  placeholder="搜索已加载的文件"
                  className="h-9 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                />
                <KbdGroup className="ml-auto shrink-0">
                  <Kbd>Ctrl</Kbd>
                  <Kbd>/</Kbd>
                </KbdGroup>
              </div>

              <ScrollArea className="max-h-72">
                <div className="p-2">
                  {searchQuery.trim() === "" ? (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      输入关键词，搜索当前已加载的文件
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      没有找到匹配内容
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {searchResults.map((result, index) => (
                        <button
                          key={result.fileId}
                          type="button"
                          onClick={() => handleResultSelect(result)}
                          onMouseEnter={() => setSelectedIndex(index)}
                          className={cn(
                            "w-full rounded-lg border border-transparent px-3 py-2 text-left transition-colors",
                            "hover:border-border/70 hover:bg-accent/30",
                            result.isActive && "border-border bg-accent/40",
                            index === selectedIndex && "border-border bg-accent/30"
                          )}
                        >
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <FileText className="h-4 w-4 shrink-0 text-primary" />
                            <span className="truncate">{renderHighlightedText(result.fileName, searchQuery)}</span>
                            <span className="ml-auto text-xs text-muted-foreground">L{result.line + 1}</span>
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {renderHighlightedText(result.filePath || result.fileName, searchQuery)}
                          </div>
                          <div className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground/90">
                            {renderHighlightedText(result.content, searchQuery)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={toggleTheme}
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {theme === "dark" ? "浅色主题" : "深色主题"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={toggleOutline}
              >
                {isOutlineOpen ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {isOutlineOpen ? "隐藏大纲" : "显示大纲"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={toggleEditMode}
              >
                <FileEdit className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {editMode === "split" ? "切换到 WYSIWYG 模式" : "切换到分屏模式"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              设置
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </header>
  )
}
