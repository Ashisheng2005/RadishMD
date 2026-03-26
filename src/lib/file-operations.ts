import { open } from "@tauri-apps/plugin-dialog"
import { readFileSnapshot, FileNode, useEditorStore } from "./editor-store"

export async function importFiles(): Promise<void> {
  const selected = await open({
    multiple: true,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  })
  if (!selected) return

  const newFiles: FileNode[] = []
  for (const filePath of selected as string[]) {
    const { content, modified } = await readFileSnapshot(filePath)
    const name = filePath.split(/[\\/]/).pop() || filePath
    newFiles.push({
      id: `import-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      type: "file",
      content,
      filePath,
      sourceModified: modified,
    })
  }

  const store = useEditorStore.getState()
  store.addFiles(newFiles)
  if (newFiles.length > 0) {
    void store.setActiveFile(newFiles[0].id)
  }
}
