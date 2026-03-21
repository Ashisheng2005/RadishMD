import { ChevronRight, File, Folder, FolderOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { FileNode, useEditorStore } from "@/lib/editor-store"

function FileTreeItem({
  node,
  depth = 0,
}: {
  node: FileNode
  depth?: number
}) {
  const { activeFileId, setActiveFile, toggleFolder } = useEditorStore()
  const isActive = node.id === activeFileId

  if (node.type === "folder") {
    return (
      <div>
        <button
          onClick={() => toggleFolder(node.id)}
          className={cn(
            "w-full flex items-center gap-1.5 px-2 py-1 text-sm rounded-sm",
            "hover:bg-sidebar-accent transition-colors text-sidebar-foreground"
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              node.isExpanded && "rotate-90"
            )}
          />
          {node.isExpanded ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-primary" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {node.isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeItem key={child.id} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => setActiveFile(node.id)}
      className={cn(
        "w-full flex items-center gap-1.5 px-2 py-1 text-sm rounded-sm",
        "hover:bg-sidebar-accent transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-foreground font-medium"
          : "text-sidebar-foreground/80"
      )}
      style={{ paddingLeft: `${depth * 12 + 24}px` }}
    >
      <File className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{node.name}</span>
    </button>
  )
}

export function FileTree() {
  const { files } = useEditorStore()

  return (
    <div className="py-2">
      {files.map((node) => (
        <FileTreeItem key={node.id} node={node} />
      ))}
    </div>
  )
}
