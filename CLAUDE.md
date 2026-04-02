# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RadishMD is a Tauri 2 desktop application with a React + TypeScript frontend. It's a Markdown editor inspired by Typora's WYSIWYG editing experience.

## Commands

```bash
# Frontend only (port 1420)
npm run dev        # Start Vite dev server
npm run build      # TypeScript check + Vite build
npm run preview    # Preview built frontend

# Tauri (full app)
npm run tauri dev      # Run with Rust backend + frontend
npm run tauri build    # Build production .exe
```

## Architecture

### Frontend Stack
- **Vite 7** + **React 19** + **TypeScript** (`@` alias → `./src`)
- **Tailwind CSS 4** with CSS variables (`@tailwindcss/vite` plugin)
- **shadcn/ui** component library (radix-ui primitives)
- **Zustand** for state management
- **sonner** for toast notifications

### Backend (Rust)
- **Tauri 2** with plugins: `opener`, `dialog`, `cli`
- Entry: `src-tauri/src/main.rs` → `radishmd_lib::run()`
- Commands in `src-tauri/src/lib.rs`:
  - `read_file(path)` - Read file contents
  - `write_file(path, content)` - Write file
  - `get_file_name(file_path)` - Extract filename
  - `get_cli_file_path()` - Get CLI arg for file associations

### Layout Structure
```
TitleBar
├── Sidebar (file tree, collapsible)
├── EditorArea
│   ├── SplitEditor (textarea + preview)
│   └── WysiwygEditor (block-based editor)
└── Outline (markdown outline, collapsible)
StatusBar
```

### WYSIWYG Editor Architecture (`wysiwyg-editor.tsx`)

The WYSIWYG editor uses a **component-based approach** with controlled inputs:

1. **Markdown → Blocks**: `parseMarkdownToBlocks(markdown)` in `blocks/utils.ts` splits content into `Block[]`
   - Block types: `paragraph`, `heading1-6`, `code`, `quote`, `list`, `ordered`, `task`, `hr`, `table`

2. **Block Components** (`components/editor/blocks/`):
   - `Block.tsx` - Unified block component with edit/render modes
   - `types.ts` - Block and BlockType definitions
   - `utils.ts` - parseMarkdownToBlocks, blocksToMarkdown, renderInlineMarkdown

3. **Edit/Render Mode Toggle**:
   - Click block → enters edit mode (shows textarea)
   - Blur/Escape → exits edit mode, syncs content
   - Uses `localContent` state with 300ms debounce for smooth input

4. **Performance Optimizations**:
   - Each Block maintains local state to avoid global re-renders
   - 300ms debounce on text input updates
   - CSS `content-visibility: auto` on block containers for lazy rendering
   - Markdown-to-markdown sync only on internal updates

### State Management (`src/lib/editor-store.ts`)

```typescript
interface EditorState {
  files: FileNode[]           // File tree with content and filePath
  activeFileId: string | null
  content: string             // Current file's markdown content
  editMode: "split" | "wysiwyg"
  // ...
}
```

Key methods:
- `saveFile()` - Direct save for files with `filePath`, Save As for new files
- `openFileFromPath(filePath)` - Opens file via CLI file association
- `setContent(content)` - Updates content and triggers `updateCounts()`

### File Operations (`src/lib/file-operations.ts`)
- `importFiles()` - Uses Tauri dialog plugin to select .md files
- File reads via `invoke("read_file")`, writes via `invoke("write_file")`

## Keyboard Shortcuts

### Formatting (Ctrl/Cmd + key)
| Shortcut | Action |
|----------|--------|
| `Ctrl+B` | Bold `**text**` |
| `Ctrl+I` | Italic `*text*` |
| `Ctrl+K` | Link `[text](url)` |
| `Ctrl+1-6` | Heading 1-6 |
| `Ctrl+Shift+S` | Strikethrough `~~text~~` |
| `Ctrl+Shift+\`` | Inline code |
| `Ctrl+Shift+I` | Image `![alt](url)` |
| `Ctrl+Shift+8` | Unordered list |
| `Ctrl+Shift+7` | Ordered list |
| `Ctrl+Shift+Q` | Blockquote |

### Global
| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save file |
| `Ctrl+Shift+Z` | Toggle sidebar |
| `Ctrl+Shift+X` | Toggle outline |

## Tauri Configuration

- App ID: `radishtools.radishmd.fun`
- Window: 1200x800 default, 800x600 minimum, decorated
- File associations: `.md` files open with RadishMD
- Permissions: `src-tauri/capabilities/default.json`

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/editor-store.ts` | Zustand store - all editor state |
| `src/lib/file-operations.ts` | File import via Tauri dialog |
| `src/components/editor/index.tsx` | Main layout + global keyboard shortcuts |
| `src/components/editor/editor-area.tsx` | Routes between Split/WYSIWYG modes |
| `src/components/editor/wysiwyg-editor.tsx` | Block-based WYSIWYG editor |
| `src/components/editor/blocks/Block.tsx` | Unified block component (edit/render modes) |
| `src/components/editor/blocks/utils.ts` | Markdown parsing and serialization |
| `src/components/editor/split-editor.tsx` | Textarea + preview split view |
| `src/components/editor/toolbar.tsx` | `FormatType` enum and formatting buttons |
| `src-tauri/src/lib.rs` | Rust commands: read/write file |
| `src-tauri/tauri.conf.json` | App window, bundle, file associations |
| `vite.config.ts` | Vite + Tailwind CSS 4 setup |
| `src/index.css` | Theme CSS variables (light/dark) + editor styles |
