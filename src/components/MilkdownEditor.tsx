import { useEffect, useImperativeHandle, useRef } from 'react'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, commandsCtx, schemaCtx } from '@milkdown/core'
import { commonmark, createCodeBlockCommand, insertHrCommand, toggleInlineCodeCommand, wrapInBlockquoteCommand, wrapInBulletListCommand, wrapInHeadingCommand, wrapInOrderedListCommand } from '@milkdown/preset-commonmark'
import { gfm, insertTableCommand } from '@milkdown/preset-gfm'
import { nord } from '@milkdown/theme-nord'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { clipboard } from '@milkdown/plugin-clipboard'
import { prism } from '@milkdown/plugin-prism'
import { katexOptionsCtx, mathInlineInputRule, mathInlineSchema, remarkMathPlugin } from '@milkdown/plugin-math'
import { Selection } from '@milkdown/prose/state'
import 'refractor/all'

import { CodeBlockLanguageSelector } from './milkdown/CodeBlockLanguageSelector'
import { customMathBlockInputRule, customMathBlockSchema, customMathBlockView } from './milkdown/mathBlock'
import { useCodeBlockLanguageSelector } from './milkdown/useCodeBlockLanguageSelector'
import type { EditorActions, ThemeType } from './milkdown/types'

import '@milkdown/theme-nord/style.css'
import 'prismjs/themes/prism.css'
import 'katex/dist/katex.min.css'
export type { EditorActions, ThemeType } from './milkdown/types'
import type { RefObject } from 'react'

interface EditorProps {
  initialValue?: string
  onChange?: (markdown: string) => void
  theme?: ThemeType
  editorRef?: RefObject<EditorActions | null>
}

