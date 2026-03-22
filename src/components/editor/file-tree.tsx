import { useState, useEffect, useRef } from "react"
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { FileNode, useEditorStore } from "@/lib/editor-store"
import { Input } from "@/components/ui/input"

function InlineCreateInput({
  type,
  depth,
  onConfirm,
  onCancel,
}: {
  type: "file" | "folder"
  depth: number
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState("")
  const [hasFocused, setHasFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.scrollIntoView({ block: "center" })
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      onConfirm(value)
    } else if (e.key === "Escape") {
      e.preventDefault()
      onCancel()
    }
  }

  const handleBlur = () => {
    if (!hasFocused) return
    if (value.trim()) {
      onConfirm(value)
    } else {
      onCancel()
    }
  }

  const handleFocus = () => {
    setHasFocused(true)
  }

  const paddingLeft = depth * 12 + (type === "folder" ? 8 : 24)

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1"
      style={{ paddingLeft: `${paddingLeft}px` }}
    >
      {type === "folder" ? (
        <Folder className="h-4 w-4 shrink-0 text-primary" />
      ) : (
        <File className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={handleFocus}
        placeholder={type === "folder" ? "文件夹名称" : "文件名称"}
        className="h-6 text-sm py-0 px-1"
      />
    </div>
  )
}

function FileTreeItem({
  node,
  depth = 0,
}: {
  node: FileNode
  depth?: number
}) {
  const { activeFileId, setActiveFile, toggleFolder, moveNode } = useEditorStore()
  const [isDragOver, setIsDragOver] = useState(false)
  const isActive = node.id === activeFileId

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", node.id)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const nodeId = e.dataTransfer.getData("text/plain")
    if (nodeId && node.type === "folder" && nodeId !== node.id) {
      moveNode(nodeId, node.id)
    }
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const { clientX, clientY } = e
    // If mouse coordinates are still within the element, we're entering a child
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return
    }
    setIsDragOver(false)
  }

  if (node.type === "folder") {
    return (
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = "move"
        }}
        onDrop={handleDrop}
      >
        <button
          onClick={() => toggleFolder(node.id)}
          className={cn(
            "w-full flex items-center gap-1.5 px-2 py-1 text-sm rounded-sm",
            "hover:bg-sidebar-accent transition-colors text-sidebar-foreground",
            isDragOver && "bg-sidebar-accent ring-1 ring-primary/50"
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
      draggable
      onDragStart={handleDragStart}
      onClick={() => setActiveFile(node.id)}
      className={cn(
        "w-full flex items-center gap-1.5 px-2 py-1 text-sm rounded-sm",
        "hover:bg-sidebar-accent transition-colors cursor-grab active:cursor-grabbing",
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
  const { files, creatingType, confirmCreate, cancelCreate } = useEditorStore()

  return (
    <div className="py-2">
      {creatingType && (
        <InlineCreateInput
          type={creatingType}
          depth={0}
          onConfirm={confirmCreate}
          onCancel={cancelCreate}
        />
      )}
      {files.map((node) => (
        <FileTreeItem key={node.id} node={node} />
      ))}
    </div>
  )
}
