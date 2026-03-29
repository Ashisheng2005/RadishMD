import { create } from "zustand"
import { invoke } from "@tauri-apps/api/core"
import { save } from "@tauri-apps/plugin-dialog"
import { toast } from "sonner"

export interface FileNode {
  id: string
  name: string
  type: "file" | "folder"
  children?: FileNode[]
  content?: string
  isExpanded?: boolean
  filePath?: string
  sourceModified?: number | null
  isDirty?: boolean
  hasExternalChanges?: boolean
}

interface FileSnapshot {
  content: string
  modified: number | null
}

interface EditorState {
  files: FileNode[]
  activeFileId: string | null
  content: string
  isSidebarOpen: boolean
  isOutlineOpen: boolean
  isSearchOpen: boolean
  theme: "light" | "dark" | "system"
  editMode: "split" | "wysiwyg"
  splitViewMode: "split" | "editor" | "render"
  wordCount: number
  charCount: number
  creatingType: "file" | "folder" | null
  setActiveFile: (id: string) => Promise<void>
  setContent: (content: string) => void
  openSearch: () => void
  closeSearch: () => void
  toggleSearch: () => void
  toggleSidebar: () => void
  toggleOutline: () => void
  toggleTheme: () => void
  toggleEditMode: () => void
  setEditMode: (mode: "split" | "wysiwyg") => void
  setSplitViewMode: (mode: "split" | "editor" | "render") => void
  toggleFolder: (id: string) => void
  updateCounts: (content: string) => void
  addFiles: (files: FileNode[]) => void
  findNodeById: (id: string) => FileNode | null
  findNodeByPath: (filePath: string) => FileNode | null
  activateFileById: (id: string) => void
  saveFileById: (id: string) => Promise<void>
  reloadFileFromDiskById: (id: string) => Promise<void>
  checkActiveFileForExternalChanges: () => Promise<void>
  updateFileContent: (
    id: string,
    content: string,
    sourceModified?: number | null,
    isDirty?: boolean,
  ) => void
  startCreating: (type: "file" | "folder") => void
  confirmCreate: (name: string) => void
  cancelCreate: () => void
  moveNode: (nodeId: string, targetFolderId: string) => void
  saveFile: () => Promise<void>
  saveFileAs: () => Promise<void>
  openFileFromPath: (filePath: string) => Promise<void>
}

const initialFiles: FileNode[] = []

function debugEditorLog(label: string, details?: Record<string, unknown>) {
  if (details) {
    console.log(`[RadishMD][store] ${label}`, details)
    return
  }

  console.log(`[RadishMD][store] ${label}`)
}

let lastExternalChangeWarningKey: string | null = null

function warnExternalChangeOnce(file: FileNode, modified: number | null) {
  const warningKey = `${file.id}:${modified ?? "unknown"}`

  if (lastExternalChangeWarningKey === warningKey) {
    return
  }

  lastExternalChangeWarningKey = warningKey
  toast.warning(`文件已在外部修改: ${file.name}`, {
    style: { backgroundColor: "#f59e0b", color: "#111827" },
  })
}

function summarizeFiles(files: FileNode[]) {
  return files.map((file) => ({
    id: file.id,
    name: file.name,
    type: file.type,
    filePath: file.filePath,
    isDirty: file.isDirty ?? false,
    hasExternalChanges: file.hasExternalChanges ?? false,
    children: file.children?.length ?? 0,
  }))
}

export async function readFileSnapshot(filePath: string): Promise<FileSnapshot> {
  const snapshot = await invoke<FileSnapshot>("read_file_snapshot", { path: filePath })
  return snapshot
}

function updateFileInNodes(
  nodes: FileNode[],
  id: string,
  updater: (node: FileNode) => FileNode,
): FileNode[] {
  return nodes.map((node) => {
    if (node.id === id) {
      return updater(node)
    }

    if (node.children) {
      return { ...node, children: updateFileInNodes(node.children, id, updater) }
    }

    return node
  })
}

