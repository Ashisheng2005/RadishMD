# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RadishMD is a Tauri 2 desktop application with a React + TypeScript frontend. It's a Markdown editor inspired by Typora's WYSIWYG editing experience.

## Commands

```bash
# Frontend only
npm run dev              # Start Vite dev server (port 1420)
npm run build            # TypeScript check + Vite build
npm run preview          # Preview built frontend

# Tauri (full app)
npm run tauri dev        # Run with Rust backend + frontend (port 1421 for HMR)
npm run dev:tauri        # Alternative: dev server on port 1421 with strictPort
npm run tauri build      # Build production .exe
npm run tauri            # Tauri CLI passthrough (e.g. `npm run tauri -- --help`)

# Version management (auto-runs before build/dev via pre* hooks)
npm run version:sync     # Sync version to tauri.conf.json and Cargo.toml
npm run version:check    # Check if versions are in sync

# Release notes (generates from conventional commits)
npm run release:notes    # Generate release notes between tags
```

## Environment Requirements

- **Node.js**: 18+
- **Rust**: 1.70+
- **Linux**: `build-essential`, `libwebkit2gtk-4.1-dev`, `libssl-dev`
- **Windows**: Visual Studio Build Tools with MSVC target
- **macOS**: Xcode Command Line Tools

## Architecture

### Frontend Stack
- **Vite 7** + **React 19** + **TypeScript** (`@` alias → `./src`)
- **Tailwind CSS 4** with CSS variables (`@tailwindcss/vite` plugin)
- **shadcn/ui** component library (radix-ui primitives)
- **Zustand** for state management
- **CodeMirror 6** - used in Split mode for the code editor pane (`@codemirror/lang-markdown`, custom theme)
- **KaTeX** for math formula rendering
- **Mermaid** for diagram rendering
- **sonner** for toast notifications

### App Entry

```
src/main.tsx                     # ReactDOM.createRoot + StrictMode
src/App.tsx                      # Renders <Editor /> + <Toaster />
src/components/editor/index.tsx  # Main layout: TitleBar, Sidebar, EditorArea, Outline, StatusBar
```

**Important**: React StrictMode is enabled in development, which double-mounts components. Effects (especially event listeners, file watchers, workers) must have proper cleanup functions.

### Editor Modes (`EditorArea.tsx`)
The editor has two modes selected by `editMode` in the store:
- **`"split"`** → Renders `SplitEditor`: CodeMirror editor (left) + Markdown preview (right). Also used for PDF files.
- **`"wysiwyg"`** → Renders `WysiwygEditor`: Block-based editor where blocks are parsed from markdown.

### Theme System

CSS variables in `src/index.css` define the full color palette for both `.dark` and light (default) themes. Theme mode (`"light"`, `"dark"`, `"system"`) is stored in Zustand and applied in `Editor/index.tsx` via `document.documentElement.classList.toggle("dark", ...)`. The `@custom-variant dark (&:is(.dark *));` Tailwind directive enables `dark:` variants based on the `.dark` class.

### Layout Structure
```
TitleBar (menu, update dialog, window controls)
├── Sidebar (collapsible file tree, search)
├── EditorArea
│   ├── SplitEditor (CodeMirror editor + Markdown preview)
│   └── WysiwygEditor (block-based editor)
├── Outline (collapsible markdown outline)
└── StatusBar
```

### Backend (Rust)
- **Tauri 2** with plugins: `opener`, `dialog`, `cli`
- Entry: `src-tauri/src/main.rs` → `radishmd_lib::run()`
- All commands in `src-tauri/src/lib.rs` (2 source files total)
- **File watching**: Uses `notify` crate, emits `radishmd://file-changed` events
- **Update downloads**: `reqwest` blocking client with `DownloadCancellationRegistry`
- Github repo owner: `Ashisheng2005`, repo: `RadishMD`

### Custom Tauri Event URIs
| Event | Purpose |
|-------|---------|
| `radishmd://file-changed` | External file modification detected |
| `radishmd://file-opened` | File opened via OS file association |
| `radishmd://close-requested` | Window close attempt (check unsaved) |
| `radishmd://update-download-progress` | Download progress updates |

### Content Security Policy (CSP)
Configured in `tauri.conf.json` under `app.security.csp`. When adding new external resources (fonts, images, stylesheets), update the corresponding CSP directive. CSP violations in production build silently block resources (black SVG fills, missing fonts, etc.).

