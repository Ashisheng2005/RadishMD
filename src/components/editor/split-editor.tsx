import { useEffect, useRef } from "react"
import { useEditorStore } from "@/lib/editor-store"
import { MarkdownRenderer } from "./markdown-renderer"
import { Toolbar } from "./toolbar"
import { cn } from "@/lib/utils"

export function SplitEditor() {
  const { content, setContent } = useEditorStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // Initialize word count
    useEditorStore.getState().updateCounts(content)
  }, [content])

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Toolbar />
      <div className="flex-1 flex overflow-hidden">
        {/* Editor Panel */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
          <div className="px-3 py-1.5 border-b border-border bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground">编辑</span>
          </div>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
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

        {/* Preview Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground">预览</span>
          </div>
          <div className="flex-1 overflow-y-auto p-6 bg-background">
            <MarkdownRenderer content={content} />
          </div>
        </div>
      </div>
    </div>
  )
}
