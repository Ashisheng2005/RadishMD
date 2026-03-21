import { create } from "zustand"

export interface FileNode {
  id: string
  name: string
  type: "file" | "folder"
  children?: FileNode[]
  content?: string
  isExpanded?: boolean
}

interface EditorState {
  files: FileNode[]
  activeFileId: string | null
  content: string
  isSidebarOpen: boolean
  isOutlineOpen: boolean
  theme: "light" | "dark"
  editMode: "split" | "wysiwyg"
  wordCount: number
  charCount: number
  setActiveFile: (id: string) => void
  setContent: (content: string) => void
  toggleSidebar: () => void
  toggleOutline: () => void
  toggleTheme: () => void
  toggleEditMode: () => void
  toggleFolder: (id: string) => void
  updateCounts: (content: string) => void
}

const initialFiles: FileNode[] = [
  {
    id: "1",
    name: "Documents",
    type: "folder",
    isExpanded: true,
    children: [
      {
        id: "1-1",
        name: "RadishMD 项目文档.md",
        type: "file",
        content: `# RadishMD - Typora 风格 Markdown 编辑器

## 项目概述

RadishMD 是一款基于 **Tauri 2 + React + TypeScript + CodeMirror 6** 构建的现代化 Markdown 编辑器，致力于提供类似 Typora 的**所见即所得**编辑体验。

### 核心特性

- **实时预览** - 边写边看，无需切换模式
- **语法高亮** - 支持多种编程语言
- **主题切换** - 深色/浅色主题自由切换
- **文件管理** - 侧边栏文件树，快速导航
- **大纲视图** - 自动生成文档结构

## 技术栈

| 技术 | 用途 |
|------|------|
| Tauri 2 | 桌面应用框架 |
| React | UI 框架 |
| TypeScript | 类型安全 |
| CodeMirror 6 | 编辑器核心 |
| Zustand | 状态管理 |

## 快速开始

\`\`\`bash
# 克隆项目
git clone https://github.com/example/radishmd.git

# 安装依赖
pnpm install

# 启动开发服务器
pnpm tauri dev
\`\`\`

> **提示**: 请确保已安装 Rust 和 Node.js 环境。

## 项目结构

项目采用前后端分离架构：

1. **前端 (src/)** - React + CodeMirror 编辑器
2. **后端 (src-tauri/)** - Rust 文件系统操作

---

*享受编写 Markdown 的乐趣！*`,
      },
      {
        id: "1-2",
        name: "开发计划.md",
        type: "file",
        content: `# 开发计划

## 第一阶段：基础框架

- [x] 项目初始化
- [x] CodeMirror 集成
- [ ] 基础 Markdown 渲染

## 第二阶段：核心功能

- [ ] 文件系统集成
- [ ] 主题系统
- [ ] 快捷键支持

## 第三阶段：高级特性

- [ ] 插件系统
- [ ] 导出功能
- [ ] 云同步`,
      },
    ],
  },
  {
    id: "2",
    name: "Notes",
    type: "folder",
    isExpanded: false,
    children: [
      {
        id: "2-1",
        name: "会议记录.md",
        type: "file",
        content: `# 会议记录

## 2024-01-15

### 议题
- 项目进度汇报
- 技术选型讨论

### 决议
1. 采用 Tauri 2 作为桌面框架
2. 使用 CodeMirror 6 作为编辑器核心`,
      },
    ],
  },
  {
    id: "3",
    name: "README.md",
    type: "file",
    content: `# Welcome to RadishMD

A modern Markdown editor built with love.`,
  },
]

export const useEditorStore = create<EditorState>((set, get) => ({
  files: initialFiles,
  activeFileId: "1-1",
  content: initialFiles[0].children?.[0].content || "",
  isSidebarOpen: true,
  isOutlineOpen: true,
  theme: "dark",
  editMode: "split",
  wordCount: 0,
  charCount: 0,

  setActiveFile: (id: string) => {
    const findFile = (nodes: FileNode[]): FileNode | null => {
      for (const node of nodes) {
        if (node.id === id && node.type === "file") return node
        if (node.children) {
          const found = findFile(node.children)
          if (found) return found
        }
      }
      return null
    }
    const file = findFile(get().files)
    if (file) {
      set({ activeFileId: id, content: file.content || "" })
      get().updateCounts(file.content || "")
    }
  },

  setContent: (content: string) => {
    set({ content })
    get().updateCounts(content)
  },

  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  toggleOutline: () => set((state) => ({ isOutlineOpen: !state.isOutlineOpen })),
  toggleTheme: () =>
    set((state) => ({ theme: state.theme === "light" ? "dark" : "light" })),
  toggleEditMode: () =>
    set((state) => ({ editMode: state.editMode === "split" ? "wysiwyg" : "split" })),

  toggleFolder: (id: string) => {
    const toggleInNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes.map((node) => {
        if (node.id === id && node.type === "folder") {
          return { ...node, isExpanded: !node.isExpanded }
        }
        if (node.children) {
          return { ...node, children: toggleInNodes(node.children) }
        }
        return node
      })
    }
    set((state) => ({ files: toggleInNodes(state.files) }))
  },

  updateCounts: (content: string) => {
    const charCount = content.length
    const wordCount = content
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0).length
    set({ wordCount, charCount })
  },
}))
