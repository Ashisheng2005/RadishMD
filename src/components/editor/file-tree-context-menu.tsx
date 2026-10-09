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
  RefreshCw,
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
import { loadFolderChildren, refreshFolder } from "@/lib/file-operations"

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
    getUnsavedFilesUnderNode,
    saveFileById,
  } = useEditorStore()

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteUnsavedDialogOpen, setDeleteUnsavedDialogOpen] = useState(false)
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshFolder(node.id)
    } catch (error) {
      toast.error(`刷新失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setRefreshing(false)
    }
  }

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

  const handleExpandAll = async () => {
    const expand = async (folderId: string): Promise<void> => {
      const current = useEditorStore.getState().findNodeById(folderId)
      if (!current || current.type !== "folder") return
      const children = current.isLoaded ? (current.children ?? []) : await loadFolderChildren(folderId)
      useEditorStore.setState((state) => {
        const update = (nodes: FileNode[]): FileNode[] => nodes.map((item) => {
          if (item.id === folderId) return { ...item, isExpanded: true }
          return item.children ? { ...item, children: update(item.children) } : item
        })
        return { files: update(state.files) }
      })
      for (const child of children) {
        if (child.type === "folder") await expand(child.id)
      }
    }
    await expand(node.id)
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
    if (getUnsavedFilesUnderNode(node.id).length > 0) {
      setDeleteDialogOpen(false)
      setDeleteUnsavedDialogOpen(true)
      return
    }
    void deleteNode(node.id)
    setDeleteDialogOpen(false)
  }

  const saveAndDelete = async () => {
    const unsaved = getUnsavedFilesUnderNode(node.id)
    for (const file of unsaved) {
      if (!(await saveFileById(file.id))) return
    }
    const remaining = getUnsavedFilesUnderNode(node.id)
    if (remaining.length > 0) {
      toast.error("保存期间文件又发生了修改，请重试")
      return
    }
    if (await deleteNode(node.id)) {
      setDeleteUnsavedDialogOpen(false)
    }
  }

  const discardAndDelete = async () => {
    if (await deleteNode(node.id, true)) {
      setDeleteUnsavedDialogOpen(false)
    }
  }

  const handleRemove = () => {
    const unsaved = getUnsavedFilesUnderNode(node.id)
    if (unsaved.length > 0) {
      setRemoveDialogOpen(true)
      return
    }
    removeNode(node.id)
  }

  const saveAndRemove = async () => {
    const unsaved = getUnsavedFilesUnderNode(node.id)
    for (const file of unsaved) {
      if (!(await saveFileById(file.id))) return
    }
    if (getUnsavedFilesUnderNode(node.id).length > 0) {
      toast.error("保存期间文件又发生了修改，请重试")
      return
    }
    if (removeNode(node.id, true)) {
      setRemoveDialogOpen(false)
    }
  }

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
              {node.filePath && isTauriRuntime() && (
                <ContextMenuItem disabled={refreshing} onClick={() => void handleRefresh()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  刷新目录
                </ContextMenuItem>
              )}
              <ContextMenuItem onClick={() => void handleExpandAll()}>
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
          <ContextMenuItem onClick={handleRemove}>
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
                ? `确定要删除文件夹「${node.name}」及磁盘中的全部内容吗？未展开的子目录和附件也会被删除，此操作不可撤销。`
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

      <AlertDialog open={deleteUnsavedDialogOpen} onOpenChange={setDeleteUnsavedDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除前处理未保存内容</AlertDialogTitle>
            <AlertDialogDescription>
              「{node.name}」中有未保存文件。请选择保存后删除、放弃修改，或取消操作。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => { event.preventDefault(); void discardAndDelete() }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              放弃并删除
            </AlertDialogAction>
            <AlertDialogAction
              onClick={(event) => { event.preventDefault(); void saveAndDelete() }}
            >
              保存后删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>移除前处理未保存内容</AlertDialogTitle>
            <AlertDialogDescription>
              「{node.name}」中有未保存文件。请选择保存后移除、放弃修改，或取消操作。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { removeNode(node.id, true); setRemoveDialogOpen(false) }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              放弃并移除
            </AlertDialogAction>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void saveAndRemove() }}>
              保存后移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
