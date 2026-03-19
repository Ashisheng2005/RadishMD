import { useRef, useState } from 'react'
import type { EditorActions, ThemeType } from '../components/MilkdownEditor'

export function useEditorWorkspace() {
  const [content, setContent] = useState('# Hello World\n\nStart typing your markdown here...')
  const [theme, setTheme] = useState<ThemeType>('nord')
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null)
  const [editorKey, setEditorKey] = useState(0)
  const editorActionsRef = useRef<EditorActions>(null)

  const handleContentChange = (nextContent: string) => {
    setContent(nextContent)
  }

  const handleFileOpened = (filePath?: string) => {
    setEditorKey((value) => value + 1)
    setCurrentFilePath(filePath ?? null)
  }

  return {
    content,
    setContent,
    theme,
    setTheme,
    currentFilePath,
    editorKey,
    editorActionsRef,
    handleContentChange,
    handleFileOpened,
  }
}