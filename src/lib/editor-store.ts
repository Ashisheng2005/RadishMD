import { create } from "zustand"
import { invoke, convertFileSrc } from "@tauri-apps/api/core"
import { save } from "@tauri-apps/plugin-dialog"
import { toast } from "sonner"
import { invalidateDirectoryCache } from "./directory-cache"

export interface FileNode {
  id: string
  name: string
  type: "file" | "folder"
  children?: FileNode[]
  content?: string
  isExpanded?: boolean
  isLoaded?: boolean
  isLoading?: boolean
  filePath?: string
  sourceModified?: number | null
  isDirty?: boolean
  hasExternalChanges?: boolean
  isNew?: boolean
  kind?: "markdown" | "text" | "pdf" | "other"
  canEdit?: boolean
  canSaveText?: boolean
  editVersion?: number
  savedVersion?: number
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
  findFolderByPath: (folderPath: string) => FileNode | null
  setFolderLoading: (id: string, isLoading: boolean) => void
  setFolderExpanded: (id: string, expanded: boolean) => void
  replaceFolderChildren: (id: string, children: FileNode[]) => void
  activateFileById: (id: string) => void
  saveFileById: (id: string, forceOverwrite?: boolean) => Promise<boolean>
  reloadFileFromDiskById: (id: string) => Promise<void>
  checkActiveFileForExternalChanges: () => Promise<void>
  updateFileContent: (
    id: string,
    content: string,
    sourceModified?: number | null,
    isDirty?: boolean,
  ) => void
  startCreating: (type: "file" | "folder", parentId?: string | null) => void
  confirmCreate: (name: string) => Promise<void>
  cancelCreate: () => void
  startRenaming: (id: string) => void
  confirmRename: (id: string, newName: string) => Promise<void>
  cancelRename: () => void
  deleteNode: (id: string, force?: boolean) => Promise<boolean>
  removeNode: (id: string, force?: boolean) => boolean
  moveNode: (nodeId: string, targetFolderId: string) => Promise<void>
  saveFile: () => Promise<boolean>
  saveFileAs: () => Promise<boolean>
  openFileFromPath: (filePath: string, options?: { activate?: boolean }) => Promise<void>
  hasUnsavedChanges: () => boolean
  getUnsavedFiles: () => FileNode[]
  getUnsavedFilesUnderNode: (id: string) => FileNode[]
}

const initialFiles: FileNode[] = []

const saveQueues = new Map<string, Promise<void>>()

function enqueueDocumentSave(id: string, operation: () => Promise<void>) {
  const previous = saveQueues.get(id) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(operation)
  saveQueues.set(id, next)
  const cleanup = () => {
    if (saveQueues.get(id) === next) {
      saveQueues.delete(id)
    }
  }
  void next.then(cleanup, cleanup)
  return next
}
export function filePathIdentity(filePath?: string) {
  if (!filePath) return ""
  const raw = normalizeFilePath(filePath).replace(/\\/g, "/")
  if (!raw) return ""
  const isUnc = raw.startsWith("//")
  const isRoot = raw === "/" || /^[A-Za-z]:\/$/.test(raw)
  const normalized = isRoot ? raw : raw.replace(/\/{2,}/g, "/").replace(/\/$/, "")
  // Windows paths are case-insensitive; preserve case on other platforms.
  return (/^[A-Za-z]:\//.test(normalized) || isUnc)
    ? normalized.toLowerCase()
    : normalized
}

function getFileKind(filePath?: string): FileNode["kind"] {
  const extension = filePath?.split(/[\\/]/).pop()?.split(".").pop()?.toLowerCase() ?? ""
  if (extension === "pdf") return "pdf"
  if (extension === "md" || extension === "markdown") return "markdown"
  if (["txt", "text", "json", "jsonc", "yaml", "yml", "toml", "csv", "log", "xml", "ini", "env"].includes(extension)) {
    return "text"
  }
  return "other"
}

function getNodeKind(node: FileNode) {
  return node.kind ?? getFileKind(node.filePath)
}

function canSaveText(node: FileNode) {
  return node.type === "file" && node.canSaveText !== false && getNodeKind(node) !== "pdf"
}

function getEditVersion(node: FileNode) {
  return node.editVersion ?? 0
}

function validateNodeName(name: string) {
  const trimmed = name.trim()
  if (!trimmed || trimmed === "." || trimmed === "..") {
    return "名称不能为空"
  }
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(trimmed) || /[ .]$/.test(trimmed)) {
    return "名称包含非法字符或以空格、句点结尾"
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(trimmed)) {
    return "名称不能使用 Windows 保留名称"
  }
  return null
}

