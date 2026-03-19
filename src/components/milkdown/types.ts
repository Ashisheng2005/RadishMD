import type { ThemeType as AppThemeType } from '../../theme/themeConfig'

export type ThemeType = AppThemeType

export interface EditorActions {
  insertText: (text: string) => void
  insertCodeBlock: (language?: string) => void
  insertTable: (rows?: number, cols?: number) => void
  insertLink: (url?: string) => void
  insertImage: (url?: string) => void
  toggleBold: () => void
  toggleItalic: () => void
  toggleStrikeThrough: () => void
  toggleCode: () => void
  undo: () => void
  redo: () => void
  insertHeading: (level: number) => void
  insertOrderedList: () => void
  insertUnorderedList: () => void
  insertBlockquote: () => void
  insertHorizontalRule: () => void
  insertMathInline: () => void
  insertMathBlock: () => void
}

export interface ActiveCodeBlockState {
  pos: number
  lang: string
  rect: DOMRect
}

export interface LanguageOption {
  value: string
  label: string
}