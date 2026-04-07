# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RadishMD is a Tauri 2 desktop application with a React + TypeScript frontend. It's a Markdown editor inspired by Typora's WYSIWYG editing experience.

## Commands

```bash
# Frontend only
npm run dev        # Start Vite dev server (port 1420)
npm run build      # TypeScript check + Vite build
npm run preview    # Preview built frontend

# Tauri (full app)
npm run tauri dev      # Run with Rust backend + frontend (port 1421 for HMR)
npm run dev:tauri      # Alternative: dev server on port 1421 with strictPort
npm run tauri build    # Build production .exe

# Version management (auto-runs before build/dev)
npm run version:sync   # Sync version to tauri.conf.json and Cargo.toml
npm run version:check  # Check if versions are in sync

# Release notes (generates from conventional commits)
npm run release:notes  # Generate release notes between tags
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
- **KaTeX** for math formula rendering (both inline `$...$` and block `$$...$$`)
- **Mermaid** for diagram rendering (` ```mermaid ` code blocks)
- **sonner** for toast notifications
- **pdfjs-dist** for PDF rendering (可选，当前主要用 WebView 内置渲染)

### Backend (Rust)
- **Tauri 2** with plugins: `opener`, `dialog`, `cli`
- **File watching**: Uses `notify` crate to watch for external file changes, emits `radishmd://file-changed` events to frontend
- **Update downloads**: Uses `reqwest` blocking client with cancellation support via `DownloadCancellationRegistry`
- Entry: `src-tauri/src/main.rs` → `radishmd_lib::run()`
- Commands in `src-tauri/src/lib.rs`:
  - File: `read_file`, `read_file_snapshot`, `write_file`, `get_file_name`, `read_file_as_data_url`
  - Image: `read_image_as_data_url`
  - CLI: `get_cli_file_path` for file associations
  - File watching: `watch_file_changes`, `clear_file_watcher`
  - Updates: `check_latest_release`, `download_release_asset`, `cancel_download`
  - Window: `confirm_close` - Closes window after user confirms unsaved changes

### Asset Protocol
- **Tauri asset protocol** enabled in `tauri.conf.json` for streaming local files
- `convertFileSrc(path)` from `@tauri-apps/api/core` generates `asset://localhost/<path>` URLs
- Used for PDF viewing - WebView natively streams and renders PDFs via `<embed src={assetUrl}>`
- Bypasses WebView's `file://` security restrictions

### Editor Components
- **CodeMirror 7** for syntax highlighting in split mode (`@codemirror/*` packages)
- Custom block-based WYSIWYG editor with controlled inputs
- Code syntax highlighting via `code-highlighting.ts` (shared by split preview and WYSIWYG modes)
- Markdown rendering with `markdown-render.ts`

### Markdown Rendering (Two Implementations)

**Important**: Markdown parsing has two separate implementations that must be kept in sync:
- `src/lib/markdown-render.ts` - Used by **Split mode** preview rendering
- `src/components/editor/blocks/utils.ts` - Used by **WYSIWYG mode** parsing

When fixing parsing bugs (e.g., list continuation, blockquote merging), both files need updates.

### Mermaid Diagrams
Mermaid diagrams are rendered via `mermaid.render()` in the main thread:
- **Split mode**: `markdown-renderer.tsx` uses placeholder divs with `renderMermaidInContainer()`
- **WYSIWYG mode**: `Block.tsx` uses `mermaidSvg` state with `useEffect` for rendering
- Theme adapts to light/dark mode via `document.documentElement.classList.contains("dark")`

### Split Editor Scroll Sync
- Uses **percentage-based scroll sync** (`split-editor.tsx`)
- Syncs by scroll percentage (`scrollTop / scrollableHeight`) rather than delta
- Uses `useDeferredValue` for smooth input during rendering
- **ResizeObserver** monitors preview height changes and corrects sync when rendering stabilizes
- Throttled at 50ms to avoid excessive recalculations during fast scrolling
- **PDF mode**: Scroll sync is disabled to prevent flickering during native PDF rendering
- This approach handles content height differences between editor (textarea) and preview (HTML) more accurately than delta-based sync

### Per-File Scroll Position
Each file maintains its own scroll position (percentage-based) in `editor-store`:
- `fileScrollPositions` - Record of file IDs to `{ editor: number, preview: number }`
- `saveScrollPosition()` / `getScrollPosition()` - Save/restore scroll per file
- `shouldResetScroll` - Flag to reset scroll to top (used when importing new files)
- File switch: saves current position → restores target file position
- Import new file: resets to top (0%) instead of restoring

### Layout Structure
```
TitleBar (with menu, update dialog, window controls)
├── Sidebar (file tree, collapsible)
├── EditorArea
│   ├── SplitEditor (textarea + preview + CodeMirror)
│   └── WysiwygEditor (block-based editor)
├── Outline (markdown outline, collapsible)
└── StatusBar
```

### WYSIWYG Editor Architecture (`wysiwyg-editor.tsx`)

The WYSIWYG editor uses a **component-based approach** with controlled inputs:

