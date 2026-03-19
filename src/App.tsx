import MilkdownEditor from './components/MilkdownEditor'
import Toolbar from './components/Toolbar'
import { useEditorWorkspace } from './hooks/useEditorWorkspace'

function App() {
  const {
    content,
    theme,
    currentFilePath,
    editorKey,
    editorActionsRef,
    handleContentChange,
    handleFileOpened,
    setTheme,
  } = useEditorWorkspace()

  return (
    <div className="h-screen flex flex-col" data-theme={theme}>
      <Toolbar
        content={content}
        onContentChange={handleContentChange}
        onFileOpened={handleFileOpened}
        currentFilePath={currentFilePath}
        theme={theme}
        onThemeChange={setTheme}
        editorActionsRef={editorActionsRef}
      />
      <main className="flex-1 overflow-auto p-6 editor-container">
        <MilkdownEditor
          key={editorKey}
          initialValue={content}
          onChange={handleContentChange}
          theme={theme}
          editorRef={editorActionsRef}
        />
      </main>
    </div>
  )
}

export default App
