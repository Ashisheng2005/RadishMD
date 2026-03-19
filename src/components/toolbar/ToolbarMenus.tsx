import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ToolbarActions, ToolbarMenuNode, ToolbarActionName } from './types'
import type { ThemeType } from '../milkdown/types'
import type { ThemeOption } from '../../theme/themeConfig'
import { getThemeOptions } from '../../theme/themeConfig'
import { TOOLBAR_MENU_SECTIONS } from './toolbarMenuConfig'

interface ToolbarMenusProps {
  theme: ThemeType
  onThemeChange: (theme: ThemeType) => void
  actions: ToolbarActions
  themeOptions?: ThemeOption[]
}

function DropdownMenuShortcut({ children }: { children: string }) {
  return <span className="ml-auto text-xs tracking-widest opacity-60">{children}</span>
}

function createActionHandlers(actions: ToolbarActions) {
  return {
    createNewFile: () => actions.createNewFile(),
    openFile: () => actions.openFile(),
    saveFile: () => actions.saveFile(),
    saveFileAs: () => actions.saveFileAs(),
    undo: () => actions.undo(),
    redo: () => actions.redo(),
    cut: () => actions.cut(),
    copy: () => actions.copy(),
    paste: () => actions.paste(),
    selectAll: () => actions.selectAll(),
    bold: () => actions.bold(),
    italic: () => actions.italic(),
    strikeThrough: () => actions.strikeThrough(),
    code: () => actions.code(),
    codeBlock: () => actions.codeBlock(),
    link: () => actions.link(),
    image: () => actions.image(),
    table: () => actions.table(),
    heading: (level?: number) => {
      if (typeof level === 'number') {
        actions.heading(level)
      }
    },
    orderedList: () => actions.orderedList(),
    unorderedList: () => actions.unorderedList(),
    blockquote: () => actions.blockquote(),
    horizontalRule: () => actions.horizontalRule(),
    mathInline: () => actions.mathInline(),
    mathBlock: () => actions.mathBlock(),
    openAbout: () => actions.openAbout(),
    openShortcuts: () => actions.openShortcuts(),
    confirmInsertTable: () => actions.confirmInsertTable(),
  } satisfies Record<ToolbarActionName, (level?: number) => void>
}

function invokeAction(
  actionName: ToolbarActionName,
  handlers: Record<ToolbarActionName, (level?: number) => void>,
  level?: number,
) {
  handlers[actionName]?.(level)
}

function renderMenuNode(
  node: ToolbarMenuNode,
  handlers: Record<ToolbarActionName, (level?: number) => void>,
) {
  if (node.kind === 'separator') {
    return <DropdownMenuSeparator />
  }

  if (node.kind === 'group') {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>{node.label}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {node.items.map((item) => (
            <DropdownMenuItem
              key={`${item.label}-${item.action}`}
              disabled={item.disabled}
              onClick={() => invokeAction(item.action, handlers, item.level)}
            >
              {item.label}
              {item.shortcut ? <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    )
  }

  return (
    <DropdownMenuItem
      disabled={node.disabled}
      onClick={() => invokeAction(node.action, handlers, node.level)}
    >
      {node.label}
      {node.shortcut ? <DropdownMenuShortcut>{node.shortcut}</DropdownMenuShortcut> : null}
    </DropdownMenuItem>
  )
}

export function ToolbarMenus({ theme, onThemeChange, actions, themeOptions }: ToolbarMenusProps) {
  const handlers = createActionHandlers(actions)
  const availableThemeOptions = getThemeOptions(themeOptions)

  return (
    <div className="menu-bar">
      {TOOLBAR_MENU_SECTIONS.map((section) => (
        <DropdownMenu key={section.label}>
          <DropdownMenuTrigger className="menu-item">{section.label}</DropdownMenuTrigger>
          <DropdownMenuContent>
            {section.nodes.map((node, index) => (
              <div key={`${section.label}-${node.kind}-${index}`}>{renderMenuNode(node, handlers)}</div>
            ))}
            {section.label === '主题' ? (
              <DropdownMenuRadioGroup value={theme} onValueChange={(value) => onThemeChange(value as ThemeType)}>
                {availableThemeOptions.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
    </div>
  )
}