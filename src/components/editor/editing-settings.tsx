import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { useEditorStore } from "@/lib/editor-store"

export function EditingSettings() {
  const pasteClipboardUrlOnLink = useEditorStore((state) => state.pasteClipboardUrlOnLink)
  const setPasteClipboardUrlOnLink = useEditorStore((state) => state.setPasteClipboardUrlOnLink)

  return (
    <FieldGroup className="max-w-lg gap-4">
      <Field orientation="horizontal" className="items-start rounded-lg border bg-muted/20 p-3">
        <FieldContent>
          <FieldLabel htmlFor="paste-clipboard-url">插入链接时使用剪贴板</FieldLabel>
          <FieldDescription className="text-xs">
            打开后，用剪贴板当前文本替换链接中的 url。读取失败时仍插入占位符。默认关闭。
          </FieldDescription>
        </FieldContent>
        <Switch
          id="paste-clipboard-url"
          checked={pasteClipboardUrlOnLink}
          onCheckedChange={setPasteClipboardUrlOnLink}
          aria-label="插入链接时使用剪贴板"
        />
      </Field>

      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="text-sm font-medium text-foreground">插入图片</div>
        <p className="mt-1 text-xs leading-normal text-muted-foreground">
          触发后打开文件选择框。选定图片后写入路径，取消则不插入。已保存的文档使用相对路径。
        </p>
      </div>
    </FieldGroup>
  )
}
