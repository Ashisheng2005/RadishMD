import { open } from "@tauri-apps/plugin-dialog"
import { readFileSnapshot, FileNode, useEditorStore } from "./editor-store"

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
  const selected = await open({
    multiple: true,
    filters: [
      { name: "Text and Markdown", extensions: textFileExtensions },
      { name: "Markdown", extensions: ["md", "markdown"] },
      { name: "JSON", extensions: ["json", "jsonc"] },
    ],
  })
  if (!selected) return

  const selectedFiles = Array.isArray(selected) ? selected : [selected]
  const store = useEditorStore.getState()
  const newFiles: FileNode[] = []
  const seenPaths = new Set<string>()
  let duplicateActivationTargetId: string | null = null
  let newActivationTargetId: string | null = null

  for (const filePath of selectedFiles) {
    if (seenPaths.has(filePath)) {
      continue
    }

    const existingFile = store.findNodeByPath(filePath)
    if (existingFile) {
      if (!duplicateActivationTargetId) {
        duplicateActivationTargetId = existingFile.id
      }
      seenPaths.add(filePath)
      continue
    }

    const { content, modified } = await readFileSnapshot(filePath)
    const name = filePath.split(/[\\/]/).pop() || filePath
    const newFile: FileNode = {
      id: `import-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      type: "file",
      content,
      filePath,
      sourceModified: modified,
    }

    newFiles.push(newFile)
    seenPaths.add(filePath)

    if (!newActivationTargetId) {
      newActivationTargetId = newFile.id
    }
  }

  if (newFiles.length > 0) {
    store.addFiles(newFiles)
  }

  const activationTargetId = duplicateActivationTargetId ?? newActivationTargetId
  if (activationTargetId) {
    void store.activateFileById(activationTargetId)

    const activationTargetPath =
      store.findNodeById(activationTargetId)?.filePath ??
      selectedFiles.find((filePath) => {
        const existingFile = store.findNodeByPath(filePath)
        return existingFile?.id === activationTargetId
      }) ??
      null

    if (activationTargetPath && shouldUseEditorOnlyMode(activationTargetPath)) {
      store.setEditMode("split")
      store.setSplitViewMode("editor")
    }
  }
}
