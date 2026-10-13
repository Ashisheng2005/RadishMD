import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useEditorStore } from "@/lib/editor-store"
import { CloseConfirmDialog } from "./close-confirm-dialog"

const VISIBLE_TAB_COUNT = 5

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(target.closest("textarea, input, select, [contenteditable='true']"))
}

export function EditorTabs() {
  const openFileIds = useEditorStore((state) => state.openFileIds)
  const activeFileId = useEditorStore((state) => state.activeFileId)
  const findNodeById = useEditorStore((state) => state.findNodeById)
  const setActiveFile = useEditorStore((state) => state.setActiveFile)
  const closeOpenFile = useEditorStore((state) => state.closeOpenFile)
  const saveFileById = useEditorStore((state) => state.saveFileById)
  const [windowStart, setWindowStart] = useState(0)
  const [trackedActiveId, setTrackedActiveId] = useState(activeFileId)
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null)

  const maxStart = Math.max(0, openFileIds.length - VISIBLE_TAB_COUNT)
  const canPage = openFileIds.length > VISIBLE_TAB_COUNT
  const activeIndex = activeFileId ? openFileIds.indexOf(activeFileId) : -1
  const activeMoved = trackedActiveId !== activeFileId
  let nextWindowStart = Math.min(windowStart, maxStart)
  if (activeMoved && activeIndex >= 0) {
    if (activeIndex < nextWindowStart) {
      nextWindowStart = activeIndex
    } else if (activeIndex >= nextWindowStart + VISIBLE_TAB_COUNT) {
      nextWindowStart = Math.min(activeIndex - VISIBLE_TAB_COUNT + 1, maxStart)
    }
  }
  if (activeMoved || nextWindowStart !== windowStart) {
    if (activeMoved) {
      setTrackedActiveId(activeFileId)
    }
    if (nextWindowStart !== windowStart) {
      setWindowStart(nextWindowStart)
    }
  }

  const visibleIds = openFileIds.slice(windowStart, windowStart + VISIBLE_TAB_COUNT)
  const pendingFile = pendingCloseId ? findNodeById(pendingCloseId) : null

  const pageTabs = useCallback((delta: number) => {
    setWindowStart((start) => Math.min(maxStart, Math.max(0, start + delta)))
  }, [maxStart])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
        return
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return
      }
      if (!canPage || isEditableTarget(event.target) || document.querySelector("[role='dialog']")) {
        return
      }

      event.preventDefault()
      pageTabs(event.key === "ArrowLeft" ? -1 : 1)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [canPage, pageTabs])

  const requestClose = (id: string) => {
    const file = findNodeById(id)
    if (file?.type === "file" && (file.isDirty || file.isNew)) {
      setPendingCloseId(id)
      return
    }

    closeOpenFile(id)
  }

  const handleSaveAndClose = async () => {
    if (!pendingCloseId) {
      return
    }

    const saved = await saveFileById(pendingCloseId)
    if (!saved) {
      return
    }

    closeOpenFile(pendingCloseId)
    setPendingCloseId(null)
  }

  return (
    <div className="flex min-w-0 flex-1 items-center justify-start gap-1 overflow-hidden" aria-label="已打开的文件">
      {canPage && (
        <Button
          type="button"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground"
          disabled={windowStart === 0}
          aria-label="显示前面的标签"
          title="显示前面的标签 (Ctrl+←)"
          onClick={() => pageTabs(-1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
      )}
      <div className="flex min-w-0 shrink items-center justify-start gap-1 overflow-hidden" role="tablist">
        {visibleIds.map((id) => {
          const file = findNodeById(id)
          if (!file || file.type !== "file") {
            return null
          }

          const active = id === activeFileId
          const dirty = Boolean(file.isDirty || file.isNew)
          return (
            <div
              key={id}
              role="tab"
              aria-selected={active}
              title={file.filePath || file.name}
              className={cn(
                "group flex h-6 w-28 min-w-0 shrink cursor-pointer items-center gap-1 rounded-md px-1.5 text-xs",
                active
                  ? "bg-primary font-medium text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
              )}
              onClick={() => {
                if (id !== activeFileId) {
                  void setActiveFile(id)
                }
              }}
              onMouseDown={(event) => {
                if (event.button === 1) {
                  event.preventDefault()
                }
              }}
              onAuxClick={(event) => {
                if (event.button !== 1) {
                  return
                }
                event.preventDefault()
                requestClose(id)
              }}
            >
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                <button
                  type="button"
                  className={cn(
                    "hidden h-4 w-4 items-center justify-center rounded-sm hover:bg-foreground/10",
                    active
                      ? "text-primary-foreground/80 hover:bg-primary-foreground/15 hover:text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                    "group-hover:inline-flex",
                    active && "inline-flex",
                  )}
                  aria-label={`关闭 ${file.name}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    requestClose(id)
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
                {dirty && (
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full group-hover:hidden",
                      active && "hidden",
                      file.isDirty ? "bg-amber-300/70" : "bg-blue-400/70",
                    )}
                    aria-hidden="true"
                  />
                )}
              </span>
            </div>
          )
        })}
      </div>
      {canPage && (
        <Button
          type="button"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground"
          disabled={windowStart >= maxStart}
          aria-label="显示后面的标签"
          title="显示后面的标签 (Ctrl+→)"
          onClick={() => pageTabs(1)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      )}
      <CloseConfirmDialog
        open={Boolean(pendingFile)}
        unsavedFiles={pendingFile ? [{ id: pendingFile.id, name: pendingFile.name }] : []}
        onSaveAndClose={() => void handleSaveAndClose()}
        onDiscard={() => {
          if (pendingCloseId) {
            closeOpenFile(pendingCloseId)
          }
          setPendingCloseId(null)
        }}
        onCancel={() => setPendingCloseId(null)}
      />
    </div>
  )
}