export const useEditorStore = create<EditorState>((set, get) => ({
  files: initialFiles,
  activeFileId: null,
  content: "",
  isSidebarOpen: true,
  isOutlineOpen: true,
  isSearchOpen: false,
  theme: "system",
  editMode: "split",
  splitViewMode: "split",
  wordCount: 0,
  charCount: 0,
  creatingType: null,

  setActiveFile: async (id: string) => {
    const file = get().findNodeById(id)
    if (file) {
      debugEditorLog("setActiveFile:start", {
        id,
        fileName: file.name,
        filePath: file.filePath,
        files: summarizeFiles(get().files),
      })
      set({ activeFileId: id })

      if (file.filePath) {
        try {
          const snapshot = await readFileSnapshot(file.filePath)
          if (get().activeFileId !== id) {
            return
          }

          const modifiedChanged = snapshot.modified !== file.sourceModified

          if (modifiedChanged) {
            if (file.isDirty) {
              debugEditorLog("setActiveFile:external-change-kept-local", {
                id,
                filePath: file.filePath,
                sourceModified: file.sourceModified,
                snapshotModified: snapshot.modified,
              })

              warnExternalChangeOnce(file, snapshot.modified)

              set((state) => ({
                files: updateFileInNodes(state.files, id, (node) => ({
                  ...node,
                  hasExternalChanges: true,
                })),
              }))

              const currentContent = file.content || ""
              set({ content: currentContent })
              get().updateCounts(currentContent)
              return
            }

            debugEditorLog("setActiveFile:content-refreshed-from-disk", {
              id,
              filePath: file.filePath,
              sourceModified: file.sourceModified,
              snapshotModified: snapshot.modified,
            })
            get().updateFileContent(id, snapshot.content, snapshot.modified, false)
            set((state) => ({
              files: updateFileInNodes(state.files, id, (node) => ({
                ...node,
                hasExternalChanges: false,
              })),
            }))
            set({ content: snapshot.content })
            get().updateCounts(snapshot.content)
            return
          }

          set((state) => ({
            files: updateFileInNodes(state.files, id, (node) => ({
              ...node,
              hasExternalChanges: false,
            })),
          }))
        } catch {
          // Fall back to the in-memory version if the file cannot be read.
        }
      }

      const currentContent = file.content || ""
      debugEditorLog("setActiveFile:use-in-memory-content", {
        id,
        fileName: file.name,
        contentLength: currentContent.length,
      })
      set({ content: currentContent })
      get().updateCounts(currentContent)
    }
  },

  setContent: (content: string) => {
    const { activeFileId } = get()

    if (activeFileId) {
      debugEditorLog("setContent:dirty", {
        activeFileId,
        contentLength: content.length,
      })
      get().updateFileContent(activeFileId, content, undefined, true)
    }

    set({ content })
    get().updateCounts(content)
  },

  openSearch: () => set({ isSearchOpen: true }),
  closeSearch: () => set({ isSearchOpen: false }),
  toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),

  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  toggleOutline: () => set((state) => ({ isOutlineOpen: !state.isOutlineOpen })),
  toggleTheme: () =>
    set((state) => ({
      theme:
        state.theme === "system"
          ? "light"
          : state.theme === "light"
            ? "dark"
            : "system",
    })),
  toggleEditMode: () =>
    set((state) => ({ editMode: state.editMode === "split" ? "wysiwyg" : "split" })),

  setEditMode: (mode: "split" | "wysiwyg") => set({ editMode: mode }),

  setSplitViewMode: (mode: "split" | "editor" | "render") => set({ splitViewMode: mode }),

  toggleFolder: (id: string) => {
    const toggleInNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes.map((node) => {
        if (node.id === id && node.type === "folder") {
          return { ...node, isExpanded: !node.isExpanded }
        }

        if (node.children) {
          return { ...node, children: toggleInNodes(node.children) }
        }

        return node
      })
    }

    set((state) => ({ files: toggleInNodes(state.files) }))
  },

  updateCounts: (content: string) => {
    const charCount = content.length
    const wordCount = content
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0).length
    set({ wordCount, charCount })
  },

  addFiles: (files: FileNode[]) => {
    const addFilesToRoot = (nodes: FileNode[], newFiles: FileNode[]): FileNode[] => {
      return [...nodes, ...newFiles]
    }
    set((state) => ({ files: addFilesToRoot(state.files, files) }))
  },

  findNodeById: (id: string) => {
    const findInNodes = (nodes: FileNode[]): FileNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node
        if (node.children) {
          const found = findInNodes(node.children)
          if (found) return found
        }
      }
      return null
    }
    return findInNodes(get().files)
  },

  findNodeByPath: (filePath: string) => {
    const findInNodes = (nodes: FileNode[]): FileNode | null => {
      for (const node of nodes) {
        if (node.type === "file" && node.filePath === filePath) return node
        if (node.children) {
          const found = findInNodes(node.children)
          if (found) return found
        }
      }
      return null
    }
    return findInNodes(get().files)
  },

  activateFileById: (id: string) => {
    const file = get().findNodeById(id)
    if (!file || file.type !== "file") {
      return
    }

    const currentContent = file.content || ""
    debugEditorLog("activateFileById", {
      id,
      fileName: file.name,
      filePath: file.filePath,
      contentLength: currentContent.length,
    })

    set({ activeFileId: id, content: currentContent })
    get().updateCounts(currentContent)
  },

  reloadFileFromDiskById: async (id: string) => {
    const file = get().findNodeById(id)
    if (!file || file.type !== "file" || !file.filePath) {
      return
    }

    try {
      debugEditorLog("reloadFileFromDiskById:start", {
        id,
        filePath: file.filePath,
        fileName: file.name,
      })

      const snapshot = await readFileSnapshot(file.filePath)
      set((state) => ({
        files: updateFileInNodes(state.files, id, (node) => ({
          ...node,
          content: snapshot.content,
          sourceModified: snapshot.modified,
          isDirty: false,
          hasExternalChanges: false,
        })),
      }))

      if (get().activeFileId === id) {
        set({ content: snapshot.content })
        get().updateCounts(snapshot.content)
      }

      lastExternalChangeWarningKey = null

      toast.success(`已重新载入: ${file.name}`, {
        style: { backgroundColor: "#22c55e", color: "#fff" },
      })
    } catch (error) {
      debugEditorLog("reloadFileFromDiskById:error", {
        id,
        filePath: file.filePath,
        error: error instanceof Error ? error.message : String(error),
      })
      toast.error(`重新载入失败: ${file.name}`, {
        style: { backgroundColor: "#ef4444", color: "#fff" },
      })
    }
  },

  checkActiveFileForExternalChanges: async () => {
    const { activeFileId } = get()
    if (!activeFileId) return

    const file = get().findNodeById(activeFileId)
    if (!file || file.type !== "file" || !file.filePath) return

    try {
      const snapshot = await readFileSnapshot(file.filePath)
      if (get().activeFileId !== activeFileId) {
        return
      }

      const modifiedChanged = snapshot.modified !== file.sourceModified
      if (!modifiedChanged) {
        if (file.hasExternalChanges) {
          set((state) => ({
            files: updateFileInNodes(state.files, activeFileId, (node) => ({
              ...node,
              hasExternalChanges: false,
            })),
          }))
        }
        return
      }

      if (file.isDirty) {
        warnExternalChangeOnce(file, snapshot.modified)

        set((state) => ({
          files: updateFileInNodes(state.files, activeFileId, (node) => ({
            ...node,
            hasExternalChanges: true,
          })),
        }))
        return
      }

      debugEditorLog("checkActiveFileForExternalChanges:auto-refresh", {
        id: activeFileId,
        filePath: file.filePath,
        sourceModified: file.sourceModified,
        snapshotModified: snapshot.modified,
      })

      get().updateFileContent(activeFileId, snapshot.content, snapshot.modified, false)
      set((state) => ({
        files: updateFileInNodes(state.files, activeFileId, (node) => ({
          ...node,
          hasExternalChanges: false,
        })),
      }))
      set({ content: snapshot.content })
      get().updateCounts(snapshot.content)
    } catch (error) {
      debugEditorLog("checkActiveFileForExternalChanges:error", {
        id: activeFileId,
        filePath: file.filePath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  updateFileContent: (id: string, content: string, sourceModified?: number | null, isDirty?: boolean) => {
    debugEditorLog("updateFileContent", {
      id,
      contentLength: content.length,
      sourceModified,
      isDirty,
    })
    set((state) => ({
      files: updateFileInNodes(state.files, id, (node) => ({
        ...node,
        content,
        ...(sourceModified !== undefined ? { sourceModified } : {}),
        ...(isDirty !== undefined ? { isDirty } : {}),
      })),
    }))
  },

  startCreating: (type: "file" | "folder") => {
    set({ creatingType: type })
  },

  confirmCreate: (name: string) => {
    const { creatingType } = get()
    if (!creatingType || !name.trim()) {
      set({ creatingType: null })
      return
    }

    const newNode: FileNode = {
      id: `${creatingType}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: name.trim(),
      type: creatingType,
      ...(creatingType === "folder"
        ? { isExpanded: false, children: [] }
        : { content: "", hasExternalChanges: false }),
    }

    set((state) => ({
      files: [...state.files, newNode],
      creatingType: null,
      ...(creatingType === "file" && {
        activeFileId: newNode.id,
        content: "",
      }),
    }))

    // Update word/char counts for new file
    if (creatingType === "file") {
      get().updateCounts("")
    }
  },

  cancelCreate: () => {
    set({ creatingType: null })
  },

  moveNode: (nodeId: string, targetFolderId: string) => {
    const state = get()
    let nodeToMove: FileNode | null = null

    // Find and remove the node from its current location
    const removeNode = (nodes: FileNode[]): FileNode[] => {
      return nodes.filter((node) => {
        if (node.id === nodeId) {
          nodeToMove = node
          return false
        }
        if (node.children) {
          node.children = removeNode(node.children)
        }
        return true
      })
    }

    // Add the node to the target folder
    const addNodeToFolder = (nodes: FileNode[]): FileNode[] => {
      return nodes.map((node) => {
        if (node.id === targetFolderId && node.type === "folder") {
          return {
            ...node,
            children: [...(node.children || []), { ...nodeToMove!, children: undefined }],
            isExpanded: true,
          }
        }
        if (node.children) {
          node.children = addNodeToFolder(node.children)
        }
        return node
      })
    }

    const filesWithoutNode = removeNode(state.files)
    if (nodeToMove) {
      set({ files: addNodeToFolder(filesWithoutNode) })
    }
  },

  saveFile: async () => {
    const { activeFileId, content } = get()
    if (!activeFileId) return

    const file = get().findNodeById(activeFileId)
    if (!file || file.type !== "file" || !file.filePath) {
      // No file path, do Save As
      debugEditorLog("saveFile:redirect-to-save-as", {
        activeFileId,
        contentLength: content.length,
      })
      await get().saveFileAs()
      return
    }

    // Direct save
    try {
      debugEditorLog("saveFile:start", {
        activeFileId,
        filePath: file.filePath,
        fileName: file.name,
        contentLength: content.length,
        files: summarizeFiles(get().files),
      })
      await invoke("write_file", { path: file.filePath, content })
      const snapshot = await readFileSnapshot(file.filePath)
      set((state) => ({
        files: updateFileInNodes(state.files, activeFileId, (node) => ({
          ...node,
          sourceModified: snapshot.modified,
          isDirty: false,
            hasExternalChanges: false,
        })),
      }))
      lastExternalChangeWarningKey = null
      debugEditorLog("saveFile:success", {
        activeFileId,
        filePath: file.filePath,
        snapshotModified: snapshot.modified,
        files: summarizeFiles(get().files),
      })
      toast.success(`已保存: ${file.name}`, {
        style: { backgroundColor: "#22c55e", color: "#fff" },
      })
    } catch (e) {
      toast.error(`保存失败: ${file.name}`, {
        style: { backgroundColor: "#ef4444", color: "#fff" },
      })
    }
  },

  saveFileAs: async () => {
    const { activeFileId, content } = get()
    if (!activeFileId) return

    const file = get().findNodeById(activeFileId)
    if (!file || file.type !== "file") return

    const selected = await save({
      filters: [{ name: "Markdown", extensions: ["md"] }],
      defaultPath: file.name,
    })

    if (!selected) return

    try {
      debugEditorLog("saveFileAs:start", {
        activeFileId,
        selected,
        contentLength: content.length,
        files: summarizeFiles(get().files),
      })
      await invoke("write_file", { path: selected, content })
      const snapshot = await readFileSnapshot(selected)

      // Update file path and name in store
      const newName = selected.split(/[\\/]/).pop() || file.name
      set((state) => ({
        files: updateFileInNodes(state.files, activeFileId, (node) => ({
          ...node,
          filePath: selected,
          name: newName,
          content,
          sourceModified: snapshot.modified,
          isDirty: false,
          hasExternalChanges: false,
        })),
      }))
      lastExternalChangeWarningKey = null
      debugEditorLog("saveFileAs:success", {
        activeFileId,
        selected,
        snapshotModified: snapshot.modified,
        files: summarizeFiles(get().files),
      })
      toast.success(`已保存: ${newName}`, {
        style: { backgroundColor: "#22c55e", color: "#fff" },
      })
    } catch (e) {
      toast.error(`保存失败: ${selected}`, {
        style: { backgroundColor: "#ef4444", color: "#fff" },
      })
    }
  },

  saveFileById: async (id: string) => {
    const file = get().findNodeById(id)
    if (!file || file.type !== "file") return

    const content = file.content || ""

    if (!file.filePath) {
      const selected = await save({
        filters: [{ name: "Markdown", extensions: ["md"] }],
        defaultPath: file.name,
      })

      if (!selected) return

      try {
        debugEditorLog("saveFileById:save-as:start", {
          id,
          selected,
          contentLength: content.length,
          files: summarizeFiles(get().files),
        })
        await invoke("write_file", { path: selected, content })
        const snapshot = await readFileSnapshot(selected)
        const newName = selected.split(/[\\/]/).pop() || file.name

        set((state) => ({
          files: updateFileInNodes(state.files, id, (node) => ({
            ...node,
            filePath: selected,
            name: newName,
            content,
            sourceModified: snapshot.modified,
            isDirty: false,
            hasExternalChanges: false,
          })),
        }))
        lastExternalChangeWarningKey = null

        debugEditorLog("saveFileById:save-as:success", {
          id,
          selected,
          snapshotModified: snapshot.modified,
          files: summarizeFiles(get().files),
        })
        toast.success(`已保存: ${newName}`, {
          style: { backgroundColor: "#22c55e", color: "#fff" },
        })
      } catch {
        toast.error(`保存失败: ${selected}`, {
          style: { backgroundColor: "#ef4444", color: "#fff" },
        })
      }

      return
    }

    try {
      debugEditorLog("saveFileById:start", {
        id,
        filePath: file.filePath,
        fileName: file.name,
        contentLength: content.length,
        files: summarizeFiles(get().files),
      })
      await invoke("write_file", { path: file.filePath, content })
      const snapshot = await readFileSnapshot(file.filePath)

      set((state) => ({
        files: updateFileInNodes(state.files, id, (node) => ({
          ...node,
          sourceModified: snapshot.modified,
          isDirty: false,
          hasExternalChanges: false,
        })),
      }))
      lastExternalChangeWarningKey = null

      debugEditorLog("saveFileById:success", {
        id,
        filePath: file.filePath,
        snapshotModified: snapshot.modified,
        files: summarizeFiles(get().files),
      })
      toast.success(`已保存: ${file.name}`, {
        style: { backgroundColor: "#22c55e", color: "#fff" },
      })
    } catch {
      toast.error(`保存失败: ${file.name}`, {
        style: { backgroundColor: "#ef4444", color: "#fff" },
      })
    }
  },

  openFileFromPath: async (filePath: string) => {
    try {
      debugEditorLog("openFileFromPath:start", { filePath, files: summarizeFiles(get().files) })
      const snapshot = await readFileSnapshot(filePath)
      const fileName = await invoke<string>("get_file_name", { filePath })
      const existingFile = get().findNodeByPath(filePath)

      if (existingFile) {
        debugEditorLog("openFileFromPath:existing-file", {
          filePath,
          fileName,
          existingFileId: existingFile.id,
        })
        await get().setActiveFile(existingFile.id)
        toast.success(`已打开: ${fileName}`, {
          style: { backgroundColor: "#22c55e", color: "#fff" },
        })
        return
      }

      const newFile: FileNode = {
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: fileName,
        type: "file",
        content: snapshot.content,
        filePath,
        sourceModified: snapshot.modified,
        isDirty: false,
        hasExternalChanges: false,
      }

      set((state) => ({ files: [...state.files, newFile] }))
      set({ activeFileId: newFile.id, content: snapshot.content })
      get().updateCounts(snapshot.content)

      debugEditorLog("openFileFromPath:new-file", {
        filePath,
        fileName,
        newFileId: newFile.id,
        files: summarizeFiles(get().files),
      })

      toast.success(`已打开: ${fileName}`, {
        style: { backgroundColor: "#22c55e", color: "#fff" },
      })
    } catch (e) {
      debugEditorLog("openFileFromPath:error", {
        filePath,
        error: e instanceof Error ? e.message : String(e),
      })
      toast.error(`打开失败: ${filePath}`, {
        style: { backgroundColor: "#ef4444", color: "#fff" },
      })
    }
  },
}))
