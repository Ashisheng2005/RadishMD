import { useEffect, useRef } from 'react'
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { nord } from '@milkdown/theme-nord'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { clipboard } from '@milkdown/plugin-clipboard'

import '@milkdown/theme-nord/style.css'

interface EditorProps {
  initialValue?: string
  onChange?: (markdown: string) => void
  theme?: 'nord' | 'light'
}

function MilkdownEditor({
  initialValue = '# Hello World\n\nStart typing...',
  onChange,
  theme = 'nord'
}: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editorRef.current) return

    let editorInstance: Editor | null = null

    const makeEditor = async () => {
      editorInstance = await Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, editorRef.current!)
          ctx.set(defaultValueCtx, initialValue)
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            if (onChange) {
              onChange(markdown)
            }
          })
        })
        .use(nord)
        .use(commonmark)
        .use(gfm)
        .use(listener)
        .use(history)
        .use(clipboard)
        .create()
    }

    makeEditor()

    return () => {
      if (editorInstance) {
        editorInstance.destroy()
      }
    }
  }, []) // Only run once - content is set via key

  return (
    <div
      ref={editorRef}
      className={`max-w-3xl mx-auto rounded-lg p-6 min-h-[500px] ${
        theme === 'light'
          ? 'bg-white text-gray-900'
          : 'bg-slate-900 text-gray-100'
      }`}
    />
  )
}

export default MilkdownEditor
