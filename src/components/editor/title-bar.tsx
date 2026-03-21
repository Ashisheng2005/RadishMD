import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Moon,
  Sun,
  Settings,
  FileText,
  FileEdit,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEditorStore } from "@/lib/editor-store"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function TitleBar() {
  const {
    isSidebarOpen,
    isOutlineOpen,
    theme,
    editMode,
    toggleSidebar,
    toggleOutline,
    toggleTheme,
    toggleEditMode,
  } = useEditorStore()

  return (
    <header className="h-10 bg-card border-b border-border flex items-center justify-between px-2">
      {/* Left Controls */}
      <div className="flex items-center gap-1">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={toggleSidebar}
              >
                {isSidebarOpen ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeftOpen className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {isSidebarOpen ? "隐藏侧边栏" : "显示侧边栏"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Center - App Name */}
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">RadishMD</span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={toggleTheme}
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {theme === "dark" ? "浅色主题" : "深色主题"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={toggleOutline}
              >
                {isOutlineOpen ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {isOutlineOpen ? "隐藏大纲" : "显示大纲"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={toggleEditMode}
              >
                <FileEdit className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {editMode === "split" ? "切换到 WYSIWYG 模式" : "切换到分屏模式"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              设置
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </header>
  )
}
