import { useEditorStore } from "@/lib/editor-store"
import { Button } from "@/components/ui/button"
import { Columns2, Eye, FileEdit } from "lucide-react"

export function StatusBar() {
  const { wordCount, charCount, editMode, splitViewMode, setSplitViewMode } = useEditorStore()

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

  return (
    <footer className="h-8 bg-card border-t border-border flex items-center justify-between gap-3 px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-3 min-w-0">
        <span>Markdown</span>
        <span>UTF-8</span>
        <span className="hidden sm:inline">当前：{editMode === "split" ? splitViewLabel : "WYSIWYG"}</span>
      </div>
      <div className="flex items-center gap-3">
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
        <span>{wordCount} 词</span>
        <span>{charCount} 字符</span>
      </div>
    </footer>
  )
}
