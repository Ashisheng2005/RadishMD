# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RadishMD is a Tauri 2 desktop application with a React + TypeScript frontend. It's a Markdown editor inspired by Typora's WYSIWYG editing experience.

## Commands

```bash
# Frontend only
npm run dev        # Start Vite dev server (port 1420)
npm run build      # Build frontend (TypeScript check + Vite build)
npm run preview    # Preview built frontend

# Tauri commands
npm run tauri dev      # Run full Tauri dev (starts both Rust backend and frontend)
npm run tauri build    # Build production Tauri app (outputs .exe)
```

## Architecture

**Frontend Stack:**
- Vite 7 + React 19 + TypeScript (import alias: `@` maps to `./src`)
- Tailwind CSS 4 with CSS variables (`@tailwindcss/vite` plugin, `@theme inline` in `src/index.css`)
- shadcn/ui component library (radix-ui primitives + class-variance-authority)
- Zustand for state management
- `sonner` for toast notifications
- CodeMirror 6 packages in dependencies (unused - WYSIWYG uses custom `contenteditable` blocks)

**Backend (Rust):**
- Tauri 2 framework with plugins: `tauri-plugin-opener` (external links), `tauri-plugin-dialog` (file dialogs)
- Entry point: `src-tauri/src/main.rs` → `lib.rs:run()`
- Commands in `src-tauri/src/lib.rs`: `read_file`, `write_file`, `get_file_name`

**State Management** (`src/lib/editor-store.ts`):
- File tree (`files: FileNode[]`) with `filePath` for imported files
- Active file tracking and editor content
- `saveFile()`: direct save for imported files, Save As for new files
- `saveFileAs()`: always opens Save As dialog
- UI toggles: `isSidebarOpen`, `isOutlineOpen`, `theme`, `editMode`
- Inline creation workflow: `creatingType` ("file" | "folder" | null) triggers `InlineCreateInput` in `file-tree.tsx`
- `editMode`: "split" | "wysiwyg" - toggles between split-pane and WYSIWYG editing

**Editor Layout** (`src/components/editor/index.tsx`):
- TitleBar → Sidebar + EditorArea + Outline → StatusBar
- `editor-area.tsx` routes to `SplitEditor` or `WysiwygEditor` based on `editMode`
- **WYSIWYG mode** (`wysiwyg-editor.tsx`): Custom block-based editor using `contenteditable` divs. Parses markdown into `Block` objects (paragraph, heading, code, quote, list, task, hr, table). Uses `parseMarkdownToBlocks()` / `blocksToMarkdown()` for conversion.
- **Split mode** (`split-editor.tsx`): Plain textarea + live markdown preview side-by-side

**File Operations** (`src/lib/file-operations.ts`):
- `importFiles()` uses Tauri dialog plugin to select .md files, reads content via `invoke("read_file")`, adds to store
- Save uses `sonner` toast for success (green) / error (red) feedback

**Keyboard Shortcuts** (`src/components/editor/index.tsx`):
- `Ctrl+S`: Save file (direct save for imported files, Save As for new files)
- `Ctrl+Shift+Z`: Toggle left sidebar (file tree)
- `Ctrl+Shift+X`: Toggle right outline panel

## Tauri Configuration

- App identifier: `radishtools.radishmd.fun`
- Window: 1200x800 default, 800x600 minimum, decorated (standard frame)
- Bundle targets: all (MSI, NSIS, etc.)
- Permissions via `src-tauri/capabilities/default.json`: core:default, opener:default, dialog:default

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/editor-store.ts` | Zustand store with all editor state |
| `src/lib/file-operations.ts` | File import via Tauri dialog plugin |
| `src/components/editor/` | Editor UI components |
| `src-tauri/src/lib.rs` | Rust Tauri commands |
| `src-tauri/tauri.conf.json` | App window and bundle config |
| `vite.config.ts` | Vite + Tailwind CSS 4 setup |
| `src/index.css` | Tailwind CSS 4 theme with light/dark CSS variables and WYSIWYG editor styles |
| `src/styles/globals.css` | Additional global styles |
