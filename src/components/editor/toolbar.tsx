import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  Image,
  List,
  ListOrdered,
  Quote,
  Minus,
  Table,
  CheckSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface ToolbarButtonProps {
  icon: React.ReactNode
  label: string
  shortcut?: string
  onClick?: () => void
}

function ToolbarButton({ icon, label, shortcut, onClick }: ToolbarButtonProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={onClick}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <p>
            {label}
            {shortcut && (
              <span className="ml-2 text-muted-foreground">{shortcut}</span>
            )}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function Toolbar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 px-2 py-1 border-b border-border bg-card",
        className
      )}
    >
      <ToolbarButton
        icon={<Bold className="h-4 w-4" />}
        label="粗体"
        shortcut="Ctrl+B"
      />
      <ToolbarButton
        icon={<Italic className="h-4 w-4" />}
        label="斜体"
        shortcut="Ctrl+I"
      />
      <ToolbarButton
        icon={<Strikethrough className="h-4 w-4" />}
        label="删除线"
        shortcut="Ctrl+Shift+S"
      />
      <ToolbarButton
        icon={<Code className="h-4 w-4" />}
        label="行内代码"
        shortcut="Ctrl+`"
      />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton
        icon={<Link className="h-4 w-4" />}
        label="链接"
        shortcut="Ctrl+K"
      />
      <ToolbarButton
        icon={<Image className="h-4 w-4" />}
        label="图片"
        shortcut="Ctrl+Shift+I"
      />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton
        icon={<List className="h-4 w-4" />}
        label="无序列表"
        shortcut="Ctrl+Shift+8"
      />
      <ToolbarButton
        icon={<ListOrdered className="h-4 w-4" />}
        label="有序列表"
        shortcut="Ctrl+Shift+7"
      />
      <ToolbarButton
        icon={<CheckSquare className="h-4 w-4" />}
        label="任务列表"
      />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton
        icon={<Quote className="h-4 w-4" />}
        label="引用"
        shortcut="Ctrl+Shift+Q"
      />
      <ToolbarButton
        icon={<Table className="h-4 w-4" />}
        label="表格"
      />
      <ToolbarButton
        icon={<Minus className="h-4 w-4" />}
        label="分割线"
      />
    </div>
  )
}