function joinPath(parentPath: string, name: string) {
  return `${parentPath.replace(/[\\/]$/, "")}/${name}`
}

function collectFiles(node: FileNode, result: FileNode[] = []) {
  if (node.type === "file") {
    result.push(node)
    return result
  }

  for (const child of node.children ?? []) {
    collectFiles(child, result)
  }

  return result
}

function hasUnsavedDescendant(node: FileNode): boolean {
  return node.type === "file"
    ? Boolean(node.isDirty || node.isNew)
    : Boolean(node.children?.some(hasUnsavedDescendant))
}

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
  const identity = filePathIdentity(filePath)
  for (const node of nodes) {
    if (node.type === "folder" && filePathIdentity(node.filePath) === identity) return node
    if (node.children) {
      const found = findFolderByPath(node.children, filePath)
      if (found) return found
    }
  }
  return null
}

function findFileByPath(nodes: FileNode[], filePath?: string): FileNode | null {
  if (!filePath) return null
  const identity = filePathIdentity(filePath)
  for (const node of nodes) {
    if (node.type === "file" && filePathIdentity(node.filePath) === identity) return node
    if (node.children) {
      const found = findFileByPath(node.children, filePath)
      if (found) return found
    }
  }
  return null
}

function mergeRefreshedChildren(existing: FileNode[] = [], incoming: FileNode[]): FileNode[] {
  const existingByPath = new Map<string, FileNode>()
  const preservedUnsaved: FileNode[] = []

  for (const node of existing) {
    if (node.filePath) {
      existingByPath.set(filePathIdentity(node.filePath), node)
    }
  }

  const merged = incoming.map((incomingNode) => {
    const existingNode = incomingNode.filePath ? existingByPath.get(filePathIdentity(incomingNode.filePath)) : null

    if (!existingNode) {
      return incomingNode
    }

    if (incomingNode.type === "folder" && existingNode.type === "folder") {
      return {
        ...incomingNode,
        id: existingNode.id,
        children: existingNode.children ?? incomingNode.children,
        isExpanded: existingNode.isExpanded ?? incomingNode.isExpanded,
        isLoaded: existingNode.isLoaded ?? incomingNode.isLoaded,
        isLoading: false,
      }
    }

    if (incomingNode.type === "file" && existingNode.type === "file") {
      const shouldPreserveLoadedContent =
        existingNode.isDirty ||
        existingNode.isNew ||
        (existingNode.content !== undefined && existingNode.sourceModified != null)

      return {
        ...incomingNode,
        id: existingNode.id,
        content: shouldPreserveLoadedContent ? existingNode.content : incomingNode.content,
        sourceModified: shouldPreserveLoadedContent ? existingNode.sourceModified : incomingNode.sourceModified,
        isDirty: existingNode.isDirty ?? incomingNode.isDirty,
        hasExternalChanges: existingNode.hasExternalChanges ?? incomingNode.hasExternalChanges,
        isNew: existingNode.isNew ?? incomingNode.isNew,
        kind: existingNode.kind ?? incomingNode.kind,
        canEdit: existingNode.canEdit ?? incomingNode.canEdit,
        canSaveText: existingNode.canSaveText ?? incomingNode.canSaveText,
        editVersion: existingNode.editVersion ?? incomingNode.editVersion,
        savedVersion: existingNode.savedVersion ?? incomingNode.savedVersion,
      }
    }

    return incomingNode
  })

  const incomingPaths = new Set(incoming.map((node) => filePathIdentity(node.filePath)).filter(Boolean))
  for (const node of existing) {
    if (node.filePath && !incomingPaths.has(filePathIdentity(node.filePath)) && hasUnsavedDescendant(node)) {
      preservedUnsaved.push(node)
    }
  }

  return [...merged, ...preservedUnsaved]
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

          const shouldLoadContent =
            file.content === undefined ||
            (file.content === "" && file.sourceModified == null && !file.isDirty && !file.isNew)
          const modifiedChanged = shouldLoadContent || snapshot.modified !== file.sourceModified

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

  setFolderExpanded: (id: string, expanded: boolean) => {
    const updateExpanded = (nodes: FileNode[]): FileNode[] => nodes.map((node) => {
      if (node.id === id && node.type === "folder") {
        return { ...node, isExpanded: expanded }
      }
      return node.children ? { ...node, children: updateExpanded(node.children) } : node
    })

    set((state) => ({ files: updateExpanded(state.files) }))
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
    if (!normalizeFilePath(filePath)) return null
    const normalizedFilePath = filePathIdentity(filePath)

    const findInNodes = (nodes: FileNode[]): FileNode | null => {
      for (const node of nodes) {
        if (node.type === "file" && filePathIdentity(node.filePath) === normalizedFilePath) return node
        if (node.children) {
          const found = findInNodes(node.children)
          if (found) return found
        }
      }
      return null
    }
    return findInNodes(get().files)
  },

  findFolderByPath: (folderPath: string) => {
    return findFolderByPath(get().files, folderPath)
  },

  setFolderLoading: (id: string, isLoading: boolean) => {
    set((state) => ({
      files: updateFileInNodes(state.files, id, (node) => {
        if (node.type !== "folder") {
          return node
        }

        return { ...node, isLoading }
      }),
    }))
  },

  replaceFolderChildren: (id: string, children: FileNode[]) => {
    set((state) => ({
      files: updateFileInNodes(state.files, id, (node) => {
        if (node.type !== "folder") {
          return node
        }

        return {
          ...node,
          children: mergeRefreshedChildren(node.children, children),
          isLoaded: true,
          isLoading: false,
        }
      }),
    }))
  },

  activateFileById: (id: string) => {
    void get().setActiveFile(id)
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
      set((state) => ({
        files: updateFileInNodes(state.files, activeFileId, (node) => ({
          ...node,
          hasExternalChanges: true,
        })),
      }))
      toast.warning(`文件无法读取，已保留本地内容: ${file.name}`)
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
        editVersion: content === node.content ? getEditVersion(node) : getEditVersion(node) + 1,
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

  confirmCreate: async (name: string) => {
    const { creatingType, creatingParentId } = get()
    if (!creatingType || !name.trim()) {
      set({ creatingType: null, creatingParentId: null })
      return
    }

    const parentNode = creatingParentId ? get().findNodeById(creatingParentId) : null
    const parentPath = parentNode?.filePath || null
    const trimmedName = name.trim()
    const validationError = validateNodeName(trimmedName)

    if (validationError) {
      toast.error(`创建失败: ${validationError}`)
      return
    }

    const newPath = parentPath ? joinPath(parentPath, trimmedName) : undefined
    if (newPath && get().findNodeByPath(newPath)) {
      toast.error(`创建失败: 已存在同名文件: ${trimmedName}`)
      return
    }

    if (newPath && parentNode?.type === "folder") {
      try {
        if (creatingType === "folder") {
          await invoke("create_directory", { path: newPath })
        } else {
          await invoke("create_file", { path: newPath, content: "" })
        }
      } catch (error) {
        toast.error(`创建失败: ${error instanceof Error ? error.message : String(error)}`)
        return
      }
      invalidateDirectoryCache(parentPath ?? newPath)
    }

    const newNode: FileNode = {
      id: `${creatingType}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: trimmedName,
      type: creatingType,
      ...(creatingType === "folder"
        ? {
            isExpanded: false,
            children: [],
            filePath: newPath,
          }
        : {
            content: "",
            hasExternalChanges: false,
            isNew: !newPath,
            filePath: newPath,
            kind: getFileKind(newPath),
            canEdit: true,
            canSaveText: true,
            editVersion: 0,
            savedVersion: newPath ? 0 : -1,
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
    const validationError = validateNodeName(trimmedName)
    if (validationError) {
      toast.error(`重命名失败: ${validationError}`)
      return
    }
    if (trimmedName === node.name) {
      set({ renamingNodeId: null })
      return
    }

    // If node has a real file path, rename on disk
    if (node.filePath) {
      const segments = node.filePath.split(/[\\/]/)
      segments[segments.length - 1] = trimmedName
      const newPath = segments.join("/")
      const existingTarget = get().findNodeByPath(newPath)
      if (existingTarget && existingTarget.id !== id) {
        toast.error(`重命名失败: 已存在同名文件: ${trimmedName}`)
        set({ renamingNodeId: null })
        return
      }

      try {
        await invoke("rename_file", { oldPath: node.filePath, newPath })
        invalidateDirectoryCache(node.filePath)
        invalidateDirectoryCache(newPath)

        // Update this node and all children paths recursively
        const updatePaths = (n: FileNode, oldBase: string, newBase: string): FileNode => {
          const updated = { ...n }
          if (updated.filePath) {
            const normalizedOld = normalizeFilePath(oldBase).replace(/\\/g, "/").replace(/\/$/, "")
            const normalizedNew = normalizeFilePath(newBase).replace(/\\/g, "/").replace(/\/$/, "")
            const currentPath = normalizeFilePath(updated.filePath).replace(/\\/g, "/")
            updated.filePath = filePathIdentity(updated.filePath) === filePathIdentity(oldBase)
              ? normalizedNew
              : currentPath.startsWith(`${normalizedOld}/`)
                ? `${normalizedNew}${updated.filePath.slice(normalizedOld.length)}`
                : updated.filePath
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

  deleteNode: async (id: string, force = false) => {
    const node = get().findNodeById(id)
    if (!node) return false

    const unsavedFiles = collectFiles(node).filter((file) => file.isNew || file.isDirty)
    if (unsavedFiles.length > 0 && !force) {
      toast.error(`删除前请先处理 ${unsavedFiles.length} 个未保存文件`)
      return false
    }

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
        return false
      }
      invalidateDirectoryCache(node.filePath)
    }

    // Remove from tree
    get().removeNode(id, true)
    toast.success(`已删除: ${node.name}`, {
      style: { backgroundColor: "#22c55e", color: "#fff" },
    })
    return true
  },

  removeNode: (id: string, force = false) => {
    const { activeFileId } = get()
    const node = get().findNodeById(id)
    if (!node) return false

    const unsavedFiles = collectFiles(node).filter((file) => file.isNew || file.isDirty)
    if (unsavedFiles.length > 0 && !force) {
      toast.error(`移除前请先处理 ${unsavedFiles.length} 个未保存文件`)
      return false
    }

    const removedIds = new Set(collectFiles(node).map((file) => file.id))

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
    if (activeFileId === id || removedIds.has(activeFileId ?? "")) {
      set({ files: newFiles, activeFileId: null, content: "" })
      get().updateCounts("")
    } else {
      set({ files: newFiles })
    }
    return true
  },

  moveNode: async (nodeId: string, targetFolderId: string) => {
    const state = get()
    const nodeToMove = state.findNodeById(nodeId)
    const targetFolder = state.findNodeById(targetFolderId)
    if (!nodeToMove || !targetFolder || targetFolder.type !== "folder" || nodeToMove.id === targetFolder.id) return

    const containsId = (node: FileNode, id: string): boolean =>
      node.id === id || Boolean(node.children?.some((child) => containsId(child, id)))
    if (containsId(nodeToMove, targetFolderId)) {
      toast.error("不能将文件夹移动到自身或其子目录")
      return
    }

    const oldPath = nodeToMove.filePath
    const targetPath = targetFolder.filePath
    const newPath = oldPath && targetPath ? joinPath(targetPath, nodeToMove.name) : undefined
    if (newPath && filePathIdentity(newPath) === filePathIdentity(oldPath)) return

    if (newPath && oldPath) {
      try {
        await invoke("move_path", { oldPath, newPath })
      } catch (error) {
        toast.error(`移动失败: ${error instanceof Error ? error.message : String(error)}`)
        return
      }
      invalidateDirectoryCache(oldPath)
      invalidateDirectoryCache(newPath)
    }

    const updatePaths = (node: FileNode): FileNode => {
      const updated = { ...node }
      if (oldPath && newPath && updated.filePath) {
        const normalizedOld = normalizeFilePath(oldPath).replace(/\\/g, "/").replace(/\/$/, "")
        const normalizedNew = normalizeFilePath(newPath).replace(/\\/g, "/").replace(/\/$/, "")
        const currentPath = normalizeFilePath(updated.filePath).replace(/\\/g, "/")
        updated.filePath = filePathIdentity(updated.filePath) === filePathIdentity(oldPath)
          ? normalizedNew
          : currentPath.startsWith(`${normalizedOld}/`)
            ? `${normalizedNew}${updated.filePath.slice(normalizedOld.length)}`
            : updated.filePath
      }
      if (updated.children) updated.children = updated.children.map(updatePaths)
      return updated
    }

    const removeFromNodes = (nodes: FileNode[]): { nodes: FileNode[]; removed: FileNode | null } => {
      let removed: FileNode | null = null
      const next: FileNode[] = []
      for (const node of nodes) {
        if (node.id === nodeId) {
          removed = node
          continue
        }
        if (node.children) {
          const result = removeFromNodes(node.children)
          if (result.removed) removed = result.removed
          next.push({ ...node, children: result.nodes })
        } else {
          next.push(node)
        }
      }
      return { nodes: next, removed }
    }

    const removedResult = removeFromNodes(state.files)
    if (!removedResult.removed) return
    const moved = updatePaths(removedResult.removed)
    const addToTarget = (nodes: FileNode[]): FileNode[] => nodes.map((node) => {
      if (node.id === targetFolderId) {
        return { ...node, children: [...(node.children ?? []), moved], isExpanded: true, isLoaded: true }
      }
      return node.children ? { ...node, children: addToTarget(node.children) } : node
    })
    set({ files: addToTarget(removedResult.nodes) })
  },

  saveFile: async () => {
    const { activeFileId } = get()
    if (!activeFileId) return false

    const file = get().findNodeById(activeFileId)
    if (!file || file.type !== "file") return false
    if (!canSaveText(file)) {
      toast.info(`文件不可作为文本保存: ${file.name}`)
      return false
    }
    if (!file.filePath) {
      return get().saveFileAs()
    }

    const id = activeFileId
    try {
      await enqueueDocumentSave(id, async () => {
        const current = get().findNodeById(id)
        if (!current || current.type !== "file" || !current.filePath || !canSaveText(current)) {
          throw new Error("文件已不可保存")
        }

        const path = current.filePath
        const capturedVersion = getEditVersion(current)
        const capturedContent = current.content ?? ""
        suppressExternalChangeChecks(path)
        debugEditorLog("saveFile:start", {
          id,
          filePath: path,
          fileName: current.name,
          contentLength: capturedContent.length,
          capturedVersion,
        })

        const snapshot = await invoke<FileSnapshot>("write_file_atomic", {
          path,
          content: capturedContent,
          expectedModified: current.sourceModified,
        })

        set((state) => ({
          files: updateFileInNodes(state.files, id, (node) => {
            const currentVersion = getEditVersion(node)
            return {
              ...node,
              sourceModified: snapshot.modified,
              savedVersion: capturedVersion,
              isDirty: currentVersion !== capturedVersion,
              isNew: false,
              hasExternalChanges: false,
            }
          }),
        }))
        lastExternalChangeWarningKey = null
        toast.success(`已保存: ${current.name}`, {
          style: { backgroundColor: "#22c55e", color: "#fff" },
        })
      })
      return true
    } catch (error) {
      if (String(error).includes("conflict")) {
        set((state) => ({
          files: updateFileInNodes(state.files, id, (node) => ({ ...node, hasExternalChanges: true })),
        }))
      }
      toast.error(`保存失败: ${file.name}: ${error instanceof Error ? error.message : String(error)}`, {
        style: { backgroundColor: "#ef4444", color: "#fff" },
      })
      return false
    }
  },

  saveFileAs: async () => {
    const { activeFileId } = get()
    if (!activeFileId) return false

    const file = get().findNodeById(activeFileId)
    if (!file || file.type !== "file") return false
    if (!canSaveText(file)) {
      toast.info(`文件不可作为文本另存: ${file.name}`)
      return false
    }

    const selected = await save({
      filters: [{ name: "Text and Markdown", extensions: ["md", "markdown", "txt", "json", "yaml", "yml", "toml", "csv", "log", "xml", "ini", "env"] }],
      defaultPath: file.name,
    })
    if (!selected) return false

    const id = activeFileId
    const normalizedSelected = normalizeFilePath(selected)
    const existingTarget = get().findNodeByPath(normalizedSelected)
    if (existingTarget && existingTarget.id !== id) {
      toast.error(`另存失败: 文件已在编辑器中打开: ${existingTarget.name}`)
      return false
    }
    try {
      await enqueueDocumentSave(id, async () => {
        const current = get().findNodeById(id)
        if (!current || current.type !== "file" || !canSaveText(current)) {
          throw new Error("文件已不可保存")
        }

        const capturedVersion = getEditVersion(current)
        const capturedContent = current.content ?? ""
        suppressExternalChangeChecks(normalizedSelected)
        const snapshot = await invoke<FileSnapshot>("write_file_atomic", {
          path: normalizedSelected,
          content: capturedContent,
          expectedModified: null,
        })
        const newName = normalizedSelected.split(/[\\/]/).pop() || current.name

        set((state) => ({
          files: updateFileInNodes(state.files, id, (node) => ({
            ...node,
            filePath: normalizedSelected,
            name: newName,
            kind: getFileKind(normalizedSelected),
            canEdit: true,
            canSaveText: true,
            sourceModified: snapshot.modified,
            savedVersion: capturedVersion,
            isDirty: getEditVersion(node) !== capturedVersion,
            isNew: false,
            hasExternalChanges: false,
          })),
        }))
        lastExternalChangeWarningKey = null
        toast.success(`已保存: ${newName}`, {
          style: { backgroundColor: "#22c55e", color: "#fff" },
        })
      })
      return true
    } catch (error) {
      toast.error(`保存失败: ${normalizedSelected}: ${error instanceof Error ? error.message : String(error)}`, {
        style: { backgroundColor: "#ef4444", color: "#fff" },
      })
      return false
    }
  },

  saveFileById: async (id: string, forceOverwrite = false) => {
    const file = get().findNodeById(id)
    if (!file || file.type !== "file") return false
    if (!canSaveText(file)) {
      toast.info(`文件不可作为文本保存: ${file.name}`)
      return false
    }

    if (!file.filePath) {
      const selected = await save({
        filters: [{ name: "Text and Markdown", extensions: ["md", "markdown", "txt", "json", "yaml", "yml", "toml", "csv", "log", "xml", "ini", "env"] }],
        defaultPath: file.name,
      })
      if (!selected) return false

      const normalizedSelected = normalizeFilePath(selected)
      const existingTarget = get().findNodeByPath(normalizedSelected)
      if (existingTarget && existingTarget.id !== id) {
        toast.error(`保存失败: 文件已在编辑器中打开: ${existingTarget.name}`)
        return false
      }
      try {
        await enqueueDocumentSave(id, async () => {
          const current = get().findNodeById(id)
          if (!current || current.type !== "file" || !canSaveText(current)) {
            throw new Error("文件已不可保存")
          }

          const capturedVersion = getEditVersion(current)
          const capturedContent = current.content ?? ""
          suppressExternalChangeChecks(normalizedSelected)
          const snapshot = await invoke<FileSnapshot>("write_file_atomic", {
            path: normalizedSelected,
            content: capturedContent,
            expectedModified: null,
          })
          const newName = normalizedSelected.split(/[\\/]/).pop() || current.name

          set((state) => ({
            files: updateFileInNodes(state.files, id, (node) => ({
              ...node,
              filePath: normalizedSelected,
              name: newName,
              kind: getFileKind(normalizedSelected),
              canEdit: true,
              canSaveText: true,
              sourceModified: snapshot.modified,
              savedVersion: capturedVersion,
              isDirty: getEditVersion(node) !== capturedVersion,
              isNew: false,
              hasExternalChanges: false,
            })),
          }))
          lastExternalChangeWarningKey = null
          toast.success(`已保存: ${newName}`, {
            style: { backgroundColor: "#22c55e", color: "#fff" },
          })
        })
        return true
      } catch (error) {
        if (String(error).includes("conflict")) {
          set((state) => ({
            files: updateFileInNodes(state.files, id, (node) => ({ ...node, hasExternalChanges: true })),
          }))
        }
        toast.error(`保存失败: ${normalizedSelected}: ${error instanceof Error ? error.message : String(error)}`, {
          style: { backgroundColor: "#ef4444", color: "#fff" },
        })
        return false
      }
    }

    try {
      await enqueueDocumentSave(id, async () => {
        const current = get().findNodeById(id)
        if (!current || current.type !== "file" || !current.filePath || !canSaveText(current)) {
          throw new Error("文件已不可保存")
        }

        const currentPath = current.filePath
        const capturedVersion = getEditVersion(current)
        const capturedContent = current.content ?? ""
        suppressExternalChangeChecks(currentPath)
        const snapshot = await invoke<FileSnapshot>("write_file_atomic", {
          path: currentPath,
          content: capturedContent,
          expectedModified: forceOverwrite ? null : current.sourceModified,
        })

        set((state) => ({
          files: updateFileInNodes(state.files, id, (node) => {
            const currentVersion = getEditVersion(node)
            return {
              ...node,
              sourceModified: snapshot.modified,
              savedVersion: capturedVersion,
              isDirty: currentVersion !== capturedVersion,
              isNew: false,
              hasExternalChanges: false,
            }
          }),
        }))
        lastExternalChangeWarningKey = null
        toast.success(`已保存: ${current.name}`, {
          style: { backgroundColor: "#22c55e", color: "#fff" },
        })
      })
      return true
    } catch (error) {
      if (String(error).includes("conflict")) {
        set((state) => ({
          files: updateFileInNodes(state.files, id, (node) => ({ ...node, hasExternalChanges: true })),
        }))
      }
      toast.error(`保存失败: ${file.name}: ${error instanceof Error ? error.message : String(error)}`, {
        style: { backgroundColor: "#ef4444", color: "#fff" },
      })
      return false
    }
  },
  openFileFromPath: async (filePath: string, options: { activate?: boolean } = {}) => {
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
        if (options.activate !== false) {
          await get().setActiveFile(existingFile.id)
        }
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
        kind: getFileKind(normalizedFilePath),
        canEdit: !isPdf,
        canSaveText: !isPdf,
        editVersion: 0,
        savedVersion: 0,
      }

      set((state) => ({ files: [...state.files, newFile] }))
      if (options.activate !== false) {
        set({ activeFileId: newFile.id, content })
        get().updateCounts(isPdf ? "" : content)
      }

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

  getUnsavedFilesUnderNode: (id: string) => {
    const node = get().findNodeById(id)
    if (!node) return []
    return collectFiles(node).filter((file) => file.isNew || file.isDirty)
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