function MilkdownEditor({
  initialValue = '# Hello World\n\nStart typing...',
  onChange,
  theme = 'nord',
  editorRef,
}: EditorProps) {
  const editorInstanceRef = useRef<Editor | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorViewRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commandsRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schemaRef = useRef<any>(null)
  const divRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)

  const {
    activeCodeBlock,
    languageSearch,
    selectedIndex,
    setLanguageSearch,
    setSelectedIndex,
    closeLanguageSelector,
    refreshCodeBlockState,
    updateCodeBlockLanguage,
    markNewCodeBlock,
  } = useCodeBlockLanguageSelector({
    editorViewRef,
    containerRef: divRef,
  })

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const insertMarkdown = (markdown: string) => {
    const view = editorViewRef.current

    if (!view) {
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
    dispatch(state.tr.insertText(markdown, from, to))
  }

  const getEditorContext = () => {
    const editorInstance = editorInstanceRef.current
    return editorInstance ? (editorInstance as any).ctx : null
  }

  useImperativeHandle(editorRef, () => ({
    insertText: (text: string) => {
      insertMarkdown(text)
    },
    insertCodeBlock: (language?: string) => {
      const commands = commandsRef.current
      const view = editorViewRef.current

      if (commands && view) {
        if (language) {
          commands.call(createCodeBlockCommand.key, language)
        } else {
          commands.call(createCodeBlockCommand.key)
        }

        const { state, dispatch } = view
        const { $from } = state.selection

        if ($from.parent.textContent.startsWith(' ')) {
          const pos = $from.start()
          dispatch(state.tr.delete(pos, pos + 1))
        }

        window.setTimeout(() => {
          const { state: nextState } = view
          const { $from: nextFrom } = nextState.selection

          if (nextFrom.parent.type.name !== 'code_block') return

          const pos = nextFrom.before(nextFrom.depth)
          const node = nextState.doc.nodeAt(pos)
          if (!node || node.type.name !== 'code_block') return

          markNewCodeBlock(pos)
          setLanguageSearch('')
          refreshCodeBlockState()
        }, 50)

        return
      }

      const codeBlockMarkdown = `\n\`\`\`${language || ''}\ncode here\n\`\`\`\n`
      insertMarkdown(codeBlockMarkdown)
    },
    insertTable: (rows = 3, cols = 3) => {
      const commands = commandsRef.current

      if (commands) {
        commands.call(insertTableCommand.key, { row: rows, col: cols })
        return
      }

      let tableMarkdown = '\n|'
      for (let column = 0; column < cols; column += 1) {
        tableMarkdown += ` 列${column + 1} |`
      }
      tableMarkdown += '\n|'
      for (let column = 0; column < cols; column += 1) {
        tableMarkdown += ' --- |'
      }
      for (let row = 0; row < rows - 1; row += 1) {
        tableMarkdown += '\n|'
        for (let column = 0; column < cols; column += 1) {
          tableMarkdown += ' |'
        }
      }
      tableMarkdown += '\n'
      insertMarkdown(tableMarkdown)
    },
    insertLink: (url?: string) => {
      const linkUrl = url || prompt('请输入链接地址:')
      if (!linkUrl) return

      const selection = window.getSelection()
      const selectedText = selection?.toString() || '链接文本'
      insertMarkdown(`[${selectedText}](${linkUrl})`)
    },
    insertImage: (url?: string) => {
      const imageUrl = url || prompt('请输入图片地址:')
      if (!imageUrl) return

      const view = editorViewRef.current
      const schema = schemaRef.current

      if (view && schema) {
        const imageNode = schema.nodes['image']

        if (imageNode) {
          const { state, dispatch } = view
          const image = imageNode.create({
            src: imageUrl,
            alt: '图片',
            title: '图片',
          })

          dispatch(state.tr.replaceSelectionWith(image))
          view.focus()
          return
        }
      }

      insertMarkdown(`![图片](${imageUrl})`)
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
      const commands = commandsRef.current
      if (commands) {
        commands.call(toggleInlineCodeCommand.key)
        return
      }

      const selection = window.getSelection()
      const selectedText = selection?.toString() || ''
      insertMarkdown(selectedText ? `\`${selectedText}\`` : '`code`')
    },
    undo: () => {
      document.execCommand('undo')
    },
    redo: () => {
      document.execCommand('redo')
    },
    insertHeading: (level: number) => {
      const commands = commandsRef.current
      if (commands) {
        commands.call(wrapInHeadingCommand.key, level)
        return
      }

      const hashes = '#'.repeat(Math.min(Math.max(level, 1), 6))
      insertMarkdown(`\n${hashes} `)
    },
    insertOrderedList: () => {
      const commands = commandsRef.current
      if (commands) {
        commands.call(wrapInOrderedListCommand.key)
        return
      }

      insertMarkdown('\n1. ')
    },
    insertUnorderedList: () => {
      const commands = commandsRef.current
      if (commands) {
        commands.call(wrapInBulletListCommand.key)
        return
      }

      insertMarkdown('\n- ')
    },
    insertBlockquote: () => {
      const commands = commandsRef.current
      if (commands) {
        commands.call(wrapInBlockquoteCommand.key)
        return
      }

      insertMarkdown('\n> ')
    },
    insertHorizontalRule: () => {
      const commands = commandsRef.current
      if (commands) {
        commands.call(insertHrCommand.key)
        return
      }

      insertMarkdown('\n---\n')
    },
    insertMathInline: () => {
      const view = editorViewRef.current
      const ctx = getEditorContext()

      if (view && ctx) {
        const mathType = mathInlineSchema.type(ctx)
        if (mathType) {
          const { state, dispatch } = view
          const node = mathType.create()
          dispatch(state.tr.replaceSelectionWith(node))
          view.focus()
          return
        }
      }

      insertMarkdown('$formula$')
    },
    insertMathBlock: () => {
      const view = editorViewRef.current
      const ctx = getEditorContext()

      if (view && ctx) {
        const mathBlockType = customMathBlockSchema.type(ctx)
        if (mathBlockType) {
          const { state, dispatch } = view
          const from = state.selection.from
          const node = mathBlockType.create({ value: '' })
          const transaction = state.tr.replaceSelectionWith(node)
          const selection = Selection.findFrom(transaction.doc.resolve(from), 1, true)

          if (selection) {
            transaction.setSelection(selection)
          }

          dispatch(transaction.scrollIntoView())
          view.focus()
          return
        }
      }

      insertMarkdown('$$\nformula\n$$')
    },
  }), [])

  useEffect(() => {
    if (!divRef.current || !editorRef) return

    let editorInstance: Editor | null = null

    const createEditor = async () => {
      // 中文说明：监听器通过 ctx 回调将 Markdown 变化同步回外层状态
      const anyListenerCtx: any = listenerCtx

      editorInstance = await Editor.make()
        .config((ctx: any) => {
          ctx.set(rootCtx, divRef.current!)
          ctx.set(defaultValueCtx, initialValue)
        })
        .config((ctx: any) => {
          ctx.get(anyListenerCtx).markdownUpdated((_ctx: any, markdown: string) => {
            if (onChangeRef.current) {
              onChangeRef.current(markdown)
            }
          })
        })
        .use(nord as any)
        .use(commonmark as any)
        .use(gfm as any)
        .use(listener as any)
        .use(history as any)
        .use(clipboard as any)
        .use(prism as any)
        .use(remarkMathPlugin as any)
        .use(katexOptionsCtx as any)
        .use(mathInlineSchema as any)
        .use(mathInlineInputRule as any)
        .use(customMathBlockSchema as any)
        .use(customMathBlockView as any)
        .use(customMathBlockInputRule as any)
        .create()

      editorInstanceRef.current = editorInstance

      window.setTimeout(() => {
        try {
          const ctx: any = (editorInstance as any).ctx
          editorViewRef.current = ctx.get(editorViewCtx)
          commandsRef.current = ctx.get(commandsCtx)
          schemaRef.current = ctx.get(schemaCtx)
        } catch (error) {
          console.warn('无法获取编辑器上下文:', error)
        }
      }, 100)
    }

    void createEditor()

    return () => {
      if (editorInstance) {
        editorInstance.destroy()
      }
      editorInstanceRef.current = null
    }
  }, [])

  return (
    <div className="relative">
      <div
        ref={divRef}
        data-theme={theme}
        className="mx-auto min-h-[500px] max-w-3xl rounded-lg border border-border bg-background p-6 text-foreground"
      />

      {activeCodeBlock && (
        <CodeBlockLanguageSelector
          activeCodeBlock={activeCodeBlock}
          languageSearch={languageSearch}
          selectedIndex={selectedIndex}
          onLanguageSearchChange={setLanguageSearch}
          onSelectedIndexChange={setSelectedIndex}
          onSelectLanguage={updateCodeBlockLanguage}
          onClose={closeLanguageSelector}
        />
      )}
    </div>
  )
}

export default MilkdownEditor
