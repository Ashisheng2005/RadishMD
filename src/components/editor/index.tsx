import { useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { useEditorStore } from "@/lib/editor-store"
import { TitleBar } from "./title-bar"
import { Sidebar } from "./sidebar"
import { EditorArea } from "./editor-area"
import { Outline } from "./outline"
import { StatusBar } from "./status-bar"
import { cn } from "@/lib/utils"

export function Editor() {
  const { theme, toggleSidebar, toggleOutline, saveFile, openFileFromPath, isSearchOpen, toggleSearch, closeSearch } = useEditorStore()

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
    if (theme === "dark") {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
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
