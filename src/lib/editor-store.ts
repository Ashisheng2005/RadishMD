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
}

interface EditorState {
  files: FileNode[]
  activeFileId: string | null
  content: string
  isSidebarOpen: boolean
  isOutlineOpen: boolean
  theme: "light" | "dark"
  editMode: "split" | "wysiwyg"
  wordCount: number
  charCount: number
  creatingType: "file" | "folder" | null
  setActiveFile: (id: string) => void
  setContent: (content: string) => void
  toggleSidebar: () => void
  toggleOutline: () => void
  toggleTheme: () => void
  toggleEditMode: () => void
  toggleFolder: (id: string) => void
  updateCounts: (content: string) => void
  addFiles: (files: FileNode[]) => void
  findNodeById: (id: string) => FileNode | null
  startCreating: (type: "file" | "folder") => void
  confirmCreate: (name: string) => void
  cancelCreate: () => void
  moveNode: (nodeId: string, targetFolderId: string) => void
  saveFile: () => Promise<void>
  saveFileAs: () => Promise<void>
  openFileFromPath: (filePath: string) => Promise<void>
}

const initialFiles: FileNode[] = []

export const useEditorStore = create<EditorState>((set, get) => ({
  files: initialFiles,
  activeFileId: null,
  content: "",
  isSidebarOpen: true,
  isOutlineOpen: true,
  theme: "dark",
  editMode: "split",
  wordCount: 0,
  charCount: 0,
  creatingType: null,

  setActiveFile: (id: string) => {
    const findFile = (nodes: FileNode[]): FileNode | null => {
      for (const node of nodes) {
        if (node.id === id && node.type === "file") return node
        if (node.children) {
          const found = findFile(node.children)
          if (found) return found
        }
      }
      return null
    }
    const file = findFile(get().files)
    if (file) {
      set({ activeFileId: id, content: file.content || "" })
      get().updateCounts(file.content || "")
    }
  },

  setContent: (content: string) => {
    set({ content })
    get().updateCounts(content)
  },

  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  toggleOutline: () => set((state) => ({ isOutlineOpen: !state.isOutlineOpen })),
  toggleTheme: () =>
    set((state) => ({ theme: state.theme === "light" ? "dark" : "light" })),
  toggleEditMode: () =>
    set((state) => ({ editMode: state.editMode === "split" ? "wysiwyg" : "split" })),

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
      ...(creatingType === "folder" ? { isExpanded: false, children: [] } : { content: "" }),
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
      await get().saveFileAs()
      return
    }

    // Direct save
    try {
      await invoke("write_file", { path: file.filePath, content })
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
      await invoke("write_file", { path: selected, content })

      // Update file path and name in store
      const newName = selected.split(/[\\/]/).pop() || file.name
      const updateFilePath = (nodes: FileNode[]): FileNode[] => {
        return nodes.map((node) => {
          if (node.id === activeFileId) {
            return { ...node, filePath: selected, name: newName }
          }
          if (node.children) {
            return { ...node, children: updateFilePath(node.children) }
          }
          return node
        })
      }
      set((state) => ({ files: updateFilePath(state.files) }))
      toast.success(`已保存: ${newName}`, {
        style: { backgroundColor: "#22c55e", color: "#fff" },
      })
    } catch (e) {
      toast.error(`保存失败: ${selected}`, {
        style: { backgroundColor: "#ef4444", color: "#fff" },
      })
    }
  },

  openFileFromPath: async (filePath: string) => {
    try {
      const content = await invoke<string>("read_file", { path: filePath })
      const fileName = await invoke<string>("get_file_name", { filePath })

      const newFile: FileNode = {
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: fileName,
        type: "file",
        content,
        filePath,
      }

      set((state) => ({ files: [...state.files, newFile] }))
      set({ activeFileId: newFile.id, content })
      get().updateCounts(content)

      toast.success(`已打开: ${fileName}`, {
        style: { backgroundColor: "#22c55e", color: "#fff" },
      })
    } catch (e) {
      toast.error(`打开失败: ${filePath}`, {
        style: { backgroundColor: "#ef4444", color: "#fff" },
      })
    }
  },
}))
