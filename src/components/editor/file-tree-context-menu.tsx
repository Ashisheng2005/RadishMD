import { useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
  X,
  Copy,
  FolderOpen,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react"
import { FileNode, useEditorStore } from "@/lib/editor-store"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { isTauriRuntime } from "@/lib/runtime"

function countFilesInNode(node: FileNode): number {
  if (node.type === "file") return 1
  let count = 0
  if (node.children) {
    for (const child of node.children) {
      count += countFilesInNode(child)
    }
  }
  return count
}

function expandAllInNodes(nodes: FileNode[], targetId: string): FileNode[] {
  return nodes.map((node) => {
    if (node.id === targetId && node.type === "folder") {
      return {
        ...node,
        isExpanded: true,
        children: node.children?.map((child) =>
          child.type === "folder"
            ? expandAllRecursive(child)
            : child,
        ),
      }
    }
    if (node.children) {
      return { ...node, children: expandAllInNodes(node.children, targetId) }
    }
    return node
  })
}

function expandAllRecursive(node: FileNode): FileNode {
  if (node.type !== "folder") return node
  return {
    ...node,
    isExpanded: true,
    children: node.children?.map((child) =>
      child.type === "folder" ? expandAllRecursive(child) : child,
    ),
  }
}

function collapseAllInNodes(nodes: FileNode[], targetId: string): FileNode[] {
  return nodes.map((node) => {
    if (node.id === targetId && node.type === "folder") {
      return {
        ...node,
        isExpanded: false,
        children: node.children?.map((child) =>
          child.type === "folder"
            ? collapseAllRecursive(child)
            : child,
        ),
      }
    }
    if (node.children) {
      return { ...node, children: collapseAllInNodes(node.children, targetId) }
    }
    return node
  })
}

function collapseAllRecursive(node: FileNode): FileNode {
  if (node.type !== "folder") return node
  return {
    ...node,
    isExpanded: false,
    children: node.children?.map((child) =>
      child.type === "folder" ? collapseAllRecursive(child) : child,
    ),
  }
}

interface FileTreeContextMenuProps {
  node: FileNode
  children: React.ReactNode
}

export function FileTreeContextMenu({ node, children }: FileTreeContextMenuProps) {
  const {
    startCreating,
    startRenaming,
    deleteNode,
    removeNode,
  } = useEditorStore()

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const handleCopyPath = () => {
    if (node.filePath) {
      navigator.clipboard.writeText(node.filePath)
      toast.success("已复制路径", {
        style: { backgroundColor: "#22c55e", color: "#fff" },
      })
    }
  }

  const handleRevealInExplorer = async () => {
    if (!node.filePath || !isTauriRuntime()) return
    try {
      await invoke("reveal_in_explorer", { path: node.filePath })
    } catch (e) {
      toast.error(`打开失败: ${e instanceof Error ? e.message : String(e)}`, {
        style: { backgroundColor: "#ef4444", color: "#fff" },
      })
    }
  }

  const handleExpandAll = () => {
    useEditorStore.setState((state) => ({
      files: expandAllInNodes(state.files, node.id),
    }))
  }

  const handleCollapseAll = () => {
    useEditorStore.setState((state) => ({
      files: collapseAllInNodes(state.files, node.id),
    }))
  }

  const handleDelete = () => {
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    void deleteNode(node.id)
    setDeleteDialogOpen(false)
  }

  const fileCount = node.type === "folder" ? countFilesInNode(node) : 0

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          {node.type === "folder" && (
            <>
              <ContextMenuItem onClick={() => startCreating("file", node.id)}>
                <FilePlus className="mr-2 h-4 w-4" />
                新建文件
              </ContextMenuItem>
              <ContextMenuItem onClick={() => startCreating("folder", node.id)}>
                <FolderPlus className="mr-2 h-4 w-4" />
                新建文件夹
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={handleExpandAll}>
                <ChevronsUpDown className="mr-2 h-4 w-4" />
                展开全部
              </ContextMenuItem>
              <ContextMenuItem onClick={handleCollapseAll}>
                <ChevronsDownUp className="mr-2 h-4 w-4" />
                收起全部
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem onClick={() => startRenaming(node.id)}>
            <Pencil className="mr-2 h-4 w-4" />
            重命名
          </ContextMenuItem>
          <ContextMenuItem onClick={() => removeNode(node.id)}>
            <X className="mr-2 h-4 w-4" />
            从列表中移除
          </ContextMenuItem>
          {node.filePath && (
            <ContextMenuItem
              onClick={handleDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              删除
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          {node.filePath && (
            <>
              <ContextMenuItem onClick={handleCopyPath}>
                <Copy className="mr-2 h-4 w-4" />
                复制路径
              </ContextMenuItem>
              {isTauriRuntime() && (
                <ContextMenuItem onClick={handleRevealInExplorer}>
                  <FolderOpen className="mr-2 h-4 w-4" />
                  在资源管理器中显示
                </ContextMenuItem>
              )}
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              {node.type === "folder"
                ? `确定要删除文件夹「${node.name}」及其中的 ${fileCount} 个文件吗？此操作不可撤销。`
                : `确定要删除文件「${node.name}」吗？此操作不可撤销。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
