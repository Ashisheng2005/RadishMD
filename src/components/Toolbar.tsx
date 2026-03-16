import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { FolderOpen, Save, Sun, Moon } from 'lucide-react'

interface ToolbarProps {
  content: string
  onContentChange: (content: string) => void
  onFileOpened?: () => void
  theme: 'nord' | 'light'
  onThemeChange: (theme: 'nord' | 'light') => void
}

function Toolbar({ content, onContentChange, onFileOpened, theme, onThemeChange }: ToolbarProps) {
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

  return (
    <div className={`flex items-center gap-2 px-4 py-2 border-b ${theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-slate-900 border-slate-800'}`}>
      {/* 文件操作组 */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleOpen}
          className={theme === 'light' ? 'text-gray-700 hover:bg-gray-100' : 'text-slate-300 hover:bg-slate-800'}
        >
          <FolderOpen className="w-4 h-4 mr-1.5" />
          <span>打开</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSave}
          className={theme === 'light' ? 'text-gray-700 hover:bg-gray-100' : 'text-slate-300 hover:bg-slate-800'}
        >
          <Save className="w-4 h-4 mr-1.5" />
          <span>保存</span>
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6 bg-slate-700/50" />

      {/* 主题切换 */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onThemeChange(theme === 'nord' ? 'light' : 'nord')}
        className={theme === 'light' ? 'text-gray-700 hover:bg-gray-100' : 'text-slate-300 hover:bg-slate-800'}
      >
        {theme === 'nord' ? (
          <>
            <Sun className="w-4 h-4 mr-1.5" />
            <span>浅色</span>
          </>
        ) : (
          <>
            <Moon className="w-4 h-4 mr-1.5" />
            <span>深色</span>
          </>
        )}
      </Button>
    </div>
  )
}

export default Toolbar
