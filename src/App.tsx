import { useState, useRef } from 'react'
import MilkdownEditor from './components/MilkdownEditor'
import Toolbar from './components/Toolbar'

function App() {
  const [content, setContent] = useState('# Hello World\n\nStart typing your markdown here...')
  const [theme, setTheme] = useState<'nord' | 'light'>('nord')
  // Use a ref to track editor key - only changes when file is opened
  const editorKeyRef = useRef(0)

  const handleContentChange = (newContent: string) => {
    setContent(newContent)
  }

  const handleFileOpened = () => {
    // Increment key to force re-create editor when file is opened
    editorKeyRef.current += 1
  }

  return (
    <div className={`h-screen flex flex-col ${theme === 'light' ? 'bg-white' : 'bg-slate-950'}`}>
      <header className={`px-6 py-4 border-b ${theme === 'light' ? 'bg-gray-100 border-gray-200' : 'bg-slate-900 border-slate-800'}`}>
        <h1 className={`text-xl font-semibold ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
          Markdown Editor
        </h1>
      </header>
      <Toolbar
        content={content}
        onContentChange={handleContentChange}
        onFileOpened={handleFileOpened}
        theme={theme}
        onThemeChange={setTheme}
      />
      <main className={`flex-1 overflow-auto p-6 ${theme === 'light' ? 'bg-gray-50' : 'bg-slate-950'}`}>
        <MilkdownEditor
          key={editorKeyRef.current}
          initialValue={content}
          onChange={setContent}
          theme={theme}
        />
      </main>
    </div>
  )
}

export default App
