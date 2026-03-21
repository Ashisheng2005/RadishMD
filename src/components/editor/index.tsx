import { useEffect } from "react"
import { useEditorStore } from "@/lib/editor-store"
import { TitleBar } from "./title-bar"
import { Sidebar } from "./sidebar"
import { EditorArea } from "./editor-area"
import { Outline } from "./outline"
import { StatusBar } from "./status-bar"
import { cn } from "@/lib/utils"

export function Editor() {
  const { theme } = useEditorStore()

  useEffect(() => {
    // Apply theme to document
    if (theme === "dark") {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }, [theme])

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
