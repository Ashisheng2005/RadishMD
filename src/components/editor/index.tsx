import { useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { useEditorStore } from "@/lib/editor-store"
import { TitleBar } from "./title-bar"
import { Sidebar } from "./sidebar"
import { EditorArea } from "./editor-area"
import { Outline } from "./outline"
import { StatusBar } from "./status-bar"
import { cn } from "@/lib/utils"

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

  const activeFilePath = useEditorStore((state) => {
    if (!state.activeFileId) {
      return null
    }

    return state.findNodeById(state.activeFileId)?.filePath ?? null
  })

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    console.log("[RadishMD][Editor] mount")
    return () => {
      console.log("[RadishMD][Editor] unmount")
    }
  }, [])

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
    invoke<string | null>("get_cli_file_path").then((filePath) => {
      if (filePath) {
        openFileFromPath(filePath)
      }
    })
  }, [openFileFromPath])

  useEffect(() => {
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

  return (
    <div
      className={cn(
        "h-screen w-screen flex flex-col overflow-hidden",
        "bg-background text-foreground"
      )}
    >
      <TitleBar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <EditorArea />
        <Outline />
      </div>
      <StatusBar />
    </div>
  )
}
