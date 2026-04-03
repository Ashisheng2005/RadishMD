import { useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { toast } from "sonner"
import { normalizeFilePath, useEditorStore } from "@/lib/editor-store"
import { TitleBar } from "./title-bar"
import { Sidebar } from "./sidebar"
import { EditorArea } from "./editor-area"
import { Outline } from "./outline"
import { StatusBar } from "./status-bar"
import { cn } from "@/lib/utils"
import { UpdateDialog } from "./update-dialog"
import { isTauriRuntime, openExternalTarget } from "@/lib/runtime"
import {
  checkLatestRelease,
  cancelDownload,
  chooseUpdateSavePath,
  downloadReleaseAsset,
  UPDATE_DOWNLOAD_PROGRESS_EVENT,
  type UpdateAsset,
  type UpdateCheckResult,
  type UpdateDownloadProgress,
} from "@/lib/update"

export function Editor() {
  const {
    theme,
    toggleSidebar,
    toggleOutline,
    saveFile,
    openFileFromPath,
    checkActiveFileForExternalChanges,
    isSearchOpen,
    toggleSearch,
    closeSearch,
  } = useEditorStore()
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null)
  const [checkingForUpdate, setCheckingForUpdate] = useState(false)
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false)
  const [downloadingAsset, setDownloadingAsset] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<UpdateDownloadProgress | null>(null)
  const [cancellingDownload, setCancellingDownload] = useState(false)
  const [downloadedAssets, setDownloadedAssets] = useState<Record<string, string>>({})
  const activeDownloadIdRef = useRef<string | null>(null)
  const hasAutoCheckedUpdate = useRef(false)
  const handledOpenedFilePathsRef = useRef(new Set<string>())
  const CHECK_UPDATE_MIN_LOADING_MS = 800
  const updateCheckState = checkingForUpdate
    ? "checking"
    : updateInfo
      ? updateInfo.has_update
        ? "update-available"
        : "up-to-date"
      : "idle"

  const formatErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
      return error.message
    }

    if (typeof error === "string") {
      return error
    }

    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }

  const activeFilePath = useEditorStore((state) => {
    if (!state.activeFileId) {
      return null
    }

    return state.findNodeById(state.activeFileId)?.filePath ?? null
  })

  const openFilePathOnce = (filePath: string) => {
    const normalizedFilePath = normalizeFilePath(filePath)

    console.log("[RadishMD][Editor] openFilePathOnce", {
      filePath,
      normalizedFilePath,
    })

    if (!normalizedFilePath || handledOpenedFilePathsRef.current.has(normalizedFilePath)) {
      console.log("[RadishMD][Editor] openFilePathOnce skipped", {
        normalizedFilePath,
        alreadyHandled: handledOpenedFilePathsRef.current.has(normalizedFilePath),
      })
      return
    }

    handledOpenedFilePathsRef.current.add(normalizedFilePath)
    console.log("[RadishMD][Editor] openFilePathOnce dispatch", { normalizedFilePath })
    void openFileFromPath(normalizedFilePath)
  }

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    console.log("[RadishMD][Editor] mount")
    return () => {
      console.log("[RadishMD][Editor] unmount")
    }
  }, [])

  const checkForUpdates = async (showToastOnSuccess: boolean) => {
    if (checkingForUpdate) {
      return
    }

    const startedAt = Date.now()
    flushSync(() => {
      setCheckingForUpdate(true)
    })

    try {
      const result = await checkLatestRelease()
      setUpdateInfo(result)

      if (result.has_update) {
        setUpdateDialogOpen(true)
        return
      }

      if (showToastOnSuccess) {
        toast.success("当前已是最新版本")
      }
    } catch (error) {
      console.error("[RadishMD][update] check failed", error)

      if (showToastOnSuccess) {
        toast.error("检查更新失败")
      }
    } finally {
      const elapsed = Date.now() - startedAt
      if (elapsed < CHECK_UPDATE_MIN_LOADING_MS) {
        await new Promise((resolve) => window.setTimeout(resolve, CHECK_UPDATE_MIN_LOADING_MS - elapsed))
      }

      setCheckingForUpdate(false)
    }
  }

  const handleDownloadAsset = async (asset: UpdateAsset) => {
    const savePath = await chooseUpdateSavePath(asset.name)
    const downloadId = globalThis.crypto?.randomUUID?.() ?? `download-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    if (!savePath) {
      return
    }

    activeDownloadIdRef.current = downloadId
    setDownloadingAsset(asset.name)
    setDownloadProgress(null)
    setCancellingDownload(false)

    try {
      await downloadReleaseAsset(asset, savePath, downloadId)
      toast.success(`更新包已下载到 ${savePath}`)
      setDownloadedAssets((prev) => ({ ...prev, [asset.name]: savePath }))
    } catch (error) {
      console.error("[RadishMD][update] download failed", error)

      if (formatErrorMessage(error).includes("download cancelled")) {
        toast.info(`已取消下载 ${asset.name}`)
      } else {
        toast.error(`下载 ${asset.name} 失败：${formatErrorMessage(error)}`)
      }
    } finally {
      if (activeDownloadIdRef.current === downloadId) {
        activeDownloadIdRef.current = null
      }

      setDownloadingAsset(null)
      setDownloadProgress(null)
      setCancellingDownload(false)
    }
  }

  const handleCancelDownload = async () => {
    const downloadId = activeDownloadIdRef.current

    if (!downloadId || cancellingDownload) {
      return
    }

    setCancellingDownload(true)

    try {
      await cancelDownload(downloadId)
    } catch (error) {
      console.error("[RadishMD][update] cancel failed", error)
      toast.error("取消下载失败")
      setCancellingDownload(false)
    }
  }

  const handleOpenAssetFolder = (assetName: string) => {
    const savePath = downloadedAssets[assetName]
    if (savePath) {
      const lastSlash = Math.max(savePath.lastIndexOf("/"), savePath.lastIndexOf("\\"))
      const folderPath = lastSlash > 0 ? savePath.substring(0, lastSlash) : savePath
      void openExternalTarget(folderPath)
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()

      // Save should work even while focus is inside the editor.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === "s") {
        e.preventDefault()
        saveFile()
        return
      }

      if (e.ctrlKey && e.key === "/") {
        e.preventDefault()
        toggleSearch()
        return
      }

      if (e.key === "Escape" && isSearchOpen) {
        e.preventDefault()
        closeSearch()
        return
      }

      if (e.ctrlKey && e.shiftKey) {
        const key = e.key.toLowerCase()

        if (key === "z") {
          e.preventDefault()
          e.stopPropagation()
          toggleSidebar()
          return
        }

        if (key === "x") {
          e.preventDefault()
          e.stopPropagation()
          toggleOutline()
          return
        }
      }

      const target = e.target as HTMLElement | null
      const isEditableTarget = Boolean(
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      )

      if (isEditableTarget) {
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [closeSearch, isSearchOpen, saveFile, toggleOutline, toggleSearch, toggleSidebar])

  useEffect(() => {
    // Apply theme to document
    const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)")

    const applyTheme = () => {
      const isDarkTheme = theme === "dark" || (theme === "system" && systemThemeQuery.matches)
      document.documentElement.classList.toggle("dark", isDarkTheme)
    }

    applyTheme()

    if (theme !== "system") {
      return
    }

    const handleSystemThemeChange = () => {
      applyTheme()
    }

    systemThemeQuery.addEventListener("change", handleSystemThemeChange)

    return () => {
      systemThemeQuery.removeEventListener("change", handleSystemThemeChange)
    }
  }, [theme])

  useEffect(() => {
    // Check for file opened via file association on app startup
    if (!isTauriRuntime()) {
      return
    }

    invoke<string | null>("get_cli_file_path").then((filePath) => {
      console.log("[RadishMD][Editor] get_cli_file_path", { filePath })
      if (filePath) {
        openFilePathOnce(filePath)
      }
    })
  }, [openFileFromPath])

  useEffect(() => {
    if (!isTauriRuntime()) {
      return
    }

    let unlisten: (() => void) | null = null
    let cancelled = false

    void listen<string>("radishmd://file-opened", (event) => {
      console.log("[RadishMD][Editor] radishmd://file-opened", {
        payload: event.payload,
      })
      openFilePathOnce(event.payload)
    }).then((dispose) => {
      if (cancelled) {
        dispose()
        return
      }

      unlisten = dispose
    })

    void invoke<string[]>("take_opened_files").then((filePaths) => {
      console.log("[RadishMD][Editor] take_opened_files", { filePaths })
      for (const filePath of filePaths) {
        openFilePathOnce(filePath)
      }
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [openFileFromPath])

  useEffect(() => {
    if (import.meta.env.DEV || hasAutoCheckedUpdate.current) {
      return
    }

    hasAutoCheckedUpdate.current = true
    void checkForUpdates(false)
  }, [])

  useEffect(() => {
    if (!isTauriRuntime()) {
      return
    }

    const syncFileWatcher = async () => {
      if (activeFilePath) {
        await invoke("watch_file_changes", { filePath: activeFilePath })
        return
      }

      await invoke("clear_file_watcher")
    }

    void syncFileWatcher()

    return () => {
      void invoke("clear_file_watcher")
    }
  }, [activeFilePath])

  useEffect(() => {
    if (!isTauriRuntime()) {
      return
    }

    let unlisten: (() => void) | null = null
    let cancelled = false

    void listen<string>("radishmd://file-changed", () => {
      void checkActiveFileForExternalChanges()
    }).then((dispose) => {
      if (cancelled) {
        dispose()
        return
      }

      unlisten = dispose
    })

    const handleFocus = () => {
      void checkActiveFileForExternalChanges()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkActiveFileForExternalChanges()
      }
    }

    window.addEventListener("focus", handleFocus)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      cancelled = true
      unlisten?.()
      window.removeEventListener("focus", handleFocus)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [checkActiveFileForExternalChanges])

  useEffect(() => {
    if (!isTauriRuntime()) {
      return
    }

    let unlisten: (() => void) | null = null
    let cancelled = false

    void listen<UpdateDownloadProgress>(UPDATE_DOWNLOAD_PROGRESS_EVENT, (event) => {
      if (event.payload.download_id !== activeDownloadIdRef.current) {
        return
      }

      setDownloadProgress(event.payload)
    }).then((dispose) => {
      if (cancelled) {
        dispose()
        return
      }

      unlisten = dispose
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  return (
    <div
      className={cn(
        "h-screen w-screen flex flex-col overflow-hidden",
        "bg-background text-foreground"
      )}
    >
      <TitleBar
        checkingForUpdate={checkingForUpdate}
        latestVersion={updateInfo?.latest_version ?? null}
        updateCheckState={updateCheckState}
        onCheckForUpdates={() => void checkForUpdates(true)}
      />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <EditorArea />
        <Outline />
      </div>
      <StatusBar />
      <UpdateDialog
        open={updateDialogOpen}
        checking={checkingForUpdate}
        updateInfo={updateInfo}
        downloadingAsset={downloadingAsset}
        downloadProgress={downloadProgress}
        cancellingDownload={cancellingDownload}
        downloadedAssets={downloadedAssets}
        onOpenChange={setUpdateDialogOpen}
        onCheckAgain={() => void checkForUpdates(true)}
        onDownloadAsset={handleDownloadAsset}
        onCancelDownload={() => void handleCancelDownload()}
        onOpenAssetFolder={handleOpenAssetFolder}
      />
    </div>
  )
}
