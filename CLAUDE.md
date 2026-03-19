# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RadishMD is a WYSIWYG Markdown desktop editor (similar to Typora) built with Tauri 2.x, React 19, and Milkdown. Features include GitHub Flavored Markdown support, multiple theme switching (light, nord, dark, warm), and native file dialogs.

**User Manual**: See `./docs/使用手册.md`
**Developer Manual**: See `./docs/开发者手册.md`

## Tech Stack

| Category | Technology |
| -------- | ---------- |
| Desktop Framework | Tauri 2.x (Rust backend) |
| Frontend | React 19, TypeScript, Vite 7.x |
| UI | Tailwind CSS v4, shadcn-ui (Radix), Lucide icons |
| Editor | Milkdown (ProseMirror-based WYSIWYG) |

## Commands

```bash
# Install dependencies
npm install

# Type-check TypeScript (no emit)
npx tsc --noEmit

# Run frontend dev server only (no Tauri) - http://localhost:1420
npm run dev

# Preview built frontend
npm run preview

# Build frontend for production (runs tsc first)
npm run build

# Run Tauri development (Windows)
powershell.exe -ExecutionPolicy Bypass -File run_dev.ps1

# Build Tauri application for production
npm run tauri build
```

## Architecture

### Frontend (`src/`)

- `App.tsx` - Page-level composition layer
- `hooks/useEditorWorkspace.ts` - Workspace state abstraction (`content`, `theme`, `currentFilePath`, `editorKey`, `editorActionsRef`)
- `Toolbar.tsx` - Thin entry component that wires controller, menu view, and dialogs together
- `MilkdownEditor.tsx` - WYSIWYG editor component that composes the `milkdown/` subdirectory

**State Flow:**
1. `useEditorWorkspace` owns the page state (`content`, `theme`, `currentFilePath`, `editorKey`)
2. `App.tsx` passes workspace state into `Toolbar` and `MilkdownEditor`
3. `Toolbar` delegates file I/O and editor actions through `useToolbarController`
4. Opening a file increments `editorKey` to force re-mount of `MilkdownEditor`
5. Theme is applied via `data-theme` on the root container

### Milkdown Subdirectory (`src/components/milkdown/`)

The editor logic has been modularized into a subdirectory:
- `types.ts` - `EditorActions`, `ThemeType`, `ActiveCodeBlockState`, `LanguageOption` interfaces
- `mathBlock.ts` - Custom math block schema, node view, and input rule (`customMathBlockSchema`, `customMathBlockView`, `customMathBlockInputRule`)
- `CodeBlockLanguageSelector.tsx` - Floating UI for selecting code block languages
- `useCodeBlockLanguageSelector.ts` - Hook managing code block language selector state and events
- `codeBlockLanguages.ts` - `CODE_LANGUAGES` array and `getLanguageLabel` helper

### Toolbar Subdirectory (`src/components/toolbar/`)

The toolbar has been split into controller, view, and configuration layers:
- `types.ts` - Toolbar contract types, including `ToolbarProps`, `ToolbarActions`, `ToolbarUiState`, and menu node types
- `useToolbarController.ts` - File actions, editor actions, keyboard shortcuts, and UI state coordination
- `ToolbarMenus.tsx` - Menu rendering layer driven by configuration
- `ToolbarDialogs.tsx` - About, shortcuts, and table dialogs
- `toolbarConfig.ts` - Static about text and shortcut groups
- `toolbarMenuConfig.ts` - Menu section definitions, groups, shortcuts, and action names

### Backend (`src-tauri/`)

- `src/main.rs` - Entry point, calls `lib::run()`
- `src/lib.rs` - Plugin initialization (fs, dialog, opener)
- `Cargo.toml` - Rust dependencies
- `tauri.conf.json` - App window config (800x600), bundle targets (nsis)

## Milkdown Editor Architecture

The editor is built using a plugin-based approach. Key plugins from `@milkdown`:
- `commonmark` - Basic Markdown syntax
- `gfm` - GitHub Flavored Markdown (tables, task lists, etc.)
- `prism` - Syntax highlighting via refractor
- `history` - Undo/redo
- `clipboard` - Copy/paste support
- `listener` - Markdown change events
- `mathInlineSchema` + `remarkMathPlugin` - Inline math (`$...$`)
- `customMathBlockSchema` + `customMathBlockView` - Block math (`$$...$$`) with Typora-style editing