1. **Markdown → Blocks**: `parseMarkdownToBlocks(markdown)` in `blocks/utils.ts` splits content into `Block[]`
   - Block types: `paragraph`, `heading1-6`, `code`, `quote`, `list`, `ordered`, `task`, `hr`, `table`

2. **Block Components** (`components/editor/blocks/`):
   - `Block.tsx` - Unified block component with edit/render modes (uses `renderCodeBlockInnerHtml` for code syntax highlighting)
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

5. **Image Handling** (`src/lib/image-utils.ts`):
   - `resolveImageSource()` - Direct path passthrough, browser handles resolution
   - `buildImageTag()` - Builds `<img>` tag with proper attributes
   - `parseImageReference()` - Parses markdown image syntax `![alt](src)`
   - Images use raw paths in both WYSIWYG and Split modes

```typescript
interface FileNode {
  id: string
  name: string
  type: "file" | "folder"
  children?: FileNode[]
  content?: string
  isExpanded?: boolean
  filePath?: string
  sourceModified?: number | null
  isDirty?: boolean          // Modified after save
  isNew?: boolean            // Created in-page, never saved
  hasExternalChanges?: boolean
}
```

Key store methods:
- `saveFile()` - Direct save for files with `filePath`, Save As for new files
- `openFileFromPath(filePath)` - Opens file via CLI file association
- `setContent(content)` - Updates content and recalculates word/char counts via `updateCounts()`
- `hasUnsavedChanges()` - Check if any file has unsaved changes
- `getUnsavedFiles()` - Get list of files with unsaved changes
- `watchFileChanges(filePath)` / `clearFileWatcher()` - File watching via Rust backend

Scroll position methods (per-file):
- `saveScrollPosition(fileId, editorScroll, previewScroll)` - Save scroll as percentage
- `getScrollPosition(fileId)` - Get saved scroll position for a file
- `setShouldResetScroll(value)` - Set flag to reset scroll to top on next switch

### File Operations (`src/lib/file-operations.ts`)
- `importFiles()` - Uses Tauri dialog plugin to select .md/.pdf files; PDFs use `convertFileSrc` for streaming
- File reads via `invoke("read_file")`, writes via `invoke("write_file")`

### Additional Utilities
- `src/lib/search-utils.ts` - Search functionality helpers
- `src/lib/code-highlighting.ts` - Code syntax highlighting
- `src/workers/` - Web workers for background processing

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
- Asset protocol: enabled with `scope: ["**"]` for PDF streaming
- Permissions: `src-tauri/capabilities/default.json`

## Key Files

| File | Purpose |
|------|---------|
| `src/main.tsx` | App entry point, close event handling |
| `src/lib/editor-store.ts` | Zustand store - all editor state |
| `src/lib/file-operations.ts` | File import via Tauri dialog |
| `src/lib/image-utils.ts` | Image path resolution and tag building |
| `src/lib/markdown-render.ts` | Markdown-to-HTML rendering |
| `src/lib/search-utils.ts` | Search functionality helpers |
| `src/components/editor/index.tsx` | Main layout + global keyboard shortcuts |
| `src/components/editor/editor-area.tsx` | Editor area container |
| `src/components/editor/sidebar.tsx` | File tree sidebar container |
| `src/components/editor/file-tree.tsx` | File tree with drag-drop support |
| `src/components/editor/title-bar.tsx` | Title bar with menu, update dialog, window controls |
| `src/components/editor/split-editor.tsx` | Split view with percentage-based scroll sync |
| `src/components/editor/markdown-renderer.tsx` | Markdown preview renderer (immediate on switch, deferred on edit) |
| `src/components/editor/wysiwyg-editor.tsx` | Block-based WYSIWYG editor |
| `src/components/editor/blocks/Block.tsx` | Unified block component (edit/render modes) |
| `src/components/editor/blocks/types.ts` | Block and BlockType definitions |
| `src/components/editor/blocks/utils.ts` | Markdown parsing and serialization |
| `src/components/editor/pdf-renderer.tsx` | PDF.js renderer (备用，当前使用原生 embed) |
| `src/components/editor/close-confirm-dialog.tsx` | Close confirmation for unsaved changes |
| `src/components/editor/update-dialog.tsx` | Update download and installation dialog |
| `src/components/editor/outline.tsx` | Markdown outline/toc |
| `src/components/editor/status-bar.tsx` | Status bar with word/char counts |
| `src/workers/markdown-render-worker.ts` | Web worker for markdown rendering |
| `src-tauri/src/lib.rs` | Rust commands: file I/O, updates, CLI, window close |
| `src-tauri/src/main.rs` | Rust entry point |
| `src-tauri/tauri.conf.json` | App window, bundle, file associations |
| `vite.config.ts` | Vite + Tailwind CSS 4 setup |
| `src/index.css` | Theme CSS variables (light/dark) + editor styles |

## Additional Documentation

Detailed documentation in Chinese available in `docx/`:
- `docx/使用手册.md` - User manual
- `docx/开发者手册.md` - Developer guide with environment setup
- `docx/Split模式滚动同步方案.md` - Split mode scroll sync implementation details