### Asset Protocol
- **Tauri asset protocol** enabled for streaming local files (`asset://localhost/<path>`)
- `convertFileSrc(path)` from `@tauri-apps/api/core` generates asset URLs
- Used for PDF viewing via `<embed src={assetUrl}>`
- Bypasses WebView's `file://` security restrictions

### Runtime Detection (`src/lib/runtime.ts`)
- `isTauriRuntime()` checks for `window.__TAURI_INTERNALS__` — used to conditionally enable Tauri features (file operations, watcher, CLI)
- `openExternalTarget(url)` — opens URLs via Tauri `opener` plugin, falls back to `window.open()`

### Vite Configuration (`vite.config.ts`)
- Server: port 1420, strict port, ignores `src-tauri/**` and `*.md` file changes (preventing reload on markdown saves)

---

## State Management (`src/lib/editor-store.ts`)

Zustand store managing all editor state. Key concepts:

**File Tree**: `files: FileNode[]` is a recursive tree structure (files + folders). Every file has a unique `id`. Files created in-page (never saved) have `isNew: true`. Files modified after save have `isDirty: true`.

**Active File**: `activeFileId` points to the current file. `content` is the current editor content (always synced with active file). Switch files via `setActiveFile(id)`.

**Key operations**:
- `saveFile()` - Direct save for files with `filePath`, opens Save As dialog for new files
- `addFiles(files)` / `addTreeNodes(newNodes)` - Add files to tree (merges nested nodes preserving existing folders by `filePath`)
- `moveNode(nodeId, targetFolderId)` - Drag-and-drop tree reorganization
- `findNodeByPath(filePath)` - Recursive search by normalized file path for deduplication
- `hasUnsavedChanges()` / `getUnsavedFiles()` - Unsaved changes tracking (used by close confirmation dialog)

**Scroll positions**: Per-file percentage-based (`fileScrollPositions: Record<string, { editor: number, preview: number }>`)

---

## Markdown Rendering (Two Separate Implementations)

**Critical: Both files must be kept in sync when fixing parsing bugs.**

- `src/lib/markdown-render.ts` — Used by **Split mode** preview (runs in Web Worker)
- `src/components/editor/blocks/utils.ts` — Used by **WYSIWYG mode** block parsing

Dual implementations exist because the WYSIWYG version needs per-block React component integration (edit/render mode toggle), while the Split version is a simple batch render.

### Block Types
Both parsers produce blocks: `paragraph`, `heading1-6`, `code`, `mermaid`, `quote`, `list`, `ordered`, `task`, `hr`, `table`

### Image Path Resolution
- **Split mode**: Worker cannot use `convertFileSrc` (references `window`). Path resolution happens in main thread via `resolveImagePathsInHtml()` in `markdown-renderer.tsx` after the worker returns HTML chunks.
- **WYSIWYG mode**: `renderInlineMarkdown()` calls `resolveImageSource()` directly (runs in main thread).
- **`buildImageTag()` does NOT resolve paths** — only builds the `<img>` tag with the raw src. Resolution is done by the caller.

### Math Formula Rendering
- **Split mode**: Placeholder-based. `renderInlineMarkdown` emits `%%MATH_INLINE:encoded%%` and `<div class="katex-display" data-math-block="...">`. These are replaced with actual KaTeX HTML in the main thread by `renderMathInHtml()` in `markdown-renderer.tsx`.
- **WYSIWYG mode**: Direct. `renderInlineMarkdown` calls `katex.renderToString()` immediately for both inline `$...$` and block `$$...$$` formulas.

### Mermaid Diagrams
`mermaid.render()` runs only in the main thread (needs DOM):
- **Split mode**: Worker emits placeholder `<div class="mermaid-diagram" data-mermaid-id="..." data-mermaid-content="...">`. After chunks are set in DOM, `renderMermaidInContainer()` in `markdown-renderer.tsx` finds all placeholders and calls `mermaid.render()` on each.
- **WYSIWYG mode**: `Block.tsx` `useEffect` calls `mermaid.render()` directly with `block.content`, stores resulting SVG in state.

---

## WYSIWYG Editor Architecture

`WysiwygEditor` → `blocks/utils.ts:parseMarkdownToBlocks()` → array of `Block[]` → `Block.tsx` component for each block.

**Block component** (`src/components/editor/blocks/Block.tsx`):
- Two modes: **view** (renders HTML via `renderInlineMarkdown`) and **edit** (shows `<textarea>`)
- Click → edit mode, Blur/Escape → returns to view mode
- `localContent` state + 300ms debounce prevents global re-renders on each keystroke
- Uses `contentEditable` is NOT used — blocks use textarea for editing and `dangerouslySetInnerHTML` for rendering

