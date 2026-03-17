# RadishMD

一款简洁高效的桌面端 Markdown 编辑器，提供所见即所得编辑体验。

![Markdown Editor](./docs/screenshot.png)

## 特性

### 所见即所得 (WYSIWYG)

实时预览 Markdown 渲染效果，无需切换编辑模式。输入即可见，所见即所得。

### 轻量高效

基于 Tauri 2.x 构建，相比 Electron 应用体积更小、启动更快、内存占用更低。

### 完整 Markdown 支持

支持 GitHub 风格 Markdown (GFM)，包括：

- 标题、段落、列表
- 代码块和语法高亮（支持 100+ 编程语言）
- 表格
- 任务清单
- 引用块
- 链接和图片
- 数学公式（行内和块级）

### 主题切换

支持 4 种主题：浅色、Nord、蓝灰（类 VS Code）、暖灰（类 Typora），一键切换，保护眼睛。

### 原生文件操作

集成系统原生文件对话框，支持打开和保存 Markdown 文件。

### 代码块增强

- 插入代码块后自动弹出语言选择器
- 支持搜索过滤编程语言
- 键盘上下键选择，回车确认，ESC 关闭

---

## 适用场景

### 写作

适合技术文档撰写、博客写作、小说创作等场景。所见即所得的编辑方式让写作更加流畅。

### 笔记

轻量级笔记工具，适合快速记录和整理信息。支持 Markdown 语法让笔记更加结构化。

### 开发文档

开发团队可以使用它来编写项目文档、API 文档 READMEs。

---

## 技术栈

| 类别   | 技术                          |
| ---- | --------------------------- |
| 桌面框架 | Tauri 2.x                   |
| 前端框架 | React 19                    |
| 编辑器  | Milkdown (ProseMirror)      |
| 样式   | Tailwind CSS v4 + shadcn-ui |
| 构建工具 | Vite 7.x                    |

---

## 快速开始

```bash
# 安装依赖
npm install

# 运行开发版本
powershell.exe -ExecutionPolicy Bypass -File run_dev.ps1

# 构建生产版本
npm run tauri build
```

详细使用方法请参阅 [使用手册](./docs/使用手册.md)

开发者文档请参阅 [开发者手册](./docs/开发者手册.md)

---

## 与 Typora 对比

| 特性    | RadishMD | Typora |
| ----- | -------- | ------ |
| 体积    | ~10MB    | ~70MB+ |
| 启动速度  | 快        | 中等     |
| 跨平台   | 是        | 是      |
| 开源    | 是        | 否      |
| 自定义程度 | 高        | 中等     |
| 主题数量  | 4 种      | 3 种    |
| 代码语言  | 100+     | 数十种    |

---

## 许可证

MIT License
