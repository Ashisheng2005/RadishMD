# RadishMD


> 一款基于 Tauri 2 + React 19 + TypeScript 的桌面 Markdown 编辑器。
>
> 兼顾所见即所得体验与传统 Markdown 写作流程，适合日常写作、技术笔记与项目文档维护。

## 亮点

- 现代化桌面体验，支持本地文件读写
- Split 与 WYSIWYG 两种编辑方式
- 文件树、大纲、工具栏协同工作
- 以 Markdown 源文本作为核心数据
- 适配 `.md` 文件打开与保存

## 文档

详细说明已整理到 [docx](docx) 目录：

- [文档总览](docx/README.md)
- [使用手册](docx/使用手册.md)
- [开发者手册](docx/开发者手册.md)
- [项目结构优化说明](docx/项目结构优化说明.md)
- [轻量编辑器迁移计划](docx/轻量编辑器迁移计划.md)

## 开发

```bash
npm run dev
npm run build
npm run tauri dev
npm run tauri build
```

## 说明

- 前端：Vite 7、React 19、TypeScript
- 桌面端：Tauri 2
- 状态管理：Zustand
- 样式：Tailwind CSS 4、shadcn/ui
