import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Download, ExternalLink, RefreshCw, CircleSlash2, FolderOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { openExternalTarget } from "@/lib/runtime"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { UpdateAsset, UpdateCheckResult, UpdateDownloadProgress } from "@/lib/update"

interface UpdateDialogProps {
  open: boolean
  checking: boolean
  updateInfo: UpdateCheckResult | null
  downloadingAsset: string | null
  downloadProgress: UpdateDownloadProgress | null
  cancellingDownload: boolean
  downloadedAssets: Record<string, string>
  onOpenChange: (open: boolean) => void
  onCheckAgain: () => void
  onDownloadAsset: (asset: UpdateAsset) => Promise<void>
  onCancelDownload: () => void
  onOpenAssetFolder: (assetName: string) => void
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
  cancellingDownload,
  downloadedAssets,
  onOpenChange,
  onCheckAgain,
  onDownloadAsset,
  onCancelDownload,
  onOpenAssetFolder,
}: UpdateDialogProps) {
  const releaseNotes = updateInfo?.release_notes?.trim() || "暂无 release note。"
  const hasAssets = Boolean(updateInfo?.assets.length)
  const currentVersion = updateInfo?.current_version || "-"
  const latestVersion = updateInfo?.latest_version || "-"
  const activeDownloadAsset = updateInfo?.assets.find((asset) => asset.name === downloadingAsset) ?? null
  const activeDownloadText = activeDownloadAsset
    ? downloadProgress
      ? `${downloadProgress.asset_name} · ${formatBytes(downloadProgress.downloaded_bytes)} / ${downloadProgress.total_bytes ? formatBytes(downloadProgress.total_bytes) : "未知总大小"}`
      : `${activeDownloadAsset.name} · 准备下载`
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-4">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1 text-left">
              <DialogTitle>发现新版本</DialogTitle>
              <DialogDescription>
                当前版本 {currentVersion}，最新版本 {latestVersion}
              </DialogDescription>
            </div>
            {updateInfo?.has_update && <Badge variant="secondary">可更新</Badge>}
          </div>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-muted/20 px-3 py-2 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">当前</span>
            <span className="font-medium">{currentVersion}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">最新</span>
            <span className="font-medium text-primary">{latestVersion}</span>
          </div>
          <div className="min-w-0 flex items-center gap-1.5">
            <span className="text-muted-foreground">发布</span>
            <span className="truncate font-medium">{updateInfo?.published_at ?? "未知"}</span>
          </div>
        </div>

        <div className="grid gap-2">
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
          <ScrollArea className="h-32 rounded-md border bg-muted/20">
            <div className="whitespace-pre-wrap px-3 py-2.5 text-sm leading-5 text-muted-foreground">
              {releaseNotes}
            </div>
          </ScrollArea>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">可下载资产</div>
            <Button type="button" variant="ghost" size="sm" onClick={() => void openExternalTarget(updateInfo?.release_url ?? "")} disabled={!updateInfo?.release_url}>
              <ExternalLink className="mr-2 h-4 w-4" />
              打开 Release
            </Button>
          </div>
          {activeDownloadText && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">正在下载</div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 border border-primary/20 text-primary/80 hover:bg-primary/10"
                        onClick={onCancelDownload}
                        disabled={cancellingDownload}
                        aria-label="取消下载"
                      >
                        {cancellingDownload ? <Spinner className="h-4 w-4" /> : <CircleSlash2 className="h-4 w-4" aria-hidden="true" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>取消下载</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="mt-1 text-xs opacity-80">{activeDownloadText}</div>
            </div>
          )}
          {hasAssets ? (
            <ScrollArea className="max-h-44 rounded-md border bg-muted/20">
              <div className="divide-y">
                {updateInfo?.assets.map((asset) => {
                  const isDownloading = downloadingAsset === asset.name
                  const isDownloaded = Boolean(downloadedAssets[asset.name])
                  const progress = isDownloading ? downloadProgress?.progress : null
                  const downloadedBytes = isDownloading ? downloadProgress?.downloaded_bytes ?? 0 : 0
                  const totalBytes = isDownloading ? downloadProgress?.total_bytes ?? asset.size : asset.size

                  return (
                    <div
                      key={asset.name}
                      className={cn(
                        "bg-background px-3 py-2.5",
                        asset.is_preferred && "bg-primary/5",
                        isDownloading && "bg-primary/5",
                        isDownloaded && "bg-green-500/5",
                      )}
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="truncate text-sm font-medium">{asset.name}</div>
                            {asset.is_preferred && <Badge className="h-5 shrink-0 px-1.5 text-[11px]">推荐</Badge>}
                            {isDownloading && <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[11px]">下载中</Badge>}
                            {isDownloaded && <Badge variant="default" className="h-5 shrink-0 bg-green-500/80 px-1.5 text-[11px] text-white">已下载</Badge>}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            <span>{formatBytes(asset.size)}</span>
                            {isDownloading && <span>已下载 {formatBytes(downloadedBytes)}</span>}
                            {progress != null && <span>{Math.round(progress * 100)}%</span>}
                          </div>
                        </div>
                        {isDownloaded ? (
                          <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => onOpenAssetFolder(asset.name)} aria-label="打开安装包所在文件夹">
                            <FolderOpen className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button type="button" size="sm" className="h-8 px-2.5" onClick={() => void onDownloadAsset(asset)} disabled={Boolean(downloadingAsset)}>
                            {isDownloading ? <Spinner className="mr-1.5 h-4 w-4" /> : <Download className="mr-1.5 h-4 w-4" />}
                            {isDownloading ? "下载中" : "下载"}
                          </Button>
                        )}
                      </div>
                      {isDownloading && (
                        <div className="mt-2 space-y-1.5">
                          <Progress value={Math.round((progress ?? 0) * 100)} className="h-1.5" />
                          <div className="text-[11px] text-muted-foreground">
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
            </ScrollArea>
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
