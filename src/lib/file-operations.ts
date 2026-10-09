import { open } from "@tauri-apps/plugin-dialog"
import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import { filePathIdentity, normalizeFilePath, readFileSnapshot, FileNode, useEditorStore } from "./editor-store"
import {
  getCachedDirectoryEntries,
  invalidateDirectoryCache,
  setCachedDirectoryEntries,
  type CachedDirectoryEntry,
} from "./directory-cache"

type DirectoryEntry = CachedDirectoryEntry

const textFileExtensions = [
  "md",
  "markdown",
  "pdf",
  "txt",
  "text",
  "json",
  "jsonc",
  "yaml",
  "yml",
  "toml",
  "csv",
  "log",
  "xml",
  "ini",
  "env",
]

function getFileExtension(filePath: string) {
  const fileName = filePath.split(/[\\/]/).pop() || filePath
  const lastDotIndex = fileName.lastIndexOf(".")

  if (lastDotIndex === -1) {
    return ""
  }

  return fileName.slice(lastDotIndex + 1).toLowerCase()
}

function shouldUseEditorOnlyMode(filePath: string) {
  const extension = getFileExtension(filePath)
  return extension !== "md" && extension !== "markdown"
}

function getPathSegments(filePath: string) {
  return normalizeFilePath(filePath).split(/[\\/]/).filter(Boolean)
}

function getBaseName(filePath: string) {
  const segments = getPathSegments(filePath)
  return segments[segments.length - 1] || normalizeFilePath(filePath)
}

function isSupportedFile(filePath: string) {
  return textFileExtensions.includes(getFileExtension(filePath))
}

