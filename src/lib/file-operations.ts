import { open } from "@tauri-apps/plugin-dialog"
import { invoke } from "@tauri-apps/api/core"
import { FileNode, useEditorStore } from "./editor-store"

export async function importFiles(): Promise<void> {
  const selected = await open({
    multiple: true,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  })
  if (!selected) return

  const newFiles: FileNode[] = []
  for (const filePath of selected as string[]) {
    const content = await invoke<string>("read_file", { path: filePath })
    const name = await invoke<string>("get_file_name", { filePath })
    newFiles.push({
      id: `import-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      type: "file",
      content,
      filePath,
    })
  }
  useEditorStore.getState().addFiles(newFiles)
}
