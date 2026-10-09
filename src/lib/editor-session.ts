import { invoke } from "@tauri-apps/api/core"
import { isTauriRuntime } from "./runtime"

export interface PersistedEditorSession {
  version: 1
  rootPaths: string[]
  activeFilePath: string | null
  expandedFolderPaths: string[]
  scrollPositions: Record<string, { editor: number; preview: number }>
  isSidebarOpen: boolean
  isOutlineOpen: boolean
  editMode: "split" | "wysiwyg"
  splitViewMode: "split" | "editor" | "render"
}

export async function loadEditorSession(): Promise<PersistedEditorSession | null> {
  if (!isTauriRuntime()) {
    return null
  }

  const raw = await invoke<string | null>("load_editor_session")
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedEditorSession>
    if (parsed.version !== 1 || !Array.isArray(parsed.rootPaths)) {
      return null
    }

    return {
      version: 1,
      rootPaths: parsed.rootPaths.filter((path): path is string => typeof path === "string"),
      activeFilePath: typeof parsed.activeFilePath === "string" ? parsed.activeFilePath : null,
      expandedFolderPaths: Array.isArray(parsed.expandedFolderPaths)
        ? parsed.expandedFolderPaths.filter((path): path is string => typeof path === "string")
        : [],
      scrollPositions: parsed.scrollPositions && typeof parsed.scrollPositions === "object"
        ? parsed.scrollPositions
        : {},
      isSidebarOpen: parsed.isSidebarOpen !== false,
      isOutlineOpen: parsed.isOutlineOpen !== false,
      editMode: parsed.editMode === "wysiwyg" ? "wysiwyg" : "split",
      splitViewMode: parsed.splitViewMode === "editor" || parsed.splitViewMode === "render"
        ? parsed.splitViewMode
        : "split",
    }
  } catch {
    return null
  }
}

let sessionWriteQueue: Promise<void> = Promise.resolve()
let lastSavedContent: string | null = null

export async function saveEditorSession(session: PersistedEditorSession) {
  if (!isTauriRuntime()) {
    return
  }

  // Capture now, but compare after earlier writes finish (including A -> B -> A).
  const content = JSON.stringify(session)
  const write = sessionWriteQueue.catch(() => undefined).then(async () => {
    if (content === lastSavedContent) return
    await invoke("save_editor_session", { content })
    lastSavedContent = content
  })
  sessionWriteQueue = write
  await write
}
