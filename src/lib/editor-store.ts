import { create } from "zustand"
import { invoke, convertFileSrc } from "@tauri-apps/api/core"
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
  isNew?: boolean
}

interface FileSnapshot {
  content: string
  modified: number | null
}

const TAB_SIZE_STORAGE_KEY = "radishmd.tabSize"

function getInitialTabSize(): 4 | 6 | 8 {
  if (typeof window === "undefined") {
    return 4
  }

  const storedValue = window.localStorage.getItem(TAB_SIZE_STORAGE_KEY)
  if (storedValue === "6" || storedValue === "8") {
    return Number.parseInt(storedValue, 10) as 6 | 8
  }

  return 4
}

export function normalizeFilePath(filePath: string) {
  const trimmedPath = filePath.trim()

  if (!trimmedPath || !trimmedPath.startsWith("file://")) {
    return trimmedPath
  }

  try {
    const parsedUrl = new URL(trimmedPath)
    const decodedPath = decodeURIComponent(parsedUrl.pathname)

    if (parsedUrl.host && parsedUrl.host !== "localhost") {
      return `//${parsedUrl.host}${decodedPath}`
    }

    if (/^\/[A-Za-z]:\//.test(decodedPath)) {
      return decodedPath.slice(1)
    }

    return decodedPath
  } catch {
    return trimmedPath
  }
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
  contentType: "markdown" | "pdf"
  tabSize: 4 | 6 | 8
  wordCount: number
  charCount: number
  creatingType: "file" | "folder" | null
  creatingParentId: string | null
  renamingNodeId: string | null
  shouldResetScroll: boolean
  setShouldResetScroll: (value: boolean) => void
  fileScrollPositions: Record<string, { editor: number; preview: number }>
  saveScrollPosition: (fileId: string, editorScroll: number, previewScroll: number) => void
  getScrollPosition: (fileId: string) => { editor: number; preview: number } | null
  setActiveFile: (id: string) => Promise<void>
  setContent: (content: string) => void
  setContentType: (type: "markdown" | "pdf") => void
  openSearch: () => void
  closeSearch: () => void
  toggleSearch: () => void
  toggleSidebar: () => void
  toggleOutline: () => void
  toggleTheme: () => void
  toggleEditMode: () => void
  setEditMode: (mode: "split" | "wysiwyg") => void
  setSplitViewMode: (mode: "split" | "editor" | "render") => void
  cycleTabSize: () => void
  toggleFolder: (id: string) => void
  updateCounts: (content: string) => void
  addFiles: (files: FileNode[]) => void
  addTreeNodes: (newNodes: FileNode[]) => void
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
  startCreating: (type: "file" | "folder", parentId?: string | null) => void
  confirmCreate: (name: string) => void
  cancelCreate: () => void
  startRenaming: (id: string) => void
  confirmRename: (id: string, newName: string) => Promise<void>
  cancelRename: () => void
  deleteNode: (id: string) => Promise<void>
  removeNode: (id: string) => void
  moveNode: (nodeId: string, targetFolderId: string) => void
  saveFile: () => Promise<void>
  saveFileAs: () => Promise<void>
  openFileFromPath: (filePath: string) => Promise<void>
  hasUnsavedChanges: () => boolean
  getUnsavedFiles: () => FileNode[]
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
const externalChangeSuppressionByPath = new Map<string, number>()
const EXTERNAL_CHANGE_SUPPRESSION_WINDOW_MS = 1500

function suppressExternalChangeChecks(filePath: string) {
  externalChangeSuppressionByPath.set(
    normalizeFilePath(filePath),
    Date.now() + EXTERNAL_CHANGE_SUPPRESSION_WINDOW_MS,
  )
}

function isExternalChangeSuppressed(filePath: string) {
  const normalizedFilePath = normalizeFilePath(filePath)
  const suppressedUntil = externalChangeSuppressionByPath.get(normalizedFilePath)

  if (!suppressedUntil) {
    return false
  }

  if (suppressedUntil < Date.now()) {
    externalChangeSuppressionByPath.delete(normalizedFilePath)
    return false
  }

  return true
}

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
  const snapshot = await invoke<FileSnapshot>("read_file_snapshot", { path: normalizeFilePath(filePath) })
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

function mergeTreeNodes(existing: FileNode[], incoming: FileNode[]): FileNode[] {
  const result: FileNode[] = [...existing]

  for (const incomingNode of incoming) {
    if (incomingNode.type === "folder") {
      const existingFolder = findFolderByPath(result, incomingNode.filePath)
      if (existingFolder) {
        existingFolder.children = mergeTreeNodes(
          existingFolder.children || [],
          incomingNode.children || [],
        )
        existingFolder.isExpanded = true
      } else {
        result.push(incomingNode)
      }
    } else {
      if (!findFileByPath(result, incomingNode.filePath)) {
        result.push(incomingNode)
      }
    }
  }

  return result
}

function findFolderByPath(nodes: FileNode[], filePath?: string): FileNode | null {
  if (!filePath) return null
  for (const node of nodes) {
    if (node.type === "folder" && node.filePath === filePath) return node
    if (node.children) {
      const found = findFolderByPath(node.children, filePath)
      if (found) return found
    }
  }
  return null
}

function findFileByPath(nodes: FileNode[], filePath?: string): FileNode | null {
  if (!filePath) return null
  for (const node of nodes) {
    if (node.type === "file" && node.filePath === filePath) return node
    if (node.children) {
      const found = findFileByPath(node.children, filePath)
      if (found) return found
    }
  }
  return null
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
  contentType: "markdown",
  tabSize: getInitialTabSize(),
  wordCount: 0,
  charCount: 0,
  creatingType: null,
  creatingParentId: null,
  renamingNodeId: null,
  shouldResetScroll: false,
  fileScrollPositions: {},

  setShouldResetScroll: (value: boolean) => {
    set({ shouldResetScroll: value })
  },

  saveScrollPosition: (fileId: string, editorScroll: number, previewScroll: number) => {
    set((state) => ({
      fileScrollPositions: {
        ...state.fileScrollPositions,
        [fileId]: { editor: editorScroll, preview: previewScroll },
      },
    }))
  },

  getScrollPosition: (fileId: string) => {
    return get().fileScrollPositions[fileId] ?? null
  },

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

      const isPdf = file.filePath?.toLowerCase().endsWith(".pdf") ?? false

      if (file.filePath) {
        try {
          if (isPdf) {
            const url = convertFileSrc(file.filePath)
            set({ content: url, contentType: "pdf", splitViewMode: "render", isSidebarOpen: false, isOutlineOpen: false })
            get().updateCounts("")
            return
          }

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
              set({ content: currentContent, contentType: "markdown" })
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
            set({ content: snapshot.content, contentType: "markdown" })
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
      set({ content: currentContent, contentType: isPdf ? "pdf" : "markdown", splitViewMode: isPdf ? "render" : get().splitViewMode })
      get().updateCounts(isPdf ? "" : currentContent)
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

  setContentType: (type: "markdown" | "pdf") => set({ contentType: type }),

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

  cycleTabSize: () =>
    set((state) => ({
      tabSize: state.tabSize === 4 ? 6 : state.tabSize === 6 ? 8 : 4,
    })),

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

  addTreeNodes: (newNodes: FileNode[]) => {
    set((state) => ({
      files: mergeTreeNodes(state.files, newNodes),
    }))
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
    const normalizedFilePath = normalizeFilePath(filePath)

    const findInNodes = (nodes: FileNode[]): FileNode | null => {
      for (const node of nodes) {
        if (node.type === "file" && node.filePath === normalizedFilePath) return node
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

    const isPdf = file.filePath?.toLowerCase().endsWith(".pdf") ?? false
    // For PDFs, generate asset URL; otherwise use stored content
    const currentContent = isPdf && file.filePath ? convertFileSrc(file.filePath) : (file.content || "")

    debugEditorLog("activateFileById", {
      id,
      fileName: file.name,
      filePath: file.filePath,
      contentLength: currentContent.length,
      isPdf,
    })

    set({
      activeFileId: id,
      content: currentContent,
      contentType: isPdf ? "pdf" : "markdown",
      splitViewMode: isPdf ? "render" : get().splitViewMode,
      ...(isPdf && { isSidebarOpen: false, isOutlineOpen: false }),
    })
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

    if (isExternalChangeSuppressed(file.filePath)) {
      debugEditorLog("checkActiveFileForExternalChanges:suppressed", {
        id: activeFileId,
        filePath: file.filePath,
      })
      return
    }

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

  startCreating: (type: "file" | "folder", parentId?: string | null) => {
    // Auto-expand the parent folder if it's collapsed
    if (parentId) {
      const parent = get().findNodeById(parentId)
      if (parent && parent.type === "folder" && !parent.isExpanded) {
        const expandNode = (nodes: FileNode[]): FileNode[] => {
          return nodes.map((node) => {
            if (node.id === parentId) {
              return { ...node, isExpanded: true }
            }
            if (node.children) {
              return { ...node, children: expandNode(node.children) }
            }
            return node
          })
        }
        set((state) => ({ files: expandNode(state.files) }))
      }
    }
    set({ creatingType: type, creatingParentId: parentId ?? null })
  },

  confirmCreate: (name: string) => {
    const { creatingType, creatingParentId } = get()
    if (!creatingType || !name.trim()) {
      set({ creatingType: null, creatingParentId: null })
      return
    }

    const parentNode = creatingParentId ? get().findNodeById(creatingParentId) : null
    const parentPath = parentNode?.filePath || null

    const newNode: FileNode = {
      id: `${creatingType}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: name.trim(),
      type: creatingType,
      ...(creatingType === "folder"
        ? {
            isExpanded: false,
            children: [],
            filePath: parentPath ? `${parentPath}/${name.trim()}` : undefined,
          }
        : {
            content: "",
            hasExternalChanges: false,
            isNew: !parentPath,
            filePath: parentPath ? `${parentPath}/${name.trim()}` : undefined,
          }),
    }

    if (creatingParentId) {
      // Insert into the target folder
      const insertIntoFolder = (nodes: FileNode[]): FileNode[] => {
        return nodes.map((node) => {
          if (node.id === creatingParentId && node.type === "folder") {
            return {
              ...node,
              children: [...(node.children || []), newNode],
              isExpanded: true,
            }
          }
          if (node.children) {
            return { ...node, children: insertIntoFolder(node.children) }
          }
          return node
        })
      }
      set((state) => ({
        files: insertIntoFolder(state.files),
        creatingType: null,
        creatingParentId: null,
        ...(creatingType === "file" && {
          activeFileId: newNode.id,
          content: "",
        }),
      }))
    } else {
      // Insert at root
      set((state) => ({
        files: [...state.files, newNode],
        creatingType: null,
        creatingParentId: null,
        ...(creatingType === "file" && {
          activeFileId: newNode.id,
          content: "",
        }),
      }))
    }

    // Update word/char counts for new file
    if (creatingType === "file") {
      get().updateCounts("")
    }
  },

  cancelCreate: () => {
    set({ creatingType: null, creatingParentId: null })
  },

  startRenaming: (id: string) => {
    set({ renamingNodeId: id })
  },

  confirmRename: async (id: string, newName: string) => {
    const node = get().findNodeById(id)
    if (!node || !newName.trim()) {
      set({ renamingNodeId: null })
      return
    }

    const trimmedName = newName.trim()
    if (trimmedName === node.name) {
      set({ renamingNodeId: null })
      return
    }

    // If node has a real file path, rename on disk
    if (node.filePath) {
      const segments = node.filePath.split(/[\\/]/)
      segments[segments.length - 1] = trimmedName
      const newPath = segments.join("/")

      try {
        await invoke("rename_file", { oldPath: node.filePath, newPath })

        // Update this node and all children paths recursively
        const updatePaths = (n: FileNode, oldBase: string, newBase: string): FileNode => {
          const updated = { ...n }
          if (updated.filePath) {
            updated.filePath = updated.filePath.replace(oldBase, newBase)
          }
          if (updated.children) {
            updated.children = updated.children.map((child) =>
              updatePaths(child, oldBase, newBase),
            )
          }
          return updated
        }

        set((state) => ({
          files: updateFileInNodes(state.files, id, (n) =>
            updatePaths({ ...n, name: trimmedName }, node.filePath!, newPath),
          ),
          renamingNodeId: null,
        }))

        toast.success(`已重命名: ${trimmedName}`, {
          style: { backgroundColor: "#22c55e", color: "#fff" },
        })
      } catch (e) {
        toast.error(`重命名失败: ${e instanceof Error ? e.message : String(e)}`, {
          style: { backgroundColor: "#ef4444", color: "#fff" },
        })
        set({ renamingNodeId: null })
      }
    } else {
      // In-memory only node, just update name
      set((state) => ({
        files: updateFileInNodes(state.files, id, (n) => ({ ...n, name: trimmedName })),
        renamingNodeId: null,
      }))
    }
  },

  cancelRename: () => {
    set({ renamingNodeId: null })
  },

  deleteNode: async (id: string) => {
    const node = get().findNodeById(id)
    if (!node) return

    // Delete from disk if it has a real path
    if (node.filePath) {
      try {
        if (node.type === "folder") {
          await invoke("delete_directory", { path: node.filePath })
        } else {
          await invoke("delete_file", { path: node.filePath })
        }
      } catch (e) {
        toast.error(`删除失败: ${e instanceof Error ? e.message : String(e)}`, {
          style: { backgroundColor: "#ef4444", color: "#fff" },
        })
        return
      }
    }

    // Remove from tree
    get().removeNode(id)
    toast.success(`已删除: ${node.name}`, {
      style: { backgroundColor: "#22c55e", color: "#fff" },
    })
  },

  removeNode: (id: string) => {
    const { activeFileId } = get()

    const removeFromNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes
        .filter((node) => node.id !== id)
        .map((node) => {
          if (node.children) {
            return { ...node, children: removeFromNodes(node.children) }
          }
          return node
        })
    }

    const newFiles = removeFromNodes(get().files)

    // If the removed node was active, clear selection
    if (activeFileId === id) {
      set({ files: newFiles, activeFileId: null, content: "" })
      get().updateCounts("")
    } else {
      set({ files: newFiles })
    }
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
      suppressExternalChangeChecks(file.filePath)
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
          isNew: false,
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
      suppressExternalChangeChecks(selected)
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
          isNew: false,
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
        suppressExternalChangeChecks(selected)
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
            isNew: false,
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
      suppressExternalChangeChecks(file.filePath)
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
          isNew: false,
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
      const normalizedFilePath = normalizeFilePath(filePath)
      debugEditorLog("openFileFromPath:start", { filePath: normalizedFilePath, files: summarizeFiles(get().files) })

      const isPdf = normalizedFilePath.toLowerCase().endsWith(".pdf")
      const fileName = await invoke<string>("get_file_name", { filePath: normalizedFilePath })
      const existingFile = get().findNodeByPath(normalizedFilePath)

      if (existingFile) {
        debugEditorLog("openFileFromPath:existing-file", {
          filePath: normalizedFilePath,
          fileName,
          existingFileId: existingFile.id,
        })
        await get().setActiveFile(existingFile.id)
        toast.success(`已打开: ${fileName}`, {
          style: { backgroundColor: "#22c55e", color: "#fff" },
        })
        return
      }

      let content: string
      let sourceModified: number | null = null

      if (isPdf) {
        content = convertFileSrc(normalizedFilePath)
        set({ contentType: "pdf", splitViewMode: "render", isSidebarOpen: false, isOutlineOpen: false })
      } else {
        const snapshot = await readFileSnapshot(normalizedFilePath)
        content = snapshot.content
        sourceModified = snapshot.modified
        set({ contentType: "markdown" })
      }

      const newFile: FileNode = {
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: fileName,
        type: "file",
        content,
        filePath: normalizedFilePath,
        sourceModified,
        isDirty: false,
        hasExternalChanges: false,
      }

      set((state) => ({ files: [...state.files, newFile] }))
      set({ activeFileId: newFile.id, content })
      get().updateCounts(isPdf ? "" : content)

      debugEditorLog("openFileFromPath:new-file", {
        filePath: normalizedFilePath,
        fileName,
        newFileId: newFile.id,
        isPdf,
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

  hasUnsavedChanges: () => {
    const { files } = get()

    const checkFiles = (nodes: FileNode[]): boolean => {
      for (const node of nodes) {
        if (node.type === "file") {
          if (node.isNew || node.isDirty) {
            return true
          }
        }
        if (node.children && checkFiles(node.children)) {
          return true
        }
      }
      return false
    }

    return checkFiles(files)
  },

  getUnsavedFiles: () => {
    const { files } = get()
    const unsaved: FileNode[] = []

    const collectFiles = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.type === "file") {
          if (node.isNew || node.isDirty) {
            unsaved.push(node)
          }
        }
        if (node.children) {
          collectFiles(node.children)
        }
      }
    }

    collectFiles(files)
    return unsaved
  },
}))

if (typeof window !== "undefined") {
  useEditorStore.subscribe((state, previousState) => {
    if (state.tabSize === previousState.tabSize) {
      return
    }

    window.localStorage.setItem(TAB_SIZE_STORAGE_KEY, String(state.tabSize))
  })
}
