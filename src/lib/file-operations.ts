import { open } from "@tauri-apps/plugin-dialog"
import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import { normalizeFilePath, readFileSnapshot, FileNode, useEditorStore } from "./editor-store"

const textFileExtensions = [
  "md",
  "markdown",
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

function buildTreeFromFlatPaths(filePaths: string[]): FileNode[] {
  const sortedPaths = [...filePaths].sort()
  const folderMap = new Map<string, FileNode>()
  const rootNodes: FileNode[] = []

  for (const filePath of sortedPaths) {
    const normalizedFilePath = normalizeFilePath(filePath)
    const segments = normalizedFilePath.split(/[\\/]/)
    const fileName = segments.pop()!
    const dirSegments = segments

    let parentNodes = rootNodes
    let currentPath = ""

    for (const segment of dirSegments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment

      let folder = folderMap.get(currentPath)
      if (!folder) {
        folder = {
          id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: segment,
          type: "folder",
          filePath: currentPath,
          children: [],
          isExpanded: true,
        }
        folderMap.set(currentPath, folder)
        parentNodes.push(folder)
      }
      parentNodes = folder.children!
    }

    const fileNode: FileNode = {
      id: `open-folder-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: fileName,
      type: "file",
      content: "",
      filePath: normalizedFilePath,
      sourceModified: null,
    }
    parentNodes.push(fileNode)
  }

  return rootNodes
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

  const store = useEditorStore.getState()

  const allFiles: string[] = await invoke("read_directory", { path: folderPath })
  console.log("[RadishMD][openFolder] files found", { count: allFiles.length })

  const supportedFiles = allFiles.filter((filePath) => {
    const ext = getFileExtension(filePath)
    return textFileExtensions.includes(ext)
  })

  if (supportedFiles.length === 0) {
    console.log("[RadishMD][openFolder] no supported files found")
    return
  }

  supportedFiles.sort()
  const newFilePaths: string[] = []
  const seenPaths = new Set<string>()

  for (const filePath of supportedFiles) {
    const normalizedPath = normalizeFilePath(filePath)
    if (seenPaths.has(normalizedPath)) continue
    seenPaths.add(normalizedPath)

    const existingFile = store.findNodeByPath(normalizedPath)
    if (!existingFile) {
      newFilePaths.push(normalizedPath)
    }
  }

  if (newFilePaths.length === 0) {
    console.log("[RadishMD][openFolder] all files already exist in tree")
    return
  }

  const treeNodes = buildTreeFromFlatPaths(newFilePaths)

  let firstFileId: string | null = null

  async function readTreeContent(nodes: FileNode[]): Promise<void> {
    for (const node of nodes) {
      if (node.type === "file" && node.filePath) {
        const snapshot = await readFileSnapshot(node.filePath)
        node.content = snapshot.content
        node.sourceModified = snapshot.modified

        if (!firstFileId) {
          firstFileId = node.id
        }
      }
      if (node.children) {
        await readTreeContent(node.children)
      }
    }
  }
  await readTreeContent(treeNodes)

  store.addTreeNodes(treeNodes)

  if (firstFileId) {
    void store.activateFileById(firstFileId)
    store.setShouldResetScroll(true)

    const targetPath = store.findNodeById(firstFileId)?.filePath ?? null
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
    void store.activateFileById(activationTargetId)
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
