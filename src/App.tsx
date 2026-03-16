import { useState, useRef } from 'react'
import MilkdownEditor, { ThemeType, EditorActions } from './components/MilkdownEditor'
import Toolbar from './components/Toolbar'

function App() {
  const [content, setContent] = useState('# Hello World\n\nStart typing your markdown here...')
  const [theme, setTheme] = useState<ThemeType>('nord')
  // Use a ref to track editor key - only changes when file is opened
  const editorKeyRef = useRef(0)
  // Ref for editor actions that can be used by Toolbar
  const editorActionsRef = useRef<EditorActions>(null)

  const handleContentChange = (newContent: string) => {
    setContent(newContent)
  }

  const handleFileOpened = () => {
    // Increment key to force re-create editor when file is opened
    editorKeyRef.current += 1
  }

  return (
    <div className="h-screen flex flex-col" data-theme={theme}>
      <Toolbar
        content={content}
        onContentChange={handleContentChange}
        onFileOpened={handleFileOpened}
        theme={theme}
        onThemeChange={setTheme}
        editorActionsRef={editorActionsRef}
      />
      <main className="flex-1 overflow-auto p-6 editor-container">
        <MilkdownEditor
          key={editorKeyRef.current}
          initialValue={content}
          onChange={setContent}
          theme={theme}
          editorRef={editorActionsRef}
        />
      </main>
    </div>
  )
}

export default App
