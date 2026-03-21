import { useEditorStore } from "@/lib/editor-store"
import { SplitEditor } from "./split-editor"
import { WysiwygEditor } from "./wysiwyg-editor"

export function EditorArea() {
  const { editMode } = useEditorStore()

  return editMode === "split" ? <SplitEditor /> : <WysiwygEditor />
}
