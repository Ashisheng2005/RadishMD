export type BlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "heading6"
  | "code"
  | "quote"
  | "list"
  | "ordered"
  | "task"
  | "hr"
  | "table"

export interface Block {
  id: string
  sourceLine: number
  type: BlockType
  content: string
  checked?: boolean
  language?: string
}

export interface BlockUpdateEvent {
  blockId: string
  content: string
  checked?: boolean
}

export interface BlockKeyDownEvent {
  blockId: string
  key: "Enter" | "Backspace" | "Tab" | "Escape"
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

export type BlockCallback = (event: BlockUpdateEvent) => void
export type BlockKeyHandler = (event: BlockKeyDownEvent) => void
