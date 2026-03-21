import { useEditorStore } from "@/lib/editor-store"

export function StatusBar() {
  const { wordCount, charCount } = useEditorStore()

  return (
    <footer className="h-6 bg-card border-t border-border flex items-center justify-between px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        <span>Markdown</span>
        <span>UTF-8</span>
      </div>
      <div className="flex items-center gap-4">
        <span>{wordCount} 词</span>
        <span>{charCount} 字符</span>
      </div>
    </footer>
  )
}
