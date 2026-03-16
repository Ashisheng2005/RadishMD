import { useEffect, useRef, useImperativeHandle, useState } from 'react'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, commandsCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { wrapInHeadingCommand, wrapInBulletListCommand, wrapInOrderedListCommand, wrapInBlockquoteCommand, createCodeBlockCommand, insertHrCommand, toggleInlineCodeCommand } from '@milkdown/preset-commonmark'
import { gfm, insertTableCommand } from '@milkdown/preset-gfm'
import { nord } from '@milkdown/theme-nord'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { clipboard } from '@milkdown/plugin-clipboard'
import { prism } from '@milkdown/plugin-prism'
// Import refractor with all languages - registers all supported languages
import 'refractor/all'

import '@milkdown/theme-nord/style.css'
import 'prismjs/themes/prism.css'

export type ThemeType = 'light' | 'nord' | 'dark' | 'warm'

// Supported code languages
const CODE_LANGUAGES = [
  { value: '', label: '无语言' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
  { value: 'xml', label: 'XML' },
  { value: 'csharp', label: 'C#' },
  { value: 'php', label: 'PHP' },
]

// Expose editor API for Toolbar
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

interface EditorProps {
  initialValue?: string
  onChange?: (markdown: string) => void
  theme?: ThemeType
  editorRef?: React.RefObject<EditorActions | null>
}

function MilkdownEditor({
  initialValue = '# Hello World\n\nStart typing...',
  onChange,
  theme = 'nord',
  editorRef
}: EditorProps) {
  const editorInstanceRef = useRef<Editor | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorViewRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commandsRef = useRef<any>(null)
  const divRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)

  // State for code block language selection
  const [activeCodeBlock, setActiveCodeBlock] = useState<{
    pos: number
    lang: string
    rect: DOMRect
  } | null>(null)

  // State for search query in language selector
  const [languageSearch, setLanguageSearch] = useState('')

  // Keep onChange ref up to date
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // Update code block language using ProseMirror
  const updateCodeBlockLanguage = (language: string) => {
    const view = editorViewRef.current
    if (!view || !activeCodeBlock) return

    const { state, dispatch } = view
    const pos = activeCodeBlock.pos

    // Get the node at position
    const node = state.doc.nodeAt(pos)
    if (!node || node.type.name !== 'code_block') return

    // Create transaction to update the node's language attribute
    // Use empty string for "no language" to match Milkdown/Prism expectations
    const newAttrs = {
      ...node.attrs,
      language: language || '',
    }
    const tr = state.tr.setNodeMarkup(pos, undefined, newAttrs)
    dispatch(tr)

    closeLanguageSelector()
  }

  // Clear search when selector closes
  const closeLanguageSelector = () => {
    setLanguageSearch('')
    setActiveCodeBlock(null)
  }

  // Add click and focus listeners when component mounts
  useEffect(() => {
    const div = divRef.current
    if (!div) return

    // Helper function to find code block position and update state
    const updateCodeBlockState = () => {
      const view = editorViewRef.current
      if (!view) return

      const { state } = view
      const { $from } = state.selection
      const parentType = $from.parent.type.name

      // Check if cursor is inside a code block
      if (parentType === 'code_block') {
        const pos = $from.before($from.depth)
        const node = state.doc.nodeAt(pos)

        if (node && node.type.name === 'code_block') {
          // Get the DOM node for this position
          try {
            const domNode = view.nodeDOM(pos) as HTMLElement
            if (domNode) {
              const rect = domNode.getBoundingClientRect()
              const lang = node.attrs.language || ''
              setActiveCodeBlock({ pos, lang, rect })
              return
            }
          } catch (e) {
            // Fallback: try to find by searching document
          }

          // Fallback: find code block by DOM element that contains the cursor
          const selection = window.getSelection()
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0)
            const container = range.commonAncestorContainer as HTMLElement
            const codeBlockEl = container.closest?.('pre') ||
              container.parentElement?.closest?.('pre')

            if (codeBlockEl) {
              const rect = codeBlockEl.getBoundingClientRect()
              const lang = node.attrs.language || ''
              setActiveCodeBlock({ pos, lang, rect })
              return
            }
          }

          // Last fallback: use div position
          const rect = div.getBoundingClientRect()
          const lang = node.attrs.language || ''
          setActiveCodeBlock({ pos, lang, rect })
        }
      } else {
        // Cursor is not in a code block
        closeLanguageSelector()
      }
    }

    // Handle selection changes - detect when cursor enters/leaves code block
    const handleSelectionChange = () => {
      // Only process if selection is inside our editor
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return

      const range = selection.getRangeAt(0)
      if (!div.contains(range.commonAncestorContainer)) return

      updateCodeBlockState()
    }

    // Also handle click to update position when clicking inside code block
    const handleEditorClick = () => {
      updateCodeBlockState()
    }

    // Handle keyboard events
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeCodeBlock) {
        closeLanguageSelector()
      }
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    div.addEventListener('click', handleEditorClick)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      div.removeEventListener('click', handleEditorClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeCodeBlock])

  // Helper function to insert markdown using ProseMirror
  const insertMarkdown = (markdown: string) => {
    const view = editorViewRef.current
    if (!view) {
      // Fallback to DOM manipulation if view not available
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        const textNode = document.createTextNode(markdown)
        range.deleteContents()
        range.insertNode(textNode)
        range.setStartAfter(textNode)
        range.setEndAfter(textNode)
        selection.removeAllRanges()
        selection.addRange(range)
      }
      return
    }

    const { state, dispatch } = view
    const { from, to } = state.selection

    // Insert the markdown text
    const tr = state.tr.insertText(markdown, from, to)
    dispatch(tr)
  }

  // Expose editor actions
  useImperativeHandle(editorRef, () => ({
    insertText: (text: string) => {
      insertMarkdown(text)
    },
    insertCodeBlock: (language?: string) => {
      // Use Milkdown command to create code block
      const commands = commandsRef.current
      const view = editorViewRef.current
      if (commands && view) {
        // Only pass language if it's provided and not empty
        // This ensures the code block is created without a language attribute
        if (language) {
          commands.call(createCodeBlockCommand.key, language)
        } else {
          commands.call(createCodeBlockCommand.key)
        }

        // Fix: Remove leading space that Milkdown might add
        const { state, dispatch } = view
        const { $from } = state.selection
        // Check if the first character is a space and remove it
        if ($from.parent.textContent.startsWith(' ')) {
          const pos = $from.start()
          const tr = state.tr.delete(pos, pos + 1)
          dispatch(tr)
        }
      } else {
        // Fallback to markdown insertion
        const codeBlock = '\n```' + (language || '') + '\ncode here\n```\n'
        insertMarkdown(codeBlock)
      }
    },
    insertTable: (rows = 3, cols = 3) => {
      // Use Milkdown command to insert table
      const commands = commandsRef.current
      if (commands) {
        commands.call(insertTableCommand.key, { row: rows, col: cols })
      } else {
        // Fallback to markdown insertion
        let table = '\n|'
        for (let c = 0; c < cols; c++) {
          table += ` 列${c + 1} |`
        }
        table += '\n|'
        for (let c = 0; c < cols; c++) {
          table += ' --- |'
        }
        for (let r = 0; r < rows - 1; r++) {
          table += '\n|'
          for (let c = 0; c < cols; c++) {
            table += ' |'
          }
        }
        table += '\n'
        insertMarkdown(table)
      }
    },
    insertLink: (url?: string) => {
      const linkUrl = url || prompt('请输入链接地址:')
      if (linkUrl) {
        const selection = window.getSelection()
        const selectedText = selection?.toString() || '链接文本'
        const linkMarkdown = `[${selectedText}](${linkUrl})`
        insertMarkdown(linkMarkdown)
      }
    },
    insertImage: (url?: string) => {
      const imageUrl = url || prompt('请输入图片地址:')
      if (imageUrl) {
        const imageMarkdown = `![图片](${imageUrl})`
        insertMarkdown(imageMarkdown)
      }
    },
    toggleBold: () => {
      document.execCommand('bold')
    },
    toggleItalic: () => {
      document.execCommand('italic')
    },
    toggleStrikeThrough: () => {
      document.execCommand('strikeThrough')
    },
    toggleCode: () => {
      // Use Milkdown command to toggle inline code
      const commands = commandsRef.current
      if (commands) {
        commands.call(toggleInlineCodeCommand.key)
      } else {
        // Fallback to raw markdown insertion
        const selection = window.getSelection()
        const selectedText = selection?.toString() || ''
        const codeMarkdown = selectedText ? `\`${selectedText}\`` : '`code`'
        insertMarkdown(codeMarkdown)
      }
    },
    undo: () => {
      document.execCommand('undo')
    },
    redo: () => {
      document.execCommand('redo')
    },
    insertHeading: (level: number) => {
      // Use Milkdown command to wrap in heading
      const commands = commandsRef.current
      if (commands) {
        commands.call(wrapInHeadingCommand.key, level)
      } else {
        // Fallback to markdown insertion
        const hashes = '#'.repeat(Math.min(Math.max(level, 1), 6))
        const headingMarkdown = `\n${hashes} `
        insertMarkdown(headingMarkdown)
      }
    },
    insertOrderedList: () => {
      // Use Milkdown command to wrap in ordered list
      const commands = commandsRef.current
      if (commands) {
        commands.call(wrapInOrderedListCommand.key)
      } else {
        // Fallback to markdown insertion
        const listMarkdown = '\n1. '
        insertMarkdown(listMarkdown)
      }
    },
    insertUnorderedList: () => {
      // Use Milkdown command to wrap in bullet list
      const commands = commandsRef.current
      if (commands) {
        commands.call(wrapInBulletListCommand.key)
      } else {
        // Fallback to markdown insertion
        const listMarkdown = '\n- '
        insertMarkdown(listMarkdown)
      }
    },
    insertBlockquote: () => {
      // Use Milkdown command to wrap in blockquote
      const commands = commandsRef.current
      if (commands) {
        commands.call(wrapInBlockquoteCommand.key)
      } else {
        // Fallback to markdown insertion
        const quoteMarkdown = '\n> '
        insertMarkdown(quoteMarkdown)
      }
    },
    insertHorizontalRule: () => {
      // Use Milkdown command to insert horizontal rule
      const commands = commandsRef.current
      if (commands) {
        commands.call(insertHrCommand.key)
      } else {
        // Fallback to markdown insertion
        const hrMarkdown = '\n---\n'
        insertMarkdown(hrMarkdown)
      }
    },
    insertMathInline: () => {
      // Insert inline math formula
      const mathMarkdown = '$formula$'
      insertMarkdown(mathMarkdown)
    },
    insertMathBlock: () => {
      // Insert block math formula
      const mathMarkdown = '\n$$\nformula\n$$\n'
      insertMarkdown(mathMarkdown)
    }
  }), [])

  useEffect(() => {
    if (!divRef.current || !editorRef) return

    let editorInstance: Editor | null = null

    const makeEditor = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyCtx: any = listenerCtx

      editorInstance = await Editor.make()
        .config((ctx: any) => {
          ctx.set(rootCtx, divRef.current!)
          ctx.set(defaultValueCtx, initialValue)
        })
        .config((ctx: any) => {
          ctx.get(anyCtx).markdownUpdated((_ctx: any, markdown: string, _prevMarkdown: string) => {
            if (onChangeRef.current) {
              onChangeRef.current(markdown)
            }
          })
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .use(nord as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .use(commonmark as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .use(gfm as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .use(listener as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .use(history as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .use(clipboard as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .use(prism as any)
        .create()

      editorInstanceRef.current = editorInstance

      // Store editor view and commands for later use - use setTimeout to ensure ctx is ready
      setTimeout(() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ctx: any = (editorInstance as any).ctx
          const view = ctx.get(editorViewCtx)
          const commands = ctx.get(commandsCtx)
          editorViewRef.current = view
          commandsRef.current = commands
        } catch (e) {
          console.warn('Could not get editor view or commands:', e)
        }
      }, 100)
    }

    makeEditor()

    return () => {
      if (editorInstance) {
        editorInstance.destroy()
      }
    }
  }, [])

  // 根据主题返回不同的样式
  const getThemeClass = () => {
    switch (theme) {
      case 'light':
        return 'bg-white text-gray-900'
      case 'nord':
        return 'bg-[#2e3440] text-[#eceff4]'
      case 'dark':
        return 'bg-[#1e1e1e] text-[#d4d4d4]'
      case 'warm':
        return 'bg-[#1d1d1d] text-[#bbbbbb]'
      default:
        return 'bg-[#2e3440] text-[#eceff4]'
    }
  }

  return (
    <div className="relative">
      <div
        ref={divRef}
        className={`max-w-3xl mx-auto rounded-lg p-6 min-h-[500px] ${getThemeClass()}`}
      />
      {/* Code block language selector */}
      {activeCodeBlock && (
        <div
          style={{
            position: 'fixed',
            left: activeCodeBlock.rect.left,
            top: activeCodeBlock.rect.bottom + 4,
            zIndex: 1000,
            backgroundColor: 'var(--background)',
            color: 'var(--foreground)',
          }}
          className="border rounded-md shadow-lg w-[200px]"
        >
          {/* Search input */}
          <div className="p-2">
            <input
              type="text"
              placeholder={activeCodeBlock.lang !== undefined ? CODE_LANGUAGES.find(l => l.value === activeCodeBlock.lang)?.label || activeCodeBlock.lang || "无语言" : "输入搜索语言..."}
              value={languageSearch}
              onChange={(e) => setLanguageSearch(e.target.value)}
              className="w-full text-xs px-2 py-1.5 border rounded-md outline-none focus:border-blue-500 bg-transparent"
              autoFocus
            />
          </div>
          {/* Language options - only show when there's a search query */}
          {languageSearch && (
            <div className="max-h-[200px] overflow-y-auto border-t">
              {CODE_LANGUAGES.filter(lang =>
                lang.label.toLowerCase().includes(languageSearch.toLowerCase()) ||
                lang.value.toLowerCase().includes(languageSearch.toLowerCase())
              ).map((lang) => (
                <button
                  key={lang.value}
                  className={`w-full text-xs px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${
                    activeCodeBlock.lang === lang.value ? 'bg-gray-100 dark:bg-gray-700' : ''
                  }`}
                  onClick={() => {
                    updateCodeBlockLanguage(lang.value)
                    setLanguageSearch('')
                  }}
                >
                  {activeCodeBlock.lang === lang.value && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  {lang.label}
                </button>
              ))}
              {CODE_LANGUAGES.filter(lang =>
                lang.label.toLowerCase().includes(languageSearch.toLowerCase()) ||
                lang.value.toLowerCase().includes(languageSearch.toLowerCase())
              ).length === 0 && (
                <div className="text-xs px-3 py-2 text-gray-500">未找到匹配的语言</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default MilkdownEditor
