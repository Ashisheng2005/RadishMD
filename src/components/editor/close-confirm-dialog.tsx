import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FileText } from "lucide-react"

interface CloseConfirmDialogProps {
  open: boolean
  unsavedFiles: { id: string; name: string }[]
  onConfirm: () => void
  onCancel: () => void
}

export function CloseConfirmDialog({
  open,
  unsavedFiles,
  onConfirm,
  onCancel,
}: CloseConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>关闭确认</DialogTitle>
          <DialogDescription className="sr-only">
            确认是否要关闭应用程序
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground mb-3">
            以下文件有未保存的更改，关闭后更改将丢失：
          </p>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {unsavedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-2 text-sm bg-muted/50 rounded px-3 py-2"
              >
                <FileText className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="truncate">{file.name}</span>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            确定关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
