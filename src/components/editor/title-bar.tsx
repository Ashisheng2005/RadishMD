import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Moon,
  Sun,
  Monitor,
  SlidersHorizontal,
  FileEdit,
  Search,
  FileText,
} from "lucide-react"
import { useCallback, useDeferredValue, useEffect, useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useEditorStore } from "@/lib/editor-store"
import { type FileSearchResult, buildSearchCorpus } from "@/lib/search-utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"

interface TitleBarProps {
  checkingForUpdate: boolean
  latestVersion: string | null
  updateCheckState: "idle" | "checking" | "up-to-date" | "update-available"
  onCheckForUpdates: () => void
}

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

export function TitleBar({
  checkingForUpdate,
  latestVersion,
  updateCheckState,
  onCheckForUpdates,
}: TitleBarProps) {
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
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [searchResults, setSearchResults] = useState<FileSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSearchPending, startSearchTransition] = useTransition()
  const [isSearchWorkerReady, setIsSearchWorkerReady] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchWorkerRef = useRef<Worker | null>(null)
  const searchRequestIdRef = useRef(0)
  const searchTimeoutRef = useRef<number | null>(null)
  const searchDebounceRef = useRef<number | null>(null)
  const selectedItemRef = useRef<HTMLButtonElement | null>(null)

  const activeFile = activeFileId ? findNodeById(activeFileId) : null

  const runSearch = useCallback(
    (query: string) => {
      const normalizedQuery = query.trim()

      if (!normalizedQuery) {
        setIsSearching(false)
        if (searchDebounceRef.current !== null) {
          window.clearTimeout(searchDebounceRef.current)
          searchDebounceRef.current = null
        }
        if (searchTimeoutRef.current !== null) {
          window.clearTimeout(searchTimeoutRef.current)
          searchTimeoutRef.current = null
        }
        startSearchTransition(() => {
          setSearchResults([])
        })
        setSelectedIndex(0)
        return
      }

      const worker = searchWorkerRef.current

      if (!worker || !isSearchWorkerReady) {
        setIsSearching(true)
        return
      }

      // Clear previous timeout
      if (searchTimeoutRef.current !== null) {
        window.clearTimeout(searchTimeoutRef.current)
      }

      const requestId = searchRequestIdRef.current + 1
      searchRequestIdRef.current = requestId
      setIsSearching(true)

      // Set timeout as fallback
      searchTimeoutRef.current = window.setTimeout(() => {
        if (searchRequestIdRef.current === requestId) {
          setIsSearching(false)
        }
      }, 2000)

      worker.postMessage({
        type: "search",
        requestId,
        query: normalizedQuery,
        activeFileId,
      })
    },
    [activeFileId, isSearchWorkerReady, startSearchTransition]
  )

  const sendFilesToWorker = useCallback(() => {
    const worker = searchWorkerRef.current
    if (!worker || !isSearchWorkerReady) {
      return
    }
    const searchCorpus = buildSearchCorpus(files)
    worker.postMessage({
      type: "set-files",
      files: searchCorpus,
    })
    runSearch(deferredSearchQuery)
  }, [files, isSearchWorkerReady, runSearch, deferredSearchQuery])

  useEffect(() => {
    setSelectedIndex(0)
  }, [isSearchOpen, searchQuery])

  useEffect(() => {
    if (!isSearchOpen) {
      return
    }

    if (typeof Worker === "undefined") {
      return
    }

    const worker = new Worker(new URL("@/workers/search-worker.ts", import.meta.url), {
      type: "module",
    })

    searchWorkerRef.current = worker

    worker.onmessage = (event: MessageEvent<{ type: string; requestId?: number; results?: FileSearchResult[] }>) => {
      const message = event.data

      if (message.type === "ready") {
        setIsSearchWorkerReady(true)
        return
      }

      if (message.type === "results" && typeof message.requestId === "number") {
        if (message.requestId !== searchRequestIdRef.current) {
          return
        }

        // Clear timeout on successful response
        if (searchTimeoutRef.current !== null) {
          window.clearTimeout(searchTimeoutRef.current)
          searchTimeoutRef.current = null
        }

        startSearchTransition(() => {
          setSearchResults(message.results || [])
          setIsSearching(false)
        })
      }
    }

    worker.onerror = (error) => {
      console.error("[RadishMD][search] worker error", error)
    }

    return () => {
      searchWorkerRef.current = null
      setIsSearchWorkerReady(false)
      setIsSearching(false)
      if (searchTimeoutRef.current !== null) {
        window.clearTimeout(searchTimeoutRef.current)
        searchTimeoutRef.current = null
      }
      worker.terminate()
    }
  }, [isSearchOpen])

  useEffect(() => {
    sendFilesToWorker()
  }, [sendFilesToWorker])

  useEffect(() => {
    if (!isSearchWorkerReady) {
      return
    }

    // Debounce search to avoid running on every keystroke
    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current)
    }
    searchDebounceRef.current = window.setTimeout(() => {
      searchDebounceRef.current = null
      runSearch(deferredSearchQuery)
    }, 150)
  }, [activeFileId, deferredSearchQuery, isSearchWorkerReady, runSearch])

  // Scroll selected item into view when selection changes
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
  }, [selectedIndex])

  const displayLabel = activeFile?.filePath || activeFile?.name || "RadishMD"
  const updateStatusText =
    updateCheckState === "checking"
      ? "检查中"
      : updateCheckState === "update-available"
        ? `发现新版本 ${latestVersion ?? ""}`.trim()
        : updateCheckState === "up-to-date"
          ? "当前已是最新版本"
          : "检查更新"

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
    setIsSearching(false)
    startSearchTransition(() => {
      setSearchResults([])
    })
    closeSearch()
  }, [closeSearch, startSearchTransition])

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

      if (event.key === "ArrowDown" || event.key === "Tab") {
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

        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={toggleTheme}
              >
                {theme === "system" ? (
                  <Monitor className="h-4 w-4" />
                ) : theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {theme === "system"
                ? "自动主题（跟随系统）"
                : theme === "dark"
                  ? "浅色主题"
                  : "深色主题"}
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
            <div className="rounded-xl border border-border/80 bg-card/95 shadow-2xl backdrop-blur-md">
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

              <div className="max-h-72 overflow-y-auto">
                <div className="p-2">
                  {searchQuery.trim() === "" ? (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      输入关键词，搜索当前已加载的文件
                    </div>
                  ) : isSearching || isSearchPending ? (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      正在搜索...
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      没有找到匹配内容
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {searchResults.map((result, index) => (
                        <button
                          key={`${result.fileId}-${result.line}`}
                          ref={index === selectedIndex ? selectedItemRef : null}
                          type="button"
                          onClick={() => handleResultSelect(result)}
                          className={cn(
                            "w-full rounded-lg border border-transparent px-3 py-2 text-left transition-colors",
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
              </div>
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

        <Popover open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <SlidersHorizontal className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                设置
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <PopoverContent align="end" side="bottom" sideOffset={8} className="w-72 p-0">
            <div className="space-y-4 p-4">
              <div>
                <div className="text-sm font-medium text-foreground">设置</div>
                <div className="mt-1 text-xs text-muted-foreground">更新检查、版本信息和应用偏好都放在这里。</div>
              </div>

              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">版本状态</div>
                <div className="mt-1 text-sm font-medium text-foreground">
                  {updateStatusText}
                </div>
              </div>

              <Button
                type="button"
                className={cn(
                  "w-full justify-start transition-all",
                  checkingForUpdate && "border-primary/40 bg-primary/10 text-primary shadow-sm"
                )}
                onClick={() => {
                  onCheckForUpdates()
                }}
                disabled={checkingForUpdate}
                aria-busy={checkingForUpdate}
                aria-live="polite"
              >
                <span className="inline-flex items-center gap-1">
                  <span>{updateStatusText}</span>
                  {checkingForUpdate && (
                    <span className="inline-flex items-center gap-0.5 text-primary" aria-hidden="true">
                      <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" />
                    </span>
                  )}
                </span>
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  )
}
