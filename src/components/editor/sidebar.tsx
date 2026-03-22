import { Search, Import, FilePlus, FolderPlus } from "lucide-react"
import { cn } from "@/lib/utils"
import { useEditorStore } from "@/lib/editor-store"
import { FileTree } from "./file-tree"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { importFiles } from "@/lib/file-operations"

export function Sidebar() {
  const { isSidebarOpen, startCreating } = useEditorStore()

  return (
    <aside
      className={cn(
        "h-full bg-sidebar border-r border-sidebar-border flex flex-col",
        "transition-all duration-200 ease-in-out overflow-hidden",
        isSidebarOpen ? "w-64" : "w-0"
      )}
    >
      <div className="flex-1 flex flex-col min-w-[256px]">
        {/* Search */}
        <div className="p-3 border-b border-sidebar-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索文件..."
              className="pl-8 h-8 bg-sidebar-accent border-none text-sm"
            />
          </div>
        </div>

        {/* File Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-sidebar-border">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            文件
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => importFiles()}>
              <Import className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startCreating("file")}>
              <FilePlus className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startCreating("folder")}>
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* File Tree */}
        <div className="flex-1 overflow-y-auto">
          <FileTree />
        </div>
      </div>
    </aside>
  )
}
