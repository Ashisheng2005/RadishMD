import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useEditorStore } from "@/lib/editor-store"

export function MissingTabDialog() {
  const prompt = useEditorStore((state) => state.missingTabPrompt)
  const confirmDeleteMissingTab = useEditorStore((state) => state.confirmDeleteMissingTab)
  const dismissMissingTabPrompt = useEditorStore((state) => state.dismissMissingTabPrompt)

  const dismiss = () => {
    const closingId = prompt?.id
    if (!closingId) {
      return
    }
    const current = useEditorStore.getState().missingTabPrompt
    if (!current || current.id !== closingId) {
      return
    }
    dismissMissingTabPrompt()
  }

  return (
    <AlertDialog open={Boolean(prompt)} onOpenChange={(open) => { if (!open) dismiss() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{prompt?.name ?? "文档"}</AlertDialogTitle>
          <AlertDialogDescription>文档不存在，是否删除标签？</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>否</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              confirmDeleteMissingTab()
            }}
          >
            是
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
