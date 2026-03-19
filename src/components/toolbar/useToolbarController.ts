import { useEffect, useState } from 'react'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import type { ToolbarActions, ToolbarProps, ToolbarUiState } from './types'

export function useToolbarController({
  content,
  onContentChange,
  onFileOpened,
  currentFilePath,
  editorActionsRef,
}: ToolbarProps) {
  const [aboutDialogOpen, setAboutDialogOpen] = useState(false)
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false)
  const [tableDialogOpen, setTableDialogOpen] = useState(false)
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)

  const getEditorActions = () => editorActionsRef?.current

  const handleOpenFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
      })

      if (selected) {
        const fileContent = await readTextFile(selected)
        onContentChange(fileContent)
        onFileOpened?.(selected)
      }
    } catch (error) {
      console.error('打开文件失败:', error)
    }
  }

  const handleSaveFile = async () => {
    try {
      if (currentFilePath) {
        await writeTextFile(currentFilePath, content)
        return
      }

      const selected = await save({
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })

      if (selected) {
        await writeTextFile(selected, content)
        onFileOpened?.(selected)
      }
    } catch (error) {
      console.error('保存文件失败:', error)
    }
  }

  const handleSaveFileAs = async () => {
    try {
      const selected = await save({
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })

      if (selected) {
        await writeTextFile(selected, content)
        onFileOpened?.(selected)
      }
    } catch (error) {
      console.error('另存为失败:', error)
    }
  }

  const handleNewFile = () => {
    onContentChange('')
    onFileOpened?.()
  }

  const handleUndo = () => getEditorActions()?.undo()
  const handleRedo = () => getEditorActions()?.redo()
  const handleBold = () => getEditorActions()?.toggleBold()
  const handleItalic = () => getEditorActions()?.toggleItalic()
  const handleStrikeThrough = () => getEditorActions()?.toggleStrikeThrough()
  const handleCode = () => getEditorActions()?.toggleCode()
  const handleCodeBlock = () => getEditorActions()?.insertCodeBlock()
  const handleLink = () => getEditorActions()?.insertLink()
  const handleImage = () => getEditorActions()?.insertImage()
  const handleTable = () => setTableDialogOpen(true)
  const handleHeading = (level: number) => getEditorActions()?.insertHeading(level)
  const handleOrderedList = () => getEditorActions()?.insertOrderedList()
  const handleUnorderedList = () => getEditorActions()?.insertUnorderedList()
  const handleBlockquote = () => getEditorActions()?.insertBlockquote()
  const handleHorizontalRule = () => getEditorActions()?.insertHorizontalRule()
  const handleMathInline = () => getEditorActions()?.insertMathInline()
  const handleMathBlock = () => getEditorActions()?.insertMathBlock()

  const handleCut = async () => {
    try {
      await navigator.clipboard.writeText(window.getSelection()?.toString() || '')
      document.execCommand('delete')
    } catch (error) {
      console.error('剪切失败:', error)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.getSelection()?.toString() || '')
    } catch (error) {
      console.error('复制失败:', error)
    }
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      getEditorActions()?.insertText(text)
    } catch (error) {
      console.error('粘贴失败:', error)
    }
  }

  const handleSelectAll = () => {
    document.execCommand('selectAll')
  }

  const confirmInsertTable = () => {
    getEditorActions()?.insertTable(tableRows, tableCols)
    setTableDialogOpen(false)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return

      switch (event.key.toLowerCase()) {
        case 'n':
          event.preventDefault()
          handleNewFile()
          break
        case 'o':
          event.preventDefault()
          void handleOpenFile()
          break
        case 's':
          event.preventDefault()
          if (event.shiftKey) {
            void handleSaveFileAs()
          } else {
            void handleSaveFile()
          }
          break
        case 'b':
          event.preventDefault()
          handleBold()
          break
        case 'i':
          event.preventDefault()
          handleItalic()
          break
        case 'z':
          event.preventDefault()
          handleUndo()
          break
        case 'y':
          event.preventDefault()
          handleRedo()
          break
        case 'k':
          event.preventDefault()
          if (event.shiftKey) {
            handleImage()
          } else {
            handleLink()
          }
          break
        default:
          break
      }

      if (event.key >= '1' && event.key <= '6' && !event.shiftKey) {
        event.preventDefault()
        handleHeading(Number.parseInt(event.key, 10))
      }

      if (event.key.toLowerCase() === 'm' && event.shiftKey) {
        event.preventDefault()
        handleCodeBlock()
      }

      if (event.key === '`' && !event.shiftKey) {
        event.preventDefault()
        handleCode()
      }

      if (event.key.toLowerCase() === 'l' && event.shiftKey) {
        event.preventDefault()
        handleLink()
      }

      if (event.key === '7' && event.shiftKey) {
        event.preventDefault()
        handleOrderedList()
      }

      if (event.key === '8' && event.shiftKey) {
        event.preventDefault()
        handleUnorderedList()
      }

      if (event.key === '.' && event.shiftKey) {
        event.preventDefault()
        handleBlockquote()
      }

      if (event.key === '-' && event.shiftKey) {
        event.preventDefault()
        handleHorizontalRule()
      }

      if (event.key.toLowerCase() === 'p' && event.shiftKey) {
        event.preventDefault()
        handleMathInline()
      }

      if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault()
        handleMathBlock()
      }

      if (event.altKey && event.shiftKey && event.key === '5') {
        event.preventDefault()
        handleStrikeThrough()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [content, currentFilePath, onContentChange, onFileOpened, editorActionsRef])

  const actions: ToolbarActions = {
    createNewFile: handleNewFile,
    openFile: handleOpenFile,
    saveFile: handleSaveFile,
    saveFileAs: handleSaveFileAs,
    undo: handleUndo,
    redo: handleRedo,
    cut: handleCut,
    copy: handleCopy,
    paste: handlePaste,
    selectAll: handleSelectAll,
    bold: handleBold,
    italic: handleItalic,
    strikeThrough: handleStrikeThrough,
    code: handleCode,
    codeBlock: handleCodeBlock,
    link: handleLink,
    image: handleImage,
    table: handleTable,
    heading: handleHeading,
    orderedList: handleOrderedList,
    unorderedList: handleUnorderedList,
    blockquote: handleBlockquote,
    horizontalRule: handleHorizontalRule,
    mathInline: handleMathInline,
    mathBlock: handleMathBlock,
    openAbout: () => setAboutDialogOpen(true),
    openShortcuts: () => setShortcutsDialogOpen(true),
    confirmInsertTable,
  }

  const ui: ToolbarUiState = {
    aboutDialogOpen,
    shortcutsDialogOpen,
    tableDialogOpen,
    tableRows,
    tableCols,
    setAboutDialogOpen,
    setShortcutsDialogOpen,
    setTableDialogOpen,
    setTableRows,
    setTableCols,
  }

  return {
    actions,
    ui,
  }
}