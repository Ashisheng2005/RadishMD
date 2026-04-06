import { useEditorStore } from "@/lib/editor-store"
import { SplitEditor } from "./split-editor"
import { WysiwygEditor } from "./wysiwyg-editor"

export function EditorArea() {
  const { editMode, contentType } = useEditorStore()

  // PDF files always use SplitEditor with render mode
  if (contentType === "pdf") {
    return <SplitEditor />
  }

  return editMode === "split" ? <SplitEditor /> : <WysiwygEditor />
}
