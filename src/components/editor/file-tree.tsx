import { useState, useEffect, useRef } from "react"
import { ChevronRight, File, Folder, FolderOpen, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { FileNode, useEditorStore } from "@/lib/editor-store"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { FileTreeContextMenu } from "./file-tree-context-menu"
import { loadFolderChildren } from "@/lib/file-operations"

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

function InlineRenameInput({
  node,
  depth,
  onConfirm,
  onCancel,
}: {
  node: FileNode
  depth: number
  onConfirm: (newName: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(node.name)
  const [hasFocused, setHasFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 50)
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
    if (value.trim() && value.trim() !== node.name) {
      onConfirm(value)
    } else {
      onCancel()
    }
  }

  const handleFocus = () => {
    setHasFocused(true)
  }

  const paddingLeft = node.type === "folder"
    ? depth * 12 + 8
    : depth * 12 + 24

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1"
      style={{ paddingLeft: `${paddingLeft}px` }}
    >
      {node.type === "folder" ? (
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
  const {
    activeFileId,
    setActiveFile,
    toggleFolder,
    moveNode,
    saveFileById,
    renamingNodeId,
    confirmRename,
    cancelRename,
    creatingType,
    creatingParentId,
    confirmCreate,
    cancelCreate,
  } = useEditorStore()
  const [isDragOver, setIsDragOver] = useState(false)
  const isActive = node.id === activeFileId
  const isRenaming = renamingNodeId === node.id
  const isCreatingHere = creatingParentId === node.id && creatingType !== null

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

  const handleFolderClick = () => {
    const shouldLoad = !node.isExpanded
    toggleFolder(node.id)

    if (shouldLoad) {
      void loadFolderChildren(node.id)
    }
  }

  // If this node is being renamed, show inline input
  if (isRenaming) {
    return (
      <InlineRenameInput
        node={node}
        depth={depth}
        onConfirm={(newName) => void confirmRename(node.id, newName)}
        onCancel={cancelRename}
      />
    )
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
        <FileTreeContextMenu node={node}>
          <button
            onClick={handleFolderClick}
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
            {node.isLoading ? (
              <Loader2 className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
            ) : null}
          </button>
        </FileTreeContextMenu>
        {node.isExpanded && (
          <div>
            {/* Inline create inside this folder */}
            {isCreatingHere && creatingType && (
              <InlineCreateInput
                type={creatingType}
                depth={depth + 1}
                onConfirm={confirmCreate}
                onCancel={cancelCreate}
              />
            )}
            {node.children?.map((child) => (
              <FileTreeItem key={child.id} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <FileTreeContextMenu node={node}>
      <div className="relative">
        <button
          draggable
          onDragStart={handleDragStart}
          onClick={() => setActiveFile(node.id)}
          className={cn(
            "w-full flex items-center gap-1.5 px-2 py-1 pr-8 text-sm rounded-sm",
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
        {(node.isDirty || node.isNew) ? (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    void saveFileById(node.id)
                  }}
                  className={cn(
                    "absolute right-2 top-1/2 -translate-y-1/2",
                    "flex h-5 w-5 items-center justify-center rounded-full",
                    node.isDirty
                      ? "text-amber-200 hover:bg-amber-400/15 hover:text-amber-400"
                      : "text-blue-200 hover:bg-blue-400/15 hover:text-blue-400",
                    "transition-colors"
                  )}
                  aria-label={node.isNew ? "新文件，点击保存" : "点击保存"}
                >
                  <span className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    node.isDirty ? "bg-amber-300/70" : "bg-blue-400/70"
                  )} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <p>{node.isNew ? "新文件，点击保存" : "点击保存"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
    </FileTreeContextMenu>
  )
}

export function FileTree() {
  const { files, creatingType, creatingParentId, confirmCreate, cancelCreate } = useEditorStore()

  return (
    <div className="py-2">
      {/* Root-level create input (when no parent specified) */}
      {creatingType && !creatingParentId && (
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
