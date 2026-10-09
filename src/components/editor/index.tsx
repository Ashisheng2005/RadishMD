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
import { CloseConfirmDialog } from "./close-confirm-dialog"
import { isTauriRuntime, openExternalTarget } from "@/lib/runtime"
import { ensureTreeNodeByPath, openExternalPath, restoreExpandedFolders } from "@/lib/file-operations"
import { loadEditorSession, saveEditorSession, type PersistedEditorSession } from "@/lib/editor-session"
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
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false)
  const [unsavedFilesForClose, setUnsavedFilesForClose] = useState<{ id: string; name: string }[]>([])
  const activeDownloadIdRef = useRef<string | null>(null)
  const hasAutoCheckedUpdate = useRef(false)
  const handledOpenedFilePathsRef = useRef(new Set<string>())
  const sessionRestoreTaskRef = useRef<Promise<void> | null>(null)
  const sessionRestoringRef = useRef(false)
  const startupExternalOpenRef = useRef(false)
  const sessionSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSessionJsonRef = useRef<string | null>(null)
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

  const getSessionSnapshot = (): PersistedEditorSession => {
    const state = useEditorStore.getState()
    const currentActiveFilePath = state.activeFileId
      ? state.findNodeById(state.activeFileId)?.filePath ?? null
      : null
    const expandedFolderPaths: string[] = []
    const scrollPositions: PersistedEditorSession["scrollPositions"] = {}
    const rootPaths = state.files
      .map((node) => node.filePath)
      .filter((path): path is string => Boolean(path))

    const visit = (nodes: typeof state.files) => {
      for (const node of nodes) {
        if (node.type === "folder" && node.isExpanded && node.filePath) {
          expandedFolderPaths.push(node.filePath)
        }
        if (node.type === "file" && node.filePath) {
          const position = state.fileScrollPositions[node.id]
          if (position) {
            scrollPositions[node.filePath] = position
          }
        }
        if (node.children) {
          visit(node.children)
        }
      }
    }

    visit(state.files)

    return {
      version: 1,
      rootPaths,
      activeFilePath: currentActiveFilePath,
      expandedFolderPaths,
      scrollPositions,
      isSidebarOpen: state.isSidebarOpen,
      isOutlineOpen: state.isOutlineOpen,
      editMode: state.editMode,
      splitViewMode: state.splitViewMode,
    }
  }

  const persistEditorSession = async () => {
    if (!isTauriRuntime() || sessionRestoringRef.current) {
      return
    }

    const session = getSessionSnapshot()
    const serialized = JSON.stringify(session)
    if (serialized === lastSessionJsonRef.current) {
      return
    }

    try {
      await saveEditorSession(session)
      lastSessionJsonRef.current = serialized
    } catch (error) {
      console.warn("[RadishMD][session] save failed", error)
    }
  }

  const scheduleSessionSave = () => {
    if (!isTauriRuntime() || sessionRestoringRef.current) {
      return
    }

    if (sessionSaveTimerRef.current) {
      clearTimeout(sessionSaveTimerRef.current)
    }

    sessionSaveTimerRef.current = setTimeout(() => {
      sessionSaveTimerRef.current = null
      void persistEditorSession()
    }, 400)
  }

  const flushSessionSave = async () => {
    if (sessionSaveTimerRef.current) {
      clearTimeout(sessionSaveTimerRef.current)
      sessionSaveTimerRef.current = null
    }
    await persistEditorSession()
  }

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

    startupExternalOpenRef.current = true
    handledOpenedFilePathsRef.current.add(normalizedFilePath)
    console.log("[RadishMD][Editor] openFilePathOnce dispatch", { normalizedFilePath })
    void openExternalPath(normalizedFilePath)
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
    if (!isTauriRuntime()) {
      return
    }

    let unlisten: (() => void) | null = null
    let cancelled = false

    void listen<string>("radishmd://file-opened", (event) => {
      openFilePathOnce(event.payload)
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

  useEffect(() => {
    if (!isTauriRuntime() || sessionRestoreTaskRef.current) {
      return
    }

    sessionRestoringRef.current = true

    const task = (async () => {
      let startupOpenPaths: string[] = []
      try {
        const [cliFilePath, pendingOpenedFiles] = await Promise.all([
          invoke<string | null>("get_cli_file_path").catch(() => null),
          invoke<string[]>("take_opened_files").catch(() => []),
        ])
        startupOpenPaths = [cliFilePath, ...pendingOpenedFiles]
          .filter((path): path is string => Boolean(path))
          .map(normalizeFilePath)
          .filter(Boolean)
        const session = await loadEditorSession().catch((error) => {
          console.warn("[RadishMD][session] load failed", error)
          return null
        })
        if (!session) {
          for (const path of startupOpenPaths) {
            handledOpenedFilePathsRef.current.add(path)
            await openExternalPath(path)
          }
          return
        }

        useEditorStore.setState({
          isSidebarOpen: session.isSidebarOpen,
          isOutlineOpen: session.isOutlineOpen,
          editMode: session.editMode,
          splitViewMode: session.splitViewMode,
        })

        for (const rootPath of session.rootPaths) {
          try {
            await openExternalPath(rootPath, { activate: false, forceReload: false })
          } catch (error) {
            console.warn("[RadishMD][session] failed to restore path", rootPath, error)
          }
        }

        const expandedPathKeys = new Set(session.expandedFolderPaths.map((path) => normalizeFilePath(path)))
        for (const rootPath of session.rootPaths) {
          const rootFolder = useEditorStore.getState().findFolderByPath(rootPath)
          if (rootFolder && rootFolder.filePath && !expandedPathKeys.has(normalizeFilePath(rootFolder.filePath))) {
            useEditorStore.getState().setFolderExpanded(rootFolder.id, false)
          }
        }

        await restoreExpandedFolders(session.expandedFolderPaths)

        const restoredScrollPositions: Record<string, { editor: number; preview: number }> = {}
        for (const [path, position] of Object.entries(session.scrollPositions)) {
          const node = useEditorStore.getState().findNodeByPath(path)
          if (node?.type === "file") {
            restoredScrollPositions[node.id] = position
          }
        }
        useEditorStore.setState({ fileScrollPositions: restoredScrollPositions })

        if (startupOpenPaths.length > 0) {
          for (const path of startupOpenPaths) {
            handledOpenedFilePathsRef.current.add(path)
            await openExternalPath(path)
          }
        } else if (!startupExternalOpenRef.current && session.activeFilePath) {
          const activeFile = await ensureTreeNodeByPath(session.activeFilePath)
          if (activeFile?.type === "file") {
            await useEditorStore.getState().setActiveFile(activeFile.id)
          }
        }
      } catch (error) {
        console.warn("[RadishMD][session] restore failed", error)
        for (const path of startupOpenPaths) {
          if (handledOpenedFilePathsRef.current.has(path)) {
            continue
          }
          try {
            handledOpenedFilePathsRef.current.add(path)
            await openExternalPath(path)
          } catch (openError) {
            console.warn("[RadishMD][session] failed to open startup path", path, openError)
          }
        }
      } finally {
        sessionRestoringRef.current = false
        scheduleSessionSave()
      }
    })()
    sessionRestoreTaskRef.current = task

    return undefined
  }, [])

  useEffect(() => {
    if (!isTauriRuntime()) {
      return
    }

    const unsubscribe = useEditorStore.subscribe(() => {
      scheduleSessionSave()
    })

    return () => {
      unsubscribe()
      if (sessionSaveTimerRef.current) {
        clearTimeout(sessionSaveTimerRef.current)
        sessionSaveTimerRef.current = null
      }
    }
  }, [])

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

  // Handle window close confirmation
  useEffect(() => {
    if (!isTauriRuntime()) {
      return
    }

    let unlisten: (() => void) | null = null

    void listen("radishmd://close-requested", () => {
      const hasUnsaved = useEditorStore.getState().hasUnsavedChanges()

      if (hasUnsaved) {
        const unsaved = useEditorStore.getState().getUnsavedFiles()
        setUnsavedFilesForClose(unsaved.map(f => ({ id: f.id, name: f.name })))
        setCloseConfirmOpen(true)
      } else {
        void flushSessionSave().finally(() => {
          void invoke("confirm_close")
        })
      }
    }).then((dispose) => {
      unlisten = dispose
    })

    return () => {
      unlisten?.()
    }
  }, [])

  const handleCloseSaveAndClose = async () => {
    const store = useEditorStore.getState()
    for (const file of store.getUnsavedFiles()) {
      if (!(await store.saveFileById(file.id))) {
        return
      }
    }
    if (store.getUnsavedFiles().length > 0) {
      toast.error("保存期间文件又发生了修改，请重试")
      return
    }
    setCloseConfirmOpen(false)
    await flushSessionSave()
    await invoke("confirm_close")
  }

  const handleCloseDiscard = () => {
    setCloseConfirmOpen(false)
    void flushSessionSave().finally(() => {
      void invoke("confirm_close")
    })
  }

  const handleCloseCancel = () => {
    setCloseConfirmOpen(false)
  }

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
      <CloseConfirmDialog
        open={closeConfirmOpen}
        unsavedFiles={unsavedFilesForClose}
        onSaveAndClose={() => void handleCloseSaveAndClose()}
        onDiscard={handleCloseDiscard}
        onCancel={handleCloseCancel}
      />
    </div>
  )
}
