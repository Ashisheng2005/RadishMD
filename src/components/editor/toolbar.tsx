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
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
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

export type FormatType = "bold" | "italic" | "strikethrough" | "code" | "link" | "image" | "list" | "ordered" | "quote" | "tasklist" | "table" | "hr" | "heading1" | "heading2" | "heading3" | "heading4" | "heading5" | "heading6"

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

interface ToolbarProps {
  className?: string
  onFormat?: (type: FormatType) => void
}

export function Toolbar({ className, onFormat }: ToolbarProps) {
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
        onClick={() => onFormat?.("bold")}
      />
      <ToolbarButton
        icon={<Italic className="h-4 w-4" />}
        label="斜体"
        shortcut="Ctrl+I"
        onClick={() => onFormat?.("italic")}
      />
      <ToolbarButton
        icon={<Strikethrough className="h-4 w-4" />}
        label="删除线"
        shortcut="Ctrl+Shift+S"
        onClick={() => onFormat?.("strikethrough")}
      />
      <ToolbarButton
        icon={<Code className="h-4 w-4" />}
        label="行内代码"
        shortcut="Ctrl+`"
        onClick={() => onFormat?.("code")}
      />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton
        icon={<Link className="h-4 w-4" />}
        label="链接"
        shortcut="Ctrl+K"
        onClick={() => onFormat?.("link")}
      />
      <ToolbarButton
        icon={<Image className="h-4 w-4" />}
        label="图片"
        shortcut="Ctrl+Shift+I"
        onClick={() => onFormat?.("image")}
      />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton
        icon={<List className="h-4 w-4" />}
        label="无序列表"
        shortcut="Ctrl+Shift+8"
        onClick={() => onFormat?.("list")}
      />
      <ToolbarButton
        icon={<ListOrdered className="h-4 w-4" />}
        label="有序列表"
        shortcut="Ctrl+Shift+7"
        onClick={() => onFormat?.("ordered")}
      />
      <ToolbarButton
        icon={<CheckSquare className="h-4 w-4" />}
        label="任务列表"
        onClick={() => onFormat?.("tasklist")}
      />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton
        icon={<Quote className="h-4 w-4" />}
        label="引用"
        shortcut="Ctrl+Shift+Q"
        onClick={() => onFormat?.("quote")}
      />
      <ToolbarButton
        icon={<Heading1 className="h-4 w-4" />}
        label="标题1"
        shortcut="Ctrl+1"
        onClick={() => onFormat?.("heading1")}
      />
      <ToolbarButton
        icon={<Heading2 className="h-4 w-4" />}
        label="标题2"
        shortcut="Ctrl+2"
        onClick={() => onFormat?.("heading2")}
      />
      <ToolbarButton
        icon={<Heading3 className="h-4 w-4" />}
        label="标题3"
        shortcut="Ctrl+3"
        onClick={() => onFormat?.("heading3")}
      />
      <ToolbarButton
        icon={<Heading4 className="h-4 w-4" />}
        label="标题4"
        shortcut="Ctrl+4"
        onClick={() => onFormat?.("heading4")}
      />
      <ToolbarButton
        icon={<Heading5 className="h-4 w-4" />}
        label="标题5"
        shortcut="Ctrl+5"
        onClick={() => onFormat?.("heading5")}
      />
      <ToolbarButton
        icon={<Heading6 className="h-4 w-4" />}
        label="标题6"
        shortcut="Ctrl+6"
        onClick={() => onFormat?.("heading6")}
      />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolbarButton
        icon={<Table className="h-4 w-4" />}
        label="表格"
        onClick={() => onFormat?.("table")}
      />
      <ToolbarButton
        icon={<Minus className="h-4 w-4" />}
        label="分割线"
        onClick={() => onFormat?.("hr")}
      />
    </div>
  )
}