function createNodeFromEntry(entry: DirectoryEntry): FileNode | null {
  const normalizedPath = normalizeFilePath(entry.path)

  if (entry.is_directory) {
    return {
      id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: entry.name,
      type: "folder",
      filePath: normalizedPath,
      children: [],
      isExpanded: false,
      isLoaded: false,
      isLoading: false,
    }
  }

  if (!isSupportedFile(normalizedPath)) {
    return null
  }

  return {
    id: `open-folder-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: entry.name,
    type: "file",
    filePath: normalizedPath,
    isDirty: false,
    hasExternalChanges: false,
    kind: normalizedPath.toLowerCase().endsWith(".pdf")
      ? "pdf"
      : ["md", "markdown"].includes(getFileExtension(normalizedPath))
        ? "markdown"
        : "text",
    canEdit: !normalizedPath.toLowerCase().endsWith(".pdf"),
    canSaveText: !normalizedPath.toLowerCase().endsWith(".pdf"),
    editVersion: 0,
    savedVersion: 0,
  }
}

function sortNodes(nodes: FileNode[]) {
  return [...nodes].sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "folder" ? -1 : 1
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  })
}

export async function loadFolderChildren(folderId: string, options: { force?: boolean; throwOnError?: boolean } = {}): Promise<FileNode[]> {
  const store = useEditorStore.getState()
  const folder = store.findNodeById(folderId)

  if (!folder || folder.type !== "folder" || !folder.filePath) {
    return []
  }

  store.setFolderLoading(folderId, true)

  try {
    const normalizedPath = normalizeFilePath(folder.filePath)
    const cachedEntries = options.force ? null : getCachedDirectoryEntries(normalizedPath)
    const entries = cachedEntries ?? await invoke<DirectoryEntry[]>("read_directory_entries", {
      path: normalizedPath,
    })
    if (!cachedEntries) {
      setCachedDirectoryEntries(normalizedPath, entries)
    }
    const children = sortNodes(entries.map(createNodeFromEntry).filter((node): node is FileNode => Boolean(node)))

    const latestStore = useEditorStore.getState()
    latestStore.replaceFolderChildren(folderId, children)
    const refreshedFolder = useEditorStore.getState().findNodeById(folderId)
    return refreshedFolder?.children ?? children
  } catch (error) {
    useEditorStore.getState().setFolderLoading(folderId, false)
    console.error("[RadishMD][openFolder] load children failed", error)
    if (options.throwOnError) throw error
    return []
  }
}

export async function openFolder(): Promise<void> {
  console.log("[RadishMD][openFolder] open dialog start")
  const selected = await open({
    directory: true,
    multiple: false,
  })
  if (!selected) {
    console.log("[RadishMD][openFolder] cancelled")
    return
  }

  const folderPath = Array.isArray(selected) ? selected[0] : selected
  console.log("[RadishMD][openFolder] selected", { folderPath })

  await openFolderPath(folderPath)
}

export async function openFolderPath(
  folderPath: string,
  options: { activateFirstFile?: boolean; forceReload?: boolean } = {},
): Promise<void> {
  const normalizedFolderPath = normalizeFilePath(folderPath)
  const store = useEditorStore.getState()

  store.addTreeNodes([
    {
      id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: getBaseName(normalizedFolderPath),
      type: "folder",
      filePath: normalizedFolderPath,
      children: [],
      isExpanded: true,
      isLoaded: false,
      isLoading: false,
    },
  ])

  const rootFolder = useEditorStore.getState().findFolderByPath(normalizedFolderPath)
  if (!rootFolder) {
    return
  }

  const children = await loadFolderChildren(rootFolder.id, { force: options.forceReload !== false })
  const firstFile = children.find((node) => node.type === "file")

  if (firstFile && options.activateFirstFile !== false) {
    await useEditorStore.getState().setActiveFile(firstFile.id)
    store.setShouldResetScroll(true)

    const targetPath = firstFile.filePath ?? null
    if (
      targetPath &&
      shouldUseEditorOnlyMode(targetPath) &&
      !targetPath.toLowerCase().endsWith(".pdf")
    ) {
      store.setEditMode("split")
      store.setSplitViewMode("editor")
    }
  }
}

export async function openExternalPath(
  path: string,
  options: { activate?: boolean; forceReload?: boolean } = {},
): Promise<void> {
  const normalizedPath = normalizeFilePath(path)
  const isDirectory = await invoke<boolean>("is_directory", { path: normalizedPath })

  if (isDirectory) {
    await openFolderPath(normalizedPath, {
      activateFirstFile: options.activate !== false,
      forceReload: options.forceReload,
    })
    return
  }

  await useEditorStore.getState().openFileFromPath(normalizedPath, { activate: options.activate !== false })
}

export async function restoreExpandedFolders(folderPaths: string[]) {
  const normalizedPaths = [...new Set(folderPaths.map(normalizeFilePath).filter(Boolean))]
    .sort((left, right) => left.split(/[\\/]/).length - right.split(/[\\/]/).length)

  for (const folderPath of normalizedPaths) {
    const folder = await ensureTreeNodeByPath(folderPath, "folder")
    if (!folder) {
      continue
    }

    if (!folder.isLoaded) {
      await loadFolderChildren(folder.id)
    }

    useEditorStore.getState().setFolderExpanded(folder.id, true)
  }
}

// Load just the path's ancestors, without changing their expanded state.
export async function ensureTreeNodeByPath(path: string, type: FileNode["type"] = "file"): Promise<FileNode | null> {
  const key = filePathIdentity(path)
  const find = () => type === "file"
    ? useEditorStore.getState().findNodeByPath(path)
    : useEditorStore.getState().findFolderByPath(path)
  const existing = find()
  if (existing) return existing

  const containsPath = (node: FileNode) => {
    const folderKey = filePathIdentity(node.filePath)
    return node.type === "folder" && Boolean(folderKey) &&
      key.startsWith(folderKey.endsWith("/") ? folderKey : `${folderKey}/`)
  }
  let folder = useEditorStore.getState().files.filter(containsPath)
    .sort((left, right) => (right.filePath?.length ?? 0) - (left.filePath?.length ?? 0))[0]
  while (folder) {
    const children = folder.isLoaded ? folder.children ?? [] : await loadFolderChildren(folder.id)
    const found = find()
    if (found) return found
    folder = children.find(containsPath)!
  }
  return null
}

export async function refreshFolder(folderId: string): Promise<void> {
  const folder = useEditorStore.getState().findNodeById(folderId)
  if (!folder || folder.type !== "folder" || !folder.filePath) return
  invalidateDirectoryCache(folder.filePath)
  // Refresh already loaded descendants too; leave unvisited folders lazy.
  const refresh = async (id: string): Promise<void> => {
    const children = await loadFolderChildren(id, { force: true, throwOnError: true })
    for (const child of children) {
      if (child.type === "folder" && child.isLoaded) await refresh(child.id)
    }
  }
  await refresh(folderId)
}

export function invalidateFolderCacheForPath(path: string) {
  invalidateDirectoryCache(normalizeFilePath(path))
}

export async function importFiles(): Promise<void> {
  console.log("[RadishMD][import] open dialog start")
  const selected = await open({
    multiple: true,
    filters: [
      { name: "Text and Markdown", extensions: textFileExtensions },
      { name: "Markdown", extensions: ["md", "markdown"] },
      { name: "PDF", extensions: ["pdf"] },
      { name: "JSON", extensions: ["json", "jsonc"] },
    ],
  })
  if (!selected) {
    console.log("[RadishMD][import] cancelled")
    return
  }

  const selectedFiles = Array.isArray(selected) ? selected : [selected]
  console.log("[RadishMD][import] selected", { selectedFiles })
  const store = useEditorStore.getState()
  const newFiles: FileNode[] = []
  const seenPaths = new Set<string>()
  let duplicateActivationTargetId: string | null = null
  let newActivationTargetId: string | null = null

  for (const filePath of selectedFiles) {
    const normalizedFilePath = normalizeFilePath(filePath)

    console.log("[RadishMD][import] candidate", {
      filePath,
      normalizedFilePath,
    })

    if (seenPaths.has(normalizedFilePath)) {
      console.log("[RadishMD][import] duplicate skipped", { normalizedFilePath })
      continue
    }

    const existingFile = store.findNodeByPath(normalizedFilePath)
    if (existingFile) {
      console.log("[RadishMD][import] existing file reused", {
        normalizedFilePath,
        existingFileId: existingFile.id,
      })
      if (!duplicateActivationTargetId) {
        duplicateActivationTargetId = existingFile.id
      }
      seenPaths.add(normalizedFilePath)
      continue
    }

    const isPdf = normalizedFilePath.toLowerCase().endsWith(".pdf")
    let content: string
    let modified: number | null = null

    if (isPdf) {
      content = convertFileSrc(normalizedFilePath)
    } else {
      const snapshot = await readFileSnapshot(normalizedFilePath)
      content = snapshot.content
      modified = snapshot.modified
    }

    const name = normalizedFilePath.split(/[\\/]/).pop() || normalizedFilePath
    const newFile: FileNode = {
      id: `import-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      type: "file",
      content,
      filePath: normalizedFilePath,
      sourceModified: modified,
      kind: isPdf ? "pdf" : ["md", "markdown"].includes(getFileExtension(normalizedFilePath)) ? "markdown" : "text",
      canEdit: !isPdf,
      canSaveText: !isPdf,
      editVersion: 0,
      savedVersion: 0,
    }

    newFiles.push(newFile)
    console.log("[RadishMD][import] imported", {
      normalizedFilePath,
      newFileId: newFile.id,
      contentLength: content.length,
    })
    seenPaths.add(normalizedFilePath)

    if (!newActivationTargetId) {
      newActivationTargetId = newFile.id
    }
  }

  if (newFiles.length > 0) {
    console.log("[RadishMD][import] addFiles", { count: newFiles.length })
    store.addFiles(newFiles)
  }

  const activationTargetId = duplicateActivationTargetId ?? newActivationTargetId
  if (activationTargetId) {
    console.log("[RadishMD][import] activation target", { activationTargetId })
    void store.setActiveFile(activationTargetId)
    store.setShouldResetScroll(true)

    const activationTargetPath =
      store.findNodeById(activationTargetId)?.filePath ??
      selectedFiles.find((filePath) => {
        const existingFile = store.findNodeByPath(normalizeFilePath(filePath))
        return existingFile?.id === activationTargetId
      }) ??
      null

    if (activationTargetPath && shouldUseEditorOnlyMode(activationTargetPath) && !activationTargetPath.toLowerCase().endsWith(".pdf")) {
      store.setEditMode("split")
      store.setSplitViewMode("editor")
    }
  }
}