---

## Split Editor Architecture

`SplitEditor` (`src/components/editor/split-editor.tsx`):
- **Editor pane**: `<textarea>` element (not CodeMirror — the CM dependency exists but the current implementation uses a native textarea)
- **Preview pane**: `MarkdownRenderer` component
- **Scroll sync**: Percentage-based (`scrollTop / scrollableHeight`), throttled at 50ms, using `useDeferredValue` for smooth input
- **ResizeObserver** monitors preview height changes and corrects sync when rendering stabilizes
- PDF mode disables scroll sync (prevents flickering)

### MarkdownRenderer (`src/components/editor/markdown-renderer.tsx`)
- Renders markdown to HTML using a **Web Worker** (`src/workers/markdown-render-worker.ts`)
- Worker returns `MarkdownRenderChunk[]` (array of `{ key, html, sourceLine }`)
- Main thread post-processes: resolves image paths, renders KaTeX formulas, renders Mermaid diagrams
- 220ms debounce on input before sending to worker (immediate render on file switch)

### Rust Commands (15 total in `src-tauri/src/lib.rs`)
- **File I/O**: `read_file`, `read_file_snapshot`, `write_file`, `get_file_name`, `read_file_as_data_url`, `read_directory`
- **Image**: `read_image_as_data_url`
- **File watching**: `watch_file_changes`, `clear_file_watcher`
- **CLI**: `get_cli_file_path`
- **Updates**: `check_latest_release`, `download_release_asset`, `cancel_download`
- **Window**: `confirm_close`

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/editor-store.ts` | Zustand store: file tree, content, UI state, scroll positions |
| `src/lib/markdown-render.ts` | Markdown parser + HTML renderer (Split mode, worker-compatible) |
| `src/components/editor/blocks/utils.ts` | Markdown parser + inline renderer (WYSIWYG mode) |
| `src/components/editor/blocks/Block.tsx` | Block component with edit/render mode toggle |
| `src/components/editor/markdown-renderer.tsx` | Preview renderer: worker orchestration, KaTeX/Mermaid/image post-processing |
| `src/components/editor/split-editor.tsx` | Split view: textarea + preview + scroll sync |
| `src/components/editor/wysiwyg-editor.tsx` | WYSIWYG block editor |
| `src/components/editor/index.tsx` | Main layout, global keyboard shortcuts, theme, update logic |
| `src/components/editor/file-tree.tsx` | File tree sidebar with drag-and-drop |
| `src/components/editor/sidebar.tsx` | Sidebar container (file tree + search) |
| `src/components/editor/toolbar.tsx` | Formatting toolbar (bold, italic, headings, etc.) |
| `src/components/editor/outline.tsx` | Markdown outline (headings-based) |
| `src/lib/image-utils.ts` | Image path resolution, tag building, clipboard extraction |
| `src/lib/code-highlighting.ts` | Custom syntax highlighter for 18 languages |
| `src/lib/search-utils.ts` | Full-text search across loaded files |
| `src/lib/file-operations.ts` | File import/export via Tauri dialog |
| `src/lib/runtime.ts` | Tauri runtime detection |
| `src/lib/update.ts` | Auto-update command wrappers |
| `src/workers/markdown-render-worker.ts` | Web Worker for markdown rendering |
| `src/index.css` | Tailwind imports, CSS variables, theme, custom scrollbar, mermaid fixes |
| `src-tauri/src/lib.rs` | All 15 Rust commands |
| `src-tauri/tauri.conf.json` | CSP, window config, file associations, asset protocol |

---

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
| `Ctrl+/` | Toggle search |
| `Ctrl+Shift+Z` | Toggle sidebar |
| `Ctrl+Shift+X` | Toggle outline |
| `Escape` | Close search |

## Tauri Configuration

- App ID: `radishtools.radishmd.fun`
- Window: 1200x800 default, 800x600 minimum
- File associations: `.md` files open with RadishMD
- Permissions: `src-tauri/capabilities/default.json`
- Devtools: `devtools: true` in tauri.conf.json (debug only, disable in production)

## Additional Documentation

Detailed Chinese documentation in `docx/`:
- `docx/使用手册.md` — User manual
- `docx/开发者手册.md` — Developer guide with environment setup
- `docx/Split模式滚动同步方案.md` — Split mode scroll sync details
- `docx/项目结构优化说明.md` — Architecture optimization notes

## Testing

**No test infrastructure exists.** All verification is manual via `npm run tauri dev` or `npm run dev`.
