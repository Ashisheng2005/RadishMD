# RadishMD

[中文 README](README.md) | English version

> A desktop Markdown editor built with Tauri 2 + React 19 + TypeScript.
> It is designed for daily writing, technical notes, and project documentation, with an integrated editing, preview, and file management experience.

## Overview

RadishMD follows a local-first desktop architecture centered on Markdown source text, combining a WYSIWYG-style experience with a traditional Markdown workflow.

## Preview

![RadishMD screenshot](public/test1.png)

## Key Features

- Local-first desktop experience with file read/write and file association support
- Split and WYSIWYG editing modes
- File tree, outline, and toolbar working together
- Markdown source text as the core data model
- Support for opening, editing, and saving `.md` files
- Built-in release note automation and update checks

## Quick Start

```bash
npm install
npm run dev
```

## Build and Run

```bash
npm run build
npm run tauri dev
npm run tauri build
```

## Documentation

Detailed docs are organized in the [docx](docx) directory:

- [Documentation Overview](docx/README.md)
- [User Manual](docx/使用手册.md)
- [Developer Guide](docx/开发者手册.md)
- [Project Structure Optimization](docx/项目结构优化说明.md)
- [Lightweight Editor Migration Plan](docx/轻量编辑器迁移计划.md)
- [Contribution Guide](CONTRIBUTING.md)

## Installation

On Linux, you can install the packaged release with:

```bash
sudo dpkg -i xxx.deb
```

## Tech Stack

- Frontend: Vite 7, React 19, TypeScript
- Desktop: Tauri 2
- State management: Zustand
- Styling: Tailwind CSS 4, shadcn/ui
