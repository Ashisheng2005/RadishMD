import { useState } from "react"
import { Info, Palette, PenLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { AppearanceSettings } from "./appearance-settings"
import { EditingSettings } from "./editing-settings"

type SettingsSection = "appearance" | "editing" | "about"

const SECTIONS: Array<{ id: SettingsSection; label: string; icon: typeof Palette }> = [
  { id: "appearance", label: "外观", icon: Palette },
  { id: "editing", label: "编辑", icon: PenLine },
  { id: "about", label: "关于", icon: Info },
]

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  checkingForUpdate: boolean
  latestVersion: string | null
  updateCheckState: "idle" | "checking" | "up-to-date" | "update-available"
  onCheckForUpdates: () => void
}

export function SettingsDialog({
  open,
  onOpenChange,
  checkingForUpdate,
  latestVersion,
  updateCheckState,
  onCheckForUpdates,
}: SettingsDialogProps) {
  const [section, setSection] = useState<SettingsSection>("appearance")
  const updateStatusText =
    updateCheckState === "checking"
      ? "检查中"
      : updateCheckState === "update-available"
        ? `发现新版本 ${latestVersion ?? ""}`.trim()
        : updateCheckState === "up-to-date"
          ? "当前已是最新版本"
          : "检查更新"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(32rem,calc(100vh-4rem))] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="text-base">设置</DialogTitle>
          <DialogDescription className="text-xs">外观、编辑偏好和版本信息。</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1">
          <nav className="flex w-40 shrink-0 flex-col gap-1 border-r border-border bg-muted/30 p-2" aria-label="设置分类">
            {SECTIONS.map((item) => {
              const Icon = item.icon
              const active = section === item.id
              return (
                <Button
                  key={item.id}
                  type="button"
                  variant="ghost"
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "h-8 justify-start px-2 text-sm font-normal text-muted-foreground",
                    active && "bg-accent text-accent-foreground",
                  )}
                  onClick={() => setSection(item.id)}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Button>
              )
            })}
          </nav>
          <ScrollArea className="h-full min-h-0 flex-1">
            <div className="space-y-4 p-5">
              {section === "appearance" && (
                <>
                  <SectionHeading title="外观" description="主题和编辑器缩进。" />
                  <AppearanceSettings />
                </>
              )}
              {section === "editing" && (
                <>
                  <SectionHeading title="编辑" description="插入链接和图片时的行为。" />
                  <EditingSettings />
                </>
              )}
              {section === "about" && (
                <>
                  <SectionHeading title="关于" description="版本状态和更新检查。" />
                  <div className="max-w-lg space-y-3">
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <div className="text-xs text-muted-foreground">版本状态</div>
                      <div className="mt-1 text-sm font-medium text-foreground">{updateStatusText}</div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className={cn(
                        "justify-start transition-all",
                        checkingForUpdate && "border-primary/40 bg-primary/10 text-primary shadow-sm",
                      )}
                      onClick={onCheckForUpdates}
                      disabled={checkingForUpdate}
                      aria-busy={checkingForUpdate}
                      aria-live="polite"
                    >
                      <span className="inline-flex items-center gap-1">
                        <span>{updateStatusText}</span>
                        {checkingForUpdate && (
                          <span className="inline-flex items-center gap-0.5 text-primary" aria-hidden="true">
                            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.2s]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.1s]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" />
                          </span>
                        )}
                      </span>
                    </Button>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  )
}
