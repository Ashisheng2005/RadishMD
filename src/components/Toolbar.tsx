import { useRef, useEffect } from 'react'
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
import type { ThemeType } from './MilkdownEditor'

interface ToolbarProps {
  content: string
  onContentChange: (content: string) => void
  onFileOpened?: () => void
  theme: ThemeType
  onThemeChange: (theme: ThemeType) => void
}

function Toolbar({ content, onContentChange, onFileOpened, theme, onThemeChange }: ToolbarProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const [aboutDialogOpen, setAboutDialogOpen] = React.useState(false)
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = React.useState(false)

  // 获取编辑器实例
  useEffect(() => {
    // 延迟获取编辑器元素
    const timer = setTimeout(() => {
      const editor = document.querySelector('.milkdown')
      if (editor) {
        editorRef.current = editor as HTMLDivElement
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [])

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

  // 编辑操作
  const handleUndo = () => {
    document.execCommand('undo')
  }

  const handleRedo = () => {
    document.execCommand('redo')
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
      document.execCommand('insertText', false, text)
    } catch (error) {
      console.error('Paste error:', error)
    }
  }

  const handleSelectAll = () => {
    document.execCommand('selectAll')
  }

  // 格式化操作
  const handleBold = () => {
    document.execCommand('bold')
  }

  const handleItalic = () => {
    document.execCommand('italic')
  }

  const handleStrikeThrough = () => {
    document.execCommand('strikeThrough')
  }

  const handleCode = () => {
    document.execCommand('insertHTML', false, '<code>`</code>')
  }

  const handleLink = () => {
    const url = prompt('请输入链接地址:')
    if (url) {
      document.execCommand('createLink', false, url)
    }
  }

  const handleImage = () => {
    const url = prompt('请输入图片地址:')
    if (url) {
      document.execCommand('insertImage', false, url)
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
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [content])

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
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleCode}>
              代码
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLink}>
              链接
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleImage}>
              图像
            </DropdownMenuItem>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>快捷键列表</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2">
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
            <div className="flex justify-between text-sm">
              <span>粗体</span>
              <span className="text-muted-foreground">Ctrl+B</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>斜体</span>
              <span className="text-muted-foreground">Ctrl+I</span>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShortcutsDialogOpen(false)}>关闭</Button>
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

import React from 'react'

export default Toolbar
