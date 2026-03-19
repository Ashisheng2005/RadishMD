import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import type { ToolbarActions, ToolbarUiState } from './types'
import { SHORTCUT_GROUPS, TOOLBAR_ABOUT } from './toolbarConfig'

function ShortcutRow({ label, shortcut }: { label: string; shortcut: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span>{label}</span>
      <span className="text-muted-foreground">{shortcut}</span>
    </div>
  )
}

interface ToolbarDialogsProps {
  ui: ToolbarUiState
  actions: Pick<ToolbarActions, 'confirmInsertTable'>
}

export function ToolbarDialogs({ ui, actions }: ToolbarDialogsProps) {
  return (
    <>
      <Dialog open={ui.aboutDialogOpen} onOpenChange={ui.setAboutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{TOOLBAR_ABOUT.title}</DialogTitle>
            <DialogDescription>{TOOLBAR_ABOUT.description}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">版本: {TOOLBAR_ABOUT.version}</p>
            <p className="mt-2 text-sm text-muted-foreground">技术栈: {TOOLBAR_ABOUT.techStack}</p>
          </div>
          <DialogFooter>
            <Button onClick={() => ui.setAboutDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ui.shortcutsDialogOpen} onOpenChange={ui.setShortcutsDialogOpen}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>快捷键列表</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {SHORTCUT_GROUPS.map((group, groupIndex) => (
              <div key={group.title}>
                {groupIndex > 0 && <DropdownMenuSeparator />}
                <div className="mt-2 text-sm font-medium">{group.title}</div>
                <div className="space-y-1.5 pt-2">
                  {group.items.map(([label, shortcut]) => (
                    <ShortcutRow key={label} label={label} shortcut={shortcut} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => ui.setShortcutsDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ui.tableDialogOpen} onOpenChange={ui.setTableDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>插入表格</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-4">
              <label className="text-sm">行数:</label>
              <input
                type="number"
                min="2"
                max="10"
                value={ui.tableRows}
                onChange={(event) => ui.setTableRows(Number.parseInt(event.target.value, 10) || 3)}
                className="w-20 rounded border px-2 py-1"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="text-sm">列数:</label>
              <input
                type="number"
                min="2"
                max="10"
                value={ui.tableCols}
                onChange={(event) => ui.setTableCols(Number.parseInt(event.target.value, 10) || 3)}
                className="w-20 rounded border px-2 py-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => ui.setTableDialogOpen(false)}>取消</Button>
            <Button onClick={actions.confirmInsertTable}>插入</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}