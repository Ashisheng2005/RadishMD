import { useEffect, useRef } from 'react'
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { nord } from '@milkdown/theme-nord'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { clipboard } from '@milkdown/plugin-clipboard'

import '@milkdown/theme-nord/style.css'

export type ThemeType = 'light' | 'nord' | 'dark' | 'warm'

interface EditorProps {
  initialValue?: string
  onChange?: (markdown: string) => void
  theme?: ThemeType
}

function MilkdownEditor({
  initialValue = '# Hello World\n\nStart typing...',
  onChange,
  theme = 'nord'
}: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)

  // Keep onChange ref up to date
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!editorRef.current) return

    let editorInstance: Editor | null = null

    const makeEditor = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyCtx: any = listenerCtx
      editorInstance = await Editor.make()
        .config((ctx: any) => {
          ctx.set(rootCtx, editorRef.current!)
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
        .create()
    }

    makeEditor()

    return () => {
      if (editorInstance) {
        editorInstance.destroy()
      }
    }
  }, []) // Only run once - content is set via key

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
    <div
      ref={editorRef}
      className={`max-w-3xl mx-auto rounded-lg p-6 min-h-[500px] ${getThemeClass()}`}
    />
  )
}

export default MilkdownEditor