**Custom Math Block:** Uses a separate `customMathBlockSchema` (created via `$nodeSchema`) rather than the one from `@milkdown/plugin-math`, because Milkdown's schema `toDOM` takes precedence over custom `$view` overrides. The custom schema includes:
- `parseDOM`/`toDOM` for ProseMirror DOM handling
- `parseMarkdown`/`toMarkdown` for Markdown serialization
- `customMathBlockView` for the interactive textarea/KaTeX preview UI
- `customMathBlockInputRule` for `$$...$$` input pattern

**Editor Context:** The editor stores refs to `editorViewCtx`, `commandsCtx`, and `schemaCtx` for imperative operations like inserting nodes.

## Key Configuration

- `src-tauri/tauri.conf.json` - App name, window size, bundle targets
- `src-tauri/Cargo.toml` - tauri, tauri-plugin-fs, tauri-plugin-dialog, tauri-plugin-opener
- `vite.config.ts` - Path alias `@` -> `./src`, dev server on port 1420
- `tsconfig.json` - TypeScript strict mode enabled (`noUnusedLocals`, `noUnusedParameters`)

## Tauri Plugins

| Plugin | Purpose | Frontend API |
|--------|---------|--------------|
| tauri-plugin-fs | File read/write | `readTextFile()`, `writeTextFile()` |
| tauri-plugin-dialog | Native dialogs | `open()`, `save()` |
| tauri-plugin-opener | Open URLs | `openUrl()` |

**Adding a new plugin:**
1. Add Rust crate to `src-tauri/Cargo.toml`
2. Initialize in `src-tauri/src/lib.rs`
3. Add npm package
4. Configure permissions in `src-tauri/capabilities/default.json`

## Development Notes

### Milkdown Editor
- Initialized in `useEffect` with empty dependency array `[]`
- Content set via `defaultValueCtx` on initial creation
- Opening a file increments the editor's `key` prop to force re-mount
- Prism plugin uses `refractor/all` for 100+ language syntax highlighting
- Editor refs (`editorViewRef`, `commandsRef`, `schemaRef`) are set in a `setTimeout(100)` after creation to ensure ctx is ready

### Toolbar Architecture
- Keep business logic inside `useToolbarController`
- Keep menu rendering in `ToolbarMenus.tsx`
- Keep dialog rendering in `ToolbarDialogs.tsx`
- Put static text and shortcut group data in `toolbarConfig.ts`
- Put menu structure and action names in `toolbarMenuConfig.ts`

### Theme System
4 themes: `light`, `nord`, `dark`, `warm` - defined in `src/index.css` using CSS custom properties, applied via `data-theme` on root container.

### Editor Actions API
`MilkdownEditor.tsx` exports an `EditorActions` interface (defined in `milkdown/types.ts`) with imperative methods accessible via `editorRef.current`:
- `insertText`, `insertCodeBlock`, `insertTable`, `insertLink`, `insertImage`
- `toggleBold`, `toggleItalic`, `toggleStrikeThrough`, `toggleCode`
- `undo`, `redo`
- `insertHeading`, `insertOrderedList`, `insertUnorderedList`, `insertBlockquote`, `insertHorizontalRule`
- `insertMathInline`, `insertMathBlock`

### Math Block (Typora-style)
- Shows editable div when focused, renders KaTeX when blurred
- Schema and node view defined in `milkdown/mathBlock.ts`
- Custom node view uses `MutationObserver` to sync content changes
- `stopEvent` method prevents ProseMirror selection conflicts

### Code Block Language Selector
After inserting a code block, a floating language selector appears with:
- Searchable dropdown of languages (javascript, typescript, python, etc.)
- Up/down arrow keys to navigate, Enter to select, Escape to close
- `CODE_LANGUAGES` array in `milkdown/codeBlockLanguages.ts` defines available languages
- State managed by `useCodeBlockLanguageSelector` hook in `milkdown/useCodeBlockLanguageSelector.ts`

### Tailwind CSS v4
Uses `@import "tailwindcss"` with theme variables in `@theme` block. shadcn-ui components use `class-variance-authority` for variants.

### Windows Development
First `npm run tauri dev` takes 10-20 minutes (Rust compilation). Uses `run_dev.ps1` to set Rust environment. Requires MSVC target.

## Recommended IDE

VS Code with [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) and [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer) extensions.
