import { useEditorStore } from "@/lib/editor-store"
import { Button } from "@/components/ui/button"
import { Columns2, Eye, FileEdit } from "lucide-react"

export function StatusBar() {
  const {
    wordCount,
    charCount,
    editMode,
    splitViewMode,
    tabSize,
    cycleTabSize,
    setSplitViewMode,
    activeFileId,
    findNodeById,
    saveFileById,
    reloadFileFromDiskById,
  } = useEditorStore()

  const activeFile = activeFileId ? findNodeById(activeFileId) : null

  const splitViewLabel =
    splitViewMode === "editor"
      ? "编辑独显"
      : splitViewMode === "render"
        ? "渲染独显"
        : "分屏"

  const splitViewIcon =
    splitViewMode === "editor"
      ? FileEdit
      : splitViewMode === "render"
        ? Eye
        : Columns2

  const splitViewTitle =
    splitViewMode === "editor"
      ? "编辑独显"
      : splitViewMode === "render"
        ? "渲染独显"
        : "分屏"

  const cycleSplitViewMode = () => {
    if (splitViewMode === "split") {
      setSplitViewMode("editor")
      return
    }

    if (splitViewMode === "editor") {
      setSplitViewMode("render")
      return
    }

    setSplitViewMode("split")
  }

  const handleReloadExternalChanges = async () => {
    if (!activeFile || !activeFile.hasExternalChanges) {
      return
    }

    await reloadFileFromDiskById(activeFile.id)
  }

  const handleOverwriteExternalChanges = async () => {
    if (!activeFile || !activeFile.hasExternalChanges) {
      return
    }

    await saveFileById(activeFile.id)
  }

  return (
    <footer className="h-8 bg-card border-t border-border flex items-center justify-between gap-3 px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-3 min-w-0">
        <span>Markdown</span>
        <span>UTF-8</span>
        <span className="hidden sm:inline">当前：{editMode === "split" ? splitViewLabel : "WYSIWYG"}</span>
      </div>
      <div className="flex items-center gap-3">
        {activeFile?.hasExternalChanges && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-amber-600 hover:text-amber-500"
              onClick={() => void handleReloadExternalChanges()}
            >
              重载
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-amber-600 hover:text-amber-500"
              onClick={() => void handleOverwriteExternalChanges()}
            >
              覆盖
            </Button>
          </div>
        )}
        {editMode === "split" && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={splitViewTitle}
            title={splitViewTitle}
            aria-pressed="true"
            onClick={cycleSplitViewMode}
          >
            {(() => {
              const Icon = splitViewIcon
              return <Icon className="h-4 w-4" />
            })()}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-muted-foreground"
          onClick={cycleTabSize}
          aria-label={`Tab ${tabSize}`}
          title={`Tab ${tabSize}`}
        >
          Tab{tabSize}
        </Button>
        <span>{wordCount} 词</span>
        <span>{charCount} 字符</span>
      </div>
    </footer>
  )
}
