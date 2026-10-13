import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { type AppTabSize, type AppTheme } from "@/lib/app-settings"
import { useEditorStore } from "@/lib/editor-store"
import { cn } from "@/lib/utils"

const THEME_OPTIONS: Array<{ value: AppTheme; label: string }> = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
]

const TAB_SIZE_OPTIONS: AppTabSize[] = [4, 6, 8]

function ThemePreview({ mode }: { mode: AppTheme }) {
  if (mode === "system") {
    return (
      <div className="grid grid-cols-2 overflow-hidden rounded-sm">
        <div className="space-y-1 bg-[#ecedef] p-1.5">
          <div className="h-1.5 w-7 rounded-full bg-white" />
          <div className="h-1.5 w-10 rounded-full bg-white/80" />
        </div>
        <div className="space-y-1 bg-zinc-950 p-1.5">
          <div className="h-1.5 w-7 rounded-full bg-zinc-700" />
          <div className="h-1.5 w-10 rounded-full bg-zinc-800" />
        </div>
      </div>
    )
  }

  const dark = mode === "dark"
  return (
    <div className={cn("space-y-1 rounded-sm p-1.5", dark ? "bg-zinc-950" : "bg-[#ecedef]")}>
      <div className={cn("space-y-1 rounded-sm p-1.5 shadow-xs", dark ? "bg-zinc-800" : "bg-white")}>
        <div className={cn("h-1.5 w-8 rounded-full", dark ? "bg-zinc-600" : "bg-[#ecedef]")} />
        <div className={cn("h-1.5 w-12 rounded-full", dark ? "bg-zinc-700" : "bg-[#ecedef]")} />
      </div>
    </div>
  )
}

export function AppearanceSettings() {
  const theme = useEditorStore((state) => state.theme)
  const tabSize = useEditorStore((state) => state.tabSize)
  const setTheme = useEditorStore((state) => state.setTheme)
  const setTabSize = useEditorStore((state) => state.setTabSize)

  return (
    <FieldGroup className="max-w-lg gap-4">
      <Field className="gap-2">
        <FieldLabel>主题</FieldLabel>
        <FieldDescription className="text-xs">
          界面配色。跟随系统，或固定为浅色、深色。
        </FieldDescription>
        <RadioGroup
          value={theme}
          onValueChange={(value) => {
            if (value === "light" || value === "dark" || value === "system") {
              setTheme(value)
            }
          }}
          className="grid max-w-md grid-cols-3 gap-2"
          aria-label="主题"
        >
          {THEME_OPTIONS.map((option) => (
            <Label
              key={option.value}
              className="cursor-pointer flex-col items-stretch gap-1.5 font-normal [&:has([data-state=checked])>div]:border-primary"
            >
              <RadioGroupItem value={option.value} className="sr-only" />
              <div className="rounded-md border-2 border-muted p-1 transition-colors hover:border-accent">
                <ThemePreview mode={option.value} />
              </div>
              <span className="text-center text-xs font-normal text-muted-foreground">
                {option.label}
              </span>
            </Label>
          ))}
        </RadioGroup>
      </Field>

      <Field className="gap-2">
        <FieldLabel htmlFor="tab-size">Tab 宽度</FieldLabel>
        <ToggleGroup
          id="tab-size"
          type="single"
          variant="outline"
          size="sm"
          value={String(tabSize)}
          onValueChange={(value) => {
            if (value === "4" || value === "6" || value === "8") {
              setTabSize(Number(value) as AppTabSize)
            }
          }}
          className="grid w-full max-w-xs grid-cols-3"
          aria-label="Tab 宽度"
        >
          {TAB_SIZE_OPTIONS.map((size) => (
            <ToggleGroupItem key={size} value={String(size)} className="text-xs">
              {size}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldDescription className="text-xs">
          编辑器缩进使用的空格数。
        </FieldDescription>
      </Field>
    </FieldGroup>
  )
}
