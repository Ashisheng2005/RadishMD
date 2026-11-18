import { invoke } from "@tauri-apps/api/core"
import { save } from "@tauri-apps/plugin-dialog"
import { toast } from "sonner"
import { fileNeedsDiskLoad, useEditorStore } from "@/lib/editor-store"
import { isTauriRuntime } from "@/lib/runtime"
import { buildExportFragment, wrapExportDocument } from "@/lib/export-html"

const EXPORT_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown"] },
  { name: "文本", extensions: ["txt"] },
  { name: "HTML", extensions: ["html"] },
  { name: "PDF", extensions: ["pdf"] },
]

function extensionOf(path: string) {
  const name = path.split(/[\\/]/).pop() ?? ""
  const dot = name.lastIndexOf(".")
  if (dot <= 0) return ""
  return name.slice(dot + 1).toLowerCase()
}

function exportError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function writeTextCopy(path: string, content: string) {
  await invoke("write_file_atomic", {
    path,
    content,
    expectedModified: null,
  })
}

async function renderExport(fragment: string) {
  return invoke<string>("prepare_export_preview", { html: fragment })
}

export async function exportActiveFile() {
  if (!isTauriRuntime()) {
    toast.info("请在桌面应用中另存为")
    return
  }

  const store = useEditorStore.getState()
  const file = store.activeFileId ? store.findNodeById(store.activeFileId) : null
  if (!file || file.type !== "file") {
    toast.info("没有可另存的文件")
    return
  }
  if (file.kind === "pdf" || file.filePath?.toLowerCase().endsWith(".pdf")) {
    toast.info("PDF 文件不能另存为")
    return
  }

  const selected = await save({
    filters: EXPORT_FILTERS,
    defaultPath: file.name,
  })
  if (!selected) return

  const extension = extensionOf(selected)
  if (!extension) {
    toast.error("另存失败: 请选择文件格式")
    return
  }
  if (store.findNodeByPath(selected)) {
    toast.error("另存失败: 文件已在编辑器中打开")
    return
  }

  const current = useEditorStore.getState().findNodeById(file.id)
  if (!current || current.type !== "file") {
    toast.info("没有可另存的文件")
    return
  }
  if (fileNeedsDiskLoad(current)) {
    toast.info("文件尚未加载完成")
    return
  }
  const content = current.content ?? ""
  let previewOpen = false
  try {
    if (extension === "txt" || extension === "md" || extension === "markdown") {
      await writeTextCopy(selected, content)
    } else if (extension === "html" || extension === "pdf") {
      const fragment = await buildExportFragment(content, file.filePath ?? null)
      const article = await renderExport(fragment)
      previewOpen = true
      if (extension === "html") {
        await writeTextCopy(selected, await wrapExportDocument(article))
      } else {
        await invoke("export_pdf", { path: selected })
        previewOpen = false
      }
    } else {
      toast.error(`另存失败: 不支持的格式 .${extension}`)
      return
    }
    toast.success("已导出")
  } catch (error) {
    toast.error(`另存失败: ${exportError(error)}`)
  } finally {
    if (previewOpen) {
      await invoke("close_export_preview").catch(() => {})
    }
  }
}
