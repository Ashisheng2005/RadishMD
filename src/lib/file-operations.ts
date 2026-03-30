import { open } from "@tauri-apps/plugin-dialog"
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

export async function importFiles(): Promise<void> {
  console.log("[RadishMD][import] open dialog start")
  const selected = await open({
    multiple: true,
    filters: [
      { name: "Text and Markdown", extensions: textFileExtensions },
      { name: "Markdown", extensions: ["md", "markdown"] },
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

    const { content, modified } = await readFileSnapshot(normalizedFilePath)
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

    const activationTargetPath =
      store.findNodeById(activationTargetId)?.filePath ??
      selectedFiles.find((filePath) => {
        const existingFile = store.findNodeByPath(normalizeFilePath(filePath))
        return existingFile?.id === activationTargetId
      }) ??
      null

    if (activationTargetPath && shouldUseEditorOnlyMode(activationTargetPath)) {
      store.setEditMode("split")
      store.setSplitViewMode("editor")
    }
  }
}
