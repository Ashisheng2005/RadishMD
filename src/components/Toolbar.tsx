import { useState, useEffect } from 'react'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { ThemeType, EditorActions } from './MilkdownEditor'

interface ToolbarProps {
  content: string
  onContentChange: (content: string) => void
  onFileOpened?: () => void
  theme: ThemeType
  onThemeChange: (theme: ThemeType) => void
  editorActionsRef?: React.RefObject<EditorActions | null>
}

function Toolbar({ content, onContentChange, onFileOpened, theme, onThemeChange, editorActionsRef }: ToolbarProps) {
  const [aboutDialogOpen, setAboutDialogOpen] = useState(false)
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false)
  const [tableDialogOpen, setTableDialogOpen] = useState(false)
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)

  const handleOpen = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Markdown',
          extensions: ['md', 'markdown', 'txt']
        }]
      })
      if (selected) {
        const fileContent = await readTextFile(selected)
        onContentChange(fileContent)
        onFileOpened?.()
      }
    } catch (error) {
      console.error('Error opening file:', error)
    }
  }

  const handleSave = async () => {
    try {
      const selected = await save({
        filters: [{
          name: 'Markdown',
          extensions: ['md']
        }]
      })
      if (selected) {
        await writeTextFile(selected, content)
      }
    } catch (error) {
      console.error('Error saving file:', error)
    }
  }

  const handleSaveAs = async () => {
    await handleSave()
  }

  const handleNewFile = () => {
    onContentChange('')
    onFileOpened?.()
  }

  // 编辑操作 - 使用 editorActionsRef
  const handleUndo = () => {
    if (editorActionsRef?.current) {
      editorActionsRef.current.undo()
    }
  }

  const handleRedo = () => {
    if (editorActionsRef?.current) {
      editorActionsRef.current.redo()
    }
  }

  const handleCut = async () => {
    try {
      await navigator.clipboard.writeText(window.getSelection()?.toString() || '')
      document.execCommand('delete')
    } catch (error) {
      console.error('Cut error:', error)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.getSelection()?.toString() || '')
    } catch (error) {
      console.error('Copy error:', error)
    }
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (editorActionsRef?.current) {
        editorActionsRef.current.insertText(text)
      }
    } catch (error) {
      console.error('Paste error:', error)
    }
  }

  const handleSelectAll = () => {
    document.execCommand('selectAll')
  }

  // 格式化操作 - 使用 editorActionsRef
  const handleBold = () => {
    if (editorActionsRef?.current) {
      editorActionsRef.current.toggleBold()
    }
  }

  const handleItalic = () => {
    if (editorActionsRef?.current) {
      editorActionsRef.current.toggleItalic()
    }
  }

  const handleStrikeThrough = () => {
    if (editorActionsRef?.current) {
      editorActionsRef.current.toggleStrikeThrough()
    }
  }

  const handleCode = () => {
    if (editorActionsRef?.current) {
      editorActionsRef.current.toggleCode()
    }
  }

  const handleCodeBlock = (language?: string) => {
    if (editorActionsRef?.current) {
      editorActionsRef.current.insertCodeBlock(language)
    }
  }

  const handleLink = () => {
    if (editorActionsRef?.current) {
      editorActionsRef.current.insertLink()
    }
  }

  const handleImage = () => {
    if (editorActionsRef?.current) {
      editorActionsRef.current.insertImage()
    }
  }

  const handleTable = () => {
    setTableDialogOpen(true)
  }

  const confirmInsertTable = () => {
    if (editorActionsRef?.current) {
      editorActionsRef.current.insertTable(tableRows, tableCols)
    }
    setTableDialogOpen(false)
  }

  // 标题操作
  const handleHeading = (level: number) => {
    if (editorActionsRef?.current) {
      editorActionsRef.current.insertHeading(level)
    }
  }

  const handleOrderedList = () => {
    if (editorActionsRef?.current) {
      editorActionsRef.current.insertOrderedList()
    }
  }

  const handleUnorderedList = () => {
    if (editorActionsRef?.current) {
      editorActionsRef.current.insertUnorderedList()
    }
  }

  const handleBlockquote = () => {
    if (editorActionsRef?.current) {
      editorActionsRef.current.insertBlockquote()
    }
  }

  const handleHorizontalRule = () => {
    if (editorActionsRef?.current) {
      editorActionsRef.current.insertHorizontalRule()
    }
  }

  const handleMathInline = () => {
    if (editorActionsRef?.current) {
      editorActionsRef.current.insertMathInline()
    }
  }

  const handleMathBlock = () => {
    if (editorActionsRef?.current) {
      editorActionsRef.current.insertMathBlock()
    }
  }

  // 快捷键处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'n':
            e.preventDefault()
            handleNewFile()
            break
          case 'o':
            e.preventDefault()
            handleOpen()
            break
          case 's':
            if (e.shiftKey) {
              e.preventDefault()
              handleSaveAs()
            } else {
              e.preventDefault()
              handleSave()
            }
            break
          case 'b':
            e.preventDefault()
            handleBold()
            break
          case 'i':
            e.preventDefault()
            handleItalic()
            break
          case 'z':
            e.preventDefault()
            handleUndo()
            break
          case 'y':
            e.preventDefault()
            handleRedo()
            break
          case 'k':
            // Ctrl+Shift+K for image
            if (e.shiftKey) {
              e.preventDefault()
              handleImage()
            } else {
              // Ctrl+K for link
              e.preventDefault()
              handleLink()
            }
            break
        }

        // Ctrl+1~6 for headings
        if (e.key >= '1' && e.key <= '6' && !e.shiftKey) {
          e.preventDefault()
          handleHeading(parseInt(e.key))
        }

        // Ctrl+Shift+M for code block
        if (e.key.toLowerCase() === 'm' && e.shiftKey) {
          e.preventDefault()
          handleCodeBlock()
        }

        // Ctrl+` for inline code
        if (e.key === '`' && !e.shiftKey) {
          e.preventDefault()
          handleCode()
        }

        // Ctrl+Shift+L for link
        if (e.key.toLowerCase() === 'l' && e.shiftKey) {
          e.preventDefault()
          handleLink()
        }

        // Ctrl+Shift+7 for ordered list
        if (e.key === '7' && e.shiftKey) {
          e.preventDefault()
          handleOrderedList()
        }

        // Ctrl+Shift+8 for unordered list
        if (e.key === '8' && e.shiftKey) {
          e.preventDefault()
          handleUnorderedList()
        }

        // Ctrl+Shift+. for blockquote
        if (e.key === '.' && e.shiftKey) {
          e.preventDefault()
          handleBlockquote()
        }

        // Ctrl+Shift+- for horizontal rule
        if (e.key === '-' && e.shiftKey) {
          e.preventDefault()
          handleHorizontalRule()
        }

        // Ctrl+Shift+P for inline math
        if (e.key.toLowerCase() === 'p' && e.shiftKey) {
          e.preventDefault()
          handleMathInline()
        }

        // Ctrl+Shift+Enter for block math
        if (e.key === 'Enter' && e.shiftKey) {
          e.preventDefault()
          handleMathBlock()
        }
      }

      // Alt+Shift+5 for strikethrough
      if (e.altKey && e.shiftKey && e.key === '5') {
        e.preventDefault()
        handleStrikeThrough()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [content, editorActionsRef])

  return (
    <>
      <div className="menu-bar">
        {/* 文件菜单 */}
        <DropdownMenu>
          <DropdownMenuTrigger className="menu-item">
            文件
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={handleNewFile}>
              新建文件
              <DropdownMenuShortcut>Ctrl+N</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleOpen}>
              打开文件
              <DropdownMenuShortcut>Ctrl+O</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSave}>
              保存
              <DropdownMenuShortcut>Ctrl+S</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSaveAs}>
              另存为
              <DropdownMenuShortcut>Ctrl+Shift+S</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              关闭
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 编辑菜单 */}
        <DropdownMenu>
          <DropdownMenuTrigger className="menu-item">
            编辑
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={handleUndo}>
              撤销
              <DropdownMenuShortcut>Ctrl+Z</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleRedo}>
              重做
              <DropdownMenuShortcut>Ctrl+Y</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleCut}>
              剪切
              <DropdownMenuShortcut>Ctrl+X</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopy}>
              复制
              <DropdownMenuShortcut>Ctrl+C</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handlePaste}>
              粘贴
              <DropdownMenuShortcut>Ctrl+V</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSelectAll}>
              全选
              <DropdownMenuShortcut>Ctrl+A</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              查找
              <DropdownMenuShortcut>Ctrl+F</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              替换
              <DropdownMenuShortcut>Ctrl+H</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 视图菜单 */}
        <DropdownMenu>
          <DropdownMenuTrigger className="menu-item">
            视图
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem disabled>
              源码模式
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              专注模式
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              打字机模式
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              侧边栏大纲
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 格式菜单 */}
        <DropdownMenu>
          <DropdownMenuTrigger className="menu-item">
            格式
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {/* 标题子菜单 */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>标题</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => handleHeading(1)}>
                  一级标题
                  <DropdownMenuShortcut>Ctrl+1</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleHeading(2)}>
                  二级标题
                  <DropdownMenuShortcut>Ctrl+2</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleHeading(3)}>
                  三级标题
                  <DropdownMenuShortcut>Ctrl+3</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleHeading(4)}>
                  四级标题
                  <DropdownMenuShortcut>Ctrl+4</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleHeading(5)}>
                  五级标题
                  <DropdownMenuShortcut>Ctrl+5</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleHeading(6)}>
                  六级标题
                  <DropdownMenuShortcut>Ctrl+6</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleBold}>
              粗体
              <DropdownMenuShortcut>Ctrl+B</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleItalic}>
              斜体
              <DropdownMenuShortcut>Ctrl+I</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleStrikeThrough}>
              删除线
              <DropdownMenuShortcut>Alt+Shift+5</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleCode}>
              行内代码
              <DropdownMenuShortcut>Ctrl+`</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                代码块
                <DropdownMenuShortcut>Ctrl+Shift+M</DropdownMenuShortcut>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => handleCodeBlock()}>
                  无语言
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCodeBlock('javascript')}>
                  JavaScript
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCodeBlock('typescript')}>
                  TypeScript
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCodeBlock('python')}>
                  Python
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCodeBlock('java')}>
                  Java
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCodeBlock('cpp')}>
                  C++
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCodeBlock('go')}>
                  Go
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCodeBlock('rust')}>
                  Rust
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCodeBlock('html')}>
                  HTML
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCodeBlock('css')}>
                  CSS
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCodeBlock('json')}>
                  JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCodeBlock('yaml')}>
                  YAML
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCodeBlock('markdown')}>
                  Markdown
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCodeBlock('sql')}>
                  SQL
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCodeBlock('bash')}>
                  Bash
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCodeBlock('xml')}>
                  XML
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCodeBlock('csharp')}>
                  C#
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCodeBlock('php')}>
                  PHP
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleOrderedList}>
              有序列表
              <DropdownMenuShortcut>Ctrl+Shift+7</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleUnorderedList}>
              无序列表
              <DropdownMenuShortcut>Ctrl+Shift+8</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleBlockquote}>
              引用
              <DropdownMenuShortcut>Ctrl+Shift+.</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLink}>
              链接
              <DropdownMenuShortcut>Ctrl+K</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleImage}>
              图片
              <DropdownMenuShortcut>Ctrl+Shift+K</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleHorizontalRule}>
              水平线
              <DropdownMenuShortcut>Ctrl+Shift+-</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleTable}>
              表格
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>数学公式</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={handleMathInline}>
                  行内公式
                  <DropdownMenuShortcut>Ctrl+Shift+P</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleMathBlock}>
                  块级公式
                  <DropdownMenuShortcut>Ctrl+Shift+Enter</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 主题菜单 */}
        <DropdownMenu>
          <DropdownMenuTrigger className="menu-item">
            主题
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={(value) => onThemeChange(value as ThemeType)}>
              <DropdownMenuRadioItem value="light">
                浅色主题
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="nord">
                Nord (蓝灰)
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                Dark (深灰)
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="warm">
                Warm (暖灰)
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 帮助菜单 */}
        <DropdownMenu>
          <DropdownMenuTrigger className="menu-item">
            帮助
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setAboutDialogOpen(true)}>
              关于
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShortcutsDialogOpen(true)}>
              快捷键列表
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onThemeChange('nord')}>
              主题设置
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 关于对话框 */}
      <Dialog open={aboutDialogOpen} onOpenChange={setAboutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>关于 Markdown 编辑器</DialogTitle>
            <DialogDescription>
              一个基于 Tauri、React 和 Milkdown 的 WYSIWYG Markdown 编辑器。
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              版本: 0.1.0
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              技术栈: Tauri 2.x + React 19 + Milkdown + Tailwind CSS
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setAboutDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 快捷键对话框 */}
      <Dialog open={shortcutsDialogOpen} onOpenChange={setShortcutsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>快捷键列表</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span>新建文件</span>
              <span className="text-muted-foreground">Ctrl+N</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>打开文件</span>
              <span className="text-muted-foreground">Ctrl+O</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>保存</span>
              <span className="text-muted-foreground">Ctrl+S</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>另存为</span>
              <span className="text-muted-foreground">Ctrl+Shift+S</span>
            </div>
            <DropdownMenuSeparator />
            <div className="flex justify-between text-sm">
              <span>撤销</span>
              <span className="text-muted-foreground">Ctrl+Z</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>重做</span>
              <span className="text-muted-foreground">Ctrl+Y</span>
            </div>
            <DropdownMenuSeparator />
            <div className="text-sm font-medium mt-2">标题</div>
            <div className="flex justify-between text-sm">
              <span>一级标题</span>
              <span className="text-muted-foreground">Ctrl+1</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>二级标题</span>
              <span className="text-muted-foreground">Ctrl+2</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>三级标题</span>
              <span className="text-muted-foreground">Ctrl+3</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>四级标题</span>
              <span className="text-muted-foreground">Ctrl+4</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>五级标题</span>
              <span className="text-muted-foreground">Ctrl+5</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>六级标题</span>
              <span className="text-muted-foreground">Ctrl+6</span>
            </div>
            <DropdownMenuSeparator />
            <div className="flex justify-between text-sm">
              <span>粗体</span>
              <span className="text-muted-foreground">Ctrl+B</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>斜体</span>
              <span className="text-muted-foreground">Ctrl+I</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>删除线</span>
              <span className="text-muted-foreground">Alt+Shift+5</span>
            </div>
            <DropdownMenuSeparator />
            <div className="flex justify-between text-sm">
              <span>行内代码</span>
              <span className="text-muted-foreground">Ctrl+`</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>代码块</span>
              <span className="text-muted-foreground">Ctrl+Shift+M</span>
            </div>
            <DropdownMenuSeparator />
            <div className="flex justify-between text-sm">
              <span>有序列表</span>
              <span className="text-muted-foreground">Ctrl+Shift+7</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>无序列表</span>
              <span className="text-muted-foreground">Ctrl+Shift+8</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>引用</span>
              <span className="text-muted-foreground">Ctrl+Shift+.</span>
            </div>
            <DropdownMenuSeparator />
            <div className="flex justify-between text-sm">
              <span>链接</span>
              <span className="text-muted-foreground">Ctrl+K</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>图片</span>
              <span className="text-muted-foreground">Ctrl+Shift+K</span>
            </div>
            <DropdownMenuSeparator />
            <div className="flex justify-between text-sm">
              <span>水平线</span>
              <span className="text-muted-foreground">Ctrl+Shift+-</span>
            </div>
            <DropdownMenuSeparator />
            <div className="text-sm font-medium mt-2">数学公式</div>
            <div className="flex justify-between text-sm">
              <span>行内公式</span>
              <span className="text-muted-foreground">Ctrl+Shift+P</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>块级公式</span>
              <span className="text-muted-foreground">Ctrl+Shift+Enter</span>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShortcutsDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 表格对话框 */}
      <Dialog open={tableDialogOpen} onOpenChange={setTableDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>插入表格</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-4">
              <label className="text-sm">行数:</label>
              <input
                type="number"
                min="2"
                max="10"
                value={tableRows}
                onChange={(e) => setTableRows(parseInt(e.target.value) || 3)}
                className="w-20 px-2 py-1 border rounded"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="text-sm">列数:</label>
              <input
                type="number"
                min="2"
                max="10"
                value={tableCols}
                onChange={(e) => setTableCols(parseInt(e.target.value) || 3)}
                className="w-20 px-2 py-1 border rounded"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTableDialogOpen(false)}>取消</Button>
            <Button onClick={confirmInsertTable}>插入</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// 快捷键显示组件
function DropdownMenuShortcut({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-auto text-xs tracking-widest opacity-60">
      {children}
    </span>
  )
}

export default Toolbar
