import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Download, ExternalLink, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { openExternalTarget } from "@/lib/runtime"
import { Spinner } from "@/components/ui/spinner"
import type { UpdateAsset, UpdateCheckResult, UpdateDownloadProgress } from "@/lib/update"

interface UpdateDialogProps {
  open: boolean
  checking: boolean
  updateInfo: UpdateCheckResult | null
  downloadingAsset: string | null
  downloadProgress: UpdateDownloadProgress | null
  onOpenChange: (open: boolean) => void
  onCheckAgain: () => void
  onDownloadAsset: (asset: UpdateAsset) => Promise<void>
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const units = ["KB", "MB", "GB", "TB"]
  let value = bytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

export function UpdateDialog({
  open,
  checking,
  updateInfo,
  downloadingAsset,
  downloadProgress,
  onOpenChange,
  onCheckAgain,
  onDownloadAsset,
}: UpdateDialogProps) {
  const releaseNotes = updateInfo?.release_notes?.trim() || "暂无 release note。"
  const hasAssets = Boolean(updateInfo?.assets.length)
  const currentVersion = updateInfo?.current_version || "-"
  const latestVersion = updateInfo?.latest_version || "-"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-5">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2 text-left">
              <DialogTitle>发现新版本</DialogTitle>
              <DialogDescription>
                当前版本 {currentVersion}，最新版本 {latestVersion}
              </DialogDescription>
            </div>
            {updateInfo?.has_update && <Badge variant="secondary">可更新</Badge>}
          </div>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">当前版本</div>
            <div className="mt-1 font-medium">{currentVersion}</div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">最新版本</div>
            <div className="mt-1 font-medium">{latestVersion}</div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">发布时间</div>
            <div className="mt-1 font-medium">{updateInfo?.published_at ?? "未知"}</div>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">Release Note</div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void onCheckAgain()}
              disabled={checking}
              aria-busy={checking}
              className={checking ? "border-primary/40 bg-primary/10 text-primary" : undefined}
            >
              <span
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-full border shrink-0 transition-all",
                  checking ? "border-primary/40 bg-primary/15 text-primary" : "border-transparent bg-transparent text-muted-foreground"
                )}
                aria-hidden="true"
              >
                {checking ? <Spinner className="h-4 w-4 text-primary" /> : <RefreshCw className="h-4 w-4" />}
              </span>
              <span className="flex items-center gap-1">
                {checking ? "检查中" : "重新检查"}
                {checking && (
                  <span className="inline-flex items-center gap-0.5 text-primary" aria-hidden="true">
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" />
                  </span>
                )}
              </span>
            </Button>
          </div>
          <ScrollArea className="h-56 rounded-lg border bg-muted/20">
            <div className="whitespace-pre-wrap p-4 text-sm leading-6 text-muted-foreground">
              {releaseNotes}
            </div>
          </ScrollArea>
        </div>

        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">可下载资产</div>
            <Button type="button" variant="ghost" size="sm" onClick={() => void openExternalTarget(updateInfo?.release_url ?? "")} disabled={!updateInfo?.release_url}>
              <ExternalLink className="mr-2 h-4 w-4" />
              打开 Release
            </Button>
          </div>
          {hasAssets ? (
            <div className="grid gap-2">
              {updateInfo?.assets.map((asset) => {
                const isDownloading = downloadingAsset === asset.name
                const progress = isDownloading ? downloadProgress?.progress : null
                const downloadedBytes = isDownloading ? downloadProgress?.downloaded_bytes ?? 0 : 0
                const totalBytes = isDownloading ? downloadProgress?.total_bytes ?? asset.size : asset.size

                return (
                  <div
                    key={asset.name}
                    className={cn(
                      "rounded-lg border bg-background p-3",
                      asset.is_preferred && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="truncate font-medium">{asset.name}</div>
                          {asset.is_preferred && <Badge>推荐</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{formatBytes(asset.size)}</div>
                      </div>
                      <Button type="button" size="sm" onClick={() => void onDownloadAsset(asset)} disabled={Boolean(downloadingAsset)}>
                        {isDownloading ? <Spinner className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
                        {isDownloading ? "下载中" : "下载"}
                      </Button>
                    </div>
                    {isDownloading && (
                      <div className="mt-3 space-y-2">
                        <Progress value={Math.round((progress ?? 0) * 100)} />
                        <div className="text-xs text-muted-foreground">
                          {progress == null
                            ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
                            : `${Math.round(progress * 100)}% (${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)})`}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              没有可下载的安装包资产。
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            稍后
          </Button>
          {!checking && !hasAssets && (
            <Button type="button" onClick={() => void openExternalTarget(updateInfo?.release_url ?? "")} disabled={!updateInfo?.release_url}>
              打开 Release 页面
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}