import type { RefObject } from 'react'
import type { EditorActions, ThemeType } from '../milkdown/types'
import type { ThemeOption } from '../../theme/themeConfig'

export interface ToolbarProps {
  content: string
  onContentChange: (content: string) => void
  onFileOpened?: (filePath?: string) => void
  currentFilePath?: string | null
  theme: ThemeType
  onThemeChange: (theme: ThemeType) => void
  editorActionsRef?: RefObject<EditorActions | null>
  themeOptions?: ThemeOption[]
}

export interface ToolbarActions {
  createNewFile: () => void
  openFile: () => void
  saveFile: () => void
  saveFileAs: () => void
  undo: () => void
  redo: () => void
  cut: () => void
  copy: () => void
  paste: () => void
  selectAll: () => void
  bold: () => void
  italic: () => void
  strikeThrough: () => void
  code: () => void
  codeBlock: () => void
  link: () => void
  image: () => void
  table: () => void
  heading: (level: number) => void
  orderedList: () => void
  unorderedList: () => void
  blockquote: () => void
  horizontalRule: () => void
  mathInline: () => void
  mathBlock: () => void
  openAbout: () => void
  openShortcuts: () => void
  confirmInsertTable: () => void
}

export type ToolbarActionName =
  | 'createNewFile'
  | 'openFile'
  | 'saveFile'
  | 'saveFileAs'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'
  | 'bold'
  | 'italic'
  | 'strikeThrough'
  | 'code'
  | 'codeBlock'
  | 'link'
  | 'image'
  | 'table'
  | 'heading'
  | 'orderedList'
  | 'unorderedList'
  | 'blockquote'
  | 'horizontalRule'
  | 'mathInline'
  | 'mathBlock'
  | 'openAbout'
  | 'openShortcuts'
  | 'confirmInsertTable'

export interface ToolbarMenuLeafItem {
  kind: 'item'
  label: string
  action: ToolbarActionName
  shortcut?: string
  level?: number
  disabled?: boolean
}

export interface ToolbarMenuDividerItem {
  kind: 'separator'
}

export interface ToolbarMenuGroupItem {
  kind: 'group'
  label: string
  items: ToolbarMenuLeafItem[]
}

export type ToolbarMenuNode = ToolbarMenuLeafItem | ToolbarMenuDividerItem | ToolbarMenuGroupItem

export interface ToolbarMenuSection {
  label: string
  nodes: ToolbarMenuNode[]
}

export interface ToolbarUiState {
  aboutDialogOpen: boolean
  shortcutsDialogOpen: boolean
  tableDialogOpen: boolean
  tableRows: number
  tableCols: number
  setAboutDialogOpen: (open: boolean) => void
  setShortcutsDialogOpen: (open: boolean) => void
  setTableDialogOpen: (open: boolean) => void
  setTableRows: (rows: number) => void
  setTableCols: (cols: number) => void
}