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
  const { theme, toggleSidebar, toggleOutline, saveFile, openFileFromPath } = useEditorStore()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S: Save
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault()
        saveFile()
        return
      }

      if (!e.ctrlKey || !e.shiftKey) return

      if (e.key === "Z" || e.key === "z") {
        e.preventDefault()
        toggleSidebar()
      }

      if (e.key === "X" || e.key === "x") {
        e.preventDefault()
        toggleOutline()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar, toggleOutline, saveFile])

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
