# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A WYSIWYG Markdown desktop editor (similar to Typora) built with Tauri 2.x, React 19, and Milkdown. Features include GitHub Flavored Markdown support, multiple theme switching (light, nord, dark, warm), and native file dialogs.

**User Manual**: See `./docs/使用手册.md` for detailed usage instructions.
**Developer Manual**: See `./docs/开发者手册.md` for development and packaging guide.

## Tech Stack

| Category | Technology |
| -------- | ---------- |
| Desktop Framework | Tauri 2.x (Rust backend) |
| Frontend | React 19, TypeScript, Vite 7.x |
| UI | Tailwind CSS v4, shadcn-ui (Radix), Lucide icons |
| Editor | Milkdown (ProseMirror-based WYSIWYG) |

## Environment Requirements

- **Node.js**: 18+
- **Rust**: 1.70+
- **Platform-specific**:
  - Windows: MSVC target (`rustup target add x86_64-pc-windows-msvc`), Visual Studio Build Tools
  - Linux: `libwebkit2gtk-4.1-dev`, `libssl-dev`, `build-essential`
  - macOS: Xcode Command Line Tools

## Commands

```bash
# Install dependencies
npm install

# Run frontend dev server only (no Tauri)
npm run dev

# Build frontend for production
npm run build

# Run Tauri development (Windows - requires Rust toolchain)
powershell.exe -ExecutionPolicy Bypass -File run_dev.ps1

# Build Tauri application for production
npm run tauri build
```

## Architecture

### Frontend (`src/`)

```
App.tsx                 # Main component: manages state (content, theme, editor key)
├── Toolbar.tsx         # Full menu bar with File/Edit/View/Format/Theme/Help menus
└── MilkdownEditor.tsx  # WYSIWYG editor using Milkdown
    └── Uses: commonmark, gfm, history, clipboard, listener plugins
```

**State Flow:**
1. `App.tsx` holds `content` state (markdown string) and `theme` state (`ThemeType` = 'light' | 'nord' | 'dark' | 'warm')
2. `MilkdownEditor` receives `initialValue` and emits changes via `onChange`
3. `Toolbar` uses `@tauri-apps/plugin-fs` and `@tauri-apps/plugin-dialog` for file I/O
4. When a file is opened, `editorKeyRef` increments to force re-mount of `MilkdownEditor`
5. Theme is applied via `data-theme` attribute on root div

### Backend (`src-tauri/`)

```
src/main.rs     # Entry point, calls lib::run()
src/lib.rs      # Plugin initialization (fs, dialog, opener)
Cargo.toml      # Rust dependencies
tauri.conf.json # App window config, bundle targets (nsis)
```

## Key Configuration

- `src-tauri/tauri.conf.json` - App name, window size (800x600), bundle targets (nsis)
- `src-tauri/Cargo.toml` - tauri, tauri-plugin-fs, tauri-plugin-dialog, tauri-plugin-opener
- `vite.config.ts` - Path alias `@` -> `./src`, Tauri dev server config (port 1420)
- `tsconfig.json` - Path alias `@` configured

## Tauri Plugins

| Plugin | Purpose | Frontend API |
|--------|---------|--------------|
| tauri-plugin-fs | File read/write | `@tauri-apps/plugin-fs` - `readTextFile()`, `writeTextFile()` |
| tauri-plugin-dialog | Native dialogs | `@tauri-apps/plugin-dialog` - `open()`, `save()` |
| tauri-plugin-opener | Open URLs externally | `@tauri-apps/plugin-opener` - `openUrl()` |

**Adding a new plugin:**
1. Add Rust crate to `src-tauri/Cargo.toml` (e.g., `tauri-plugin-fs = "2"`)
2. Initialize in `src-tauri/src/lib.rs`: `.plugin(tauri_plugin_fs::init())`
3. Add npm package (e.g., `@tauri-apps/plugin-fs`)
4. Configure permissions in `src-tauri/capabilities/default.json`

## Development Notes

### React Strict Mode
- **Disabled** in `src/main.tsx` to prevent Milkdown dual mounting issues
- Do NOT re-enable `<React.StrictMode>` - it causes content duplication

### Milkdown Editor
- Initialized in `useEffect` with empty dependency array `[]` - runs once on mount
- Content is set via `defaultValueCtx` on initial creation
- When opening a file, parent component increments `key` to force complete re-mount
- Uses Nord theme by default, supports GFM (tables, task lists, etc.)
- `ThemeType` is exported for use by other components
- Prism plugin for syntax highlighting uses `refractor/all` to support 100+ languages

### Code Block Language Selection
- Click on a code block or use toolbar to show language selector dropdown
- Language selector positioned below the code block
- Uses ProseMirror transactions to update node attributes
- Supported languages: JavaScript, TypeScript, Python, Java, C++, Go, Rust, HTML, CSS, JSON, YAML, Markdown, SQL, Bash, XML, C#, PHP
- **Auto-popup on creation**: When inserting a code block via toolbar (Ctrl+Shift+M), the language selector automatically appears
- **First click behavior**: For manually created code blocks, the selector also appears on the first click after creation. For imported code blocks, the selector does NOT appear on click
- **Keyboard navigation**: Arrow keys to navigate, Enter to confirm, Escape to close
- After selecting a language, the selector stays closed until user manually re-opens it

### Theme System
- 4 themes available: `light` (浅色), `nord` (蓝灰), `dark` (深灰/VS Code), `warm` (暖灰/Typora)
- Themes defined in `src/index.css` using CSS custom properties
- Applied via `data-theme` attribute on root container
- Theme variables control colors for: background, foreground, border, accent, primary, etc.

### Editor Actions API
The `EditorActions` interface (exported from `MilkdownEditor.tsx`) provides imperative methods for toolbar operations:
- `insertText`, `insertCodeBlock`, `insertTable`, `insertLink`, `insertImage`
- `toggleBold`, `toggleItalic`, `toggleStrikeThrough`, `toggleCode`
- `undo`, `redo`
- `insertHeading`, `insertOrderedList`, `insertUnorderedList`, `insertBlockquote`, `insertHorizontalRule`
- `insertMathInline`, `insertMathBlock`

Toolbar passes a ref to MilkdownEditor to access these actions.

### Toolbar Menu Structure
- **文件 (File)**: New (Ctrl+N), Open (Ctrl+O), Save (Ctrl+S), Save As (Ctrl+Shift+S), Close
- **编辑 (Edit)**: Undo (Ctrl+Z), Redo (Ctrl+Y), Cut (Ctrl+X), Copy (Ctrl+C), Paste (Ctrl+V), Select All (Ctrl+A), Find (Ctrl+F), Replace (Ctrl+H)
- **视图 (View)**: Source Mode, Focus Mode, Typewriter Mode, Sidebar Outline
- **格式 (Format)**: Bold (Ctrl+B), Italic (Ctrl+I), Strikethrough, Code (Ctrl+`), Link (Ctrl+Shift+L), Image
- **主题 (Theme)**: Theme selection via radio group
- **帮助 (Help)**: About, Keyboard Shortcuts

### Important Keyboard Shortcuts (handled in Toolbar.tsx)
- `Ctrl+Shift+M`: Insert code block
- `Ctrl+\`` : Inline code
- `Ctrl+Shift+L`: Insert link
- `Ctrl+Shift+7`: Ordered list
- `Ctrl+Shift+8`: Unordered list
- `Ctrl+Shift+.`: Blockquote

### Tailwind CSS v4
- Uses `@import "tailwindcss"` in `src/index.css`
- Theme variables defined in `@theme` block
- shadcn-ui components use `class-variance-authority` for variants

### Windows Development
- First `npm run tauri dev` takes 10-20 minutes (Rust compilation)
- Uses `run_dev.ps1` to set Rust environment path correctly
- Requires MSVC Rust target on Windows

## File Structure

```
/src
  App.tsx                    # Main app component
  main.tsx                   # React entry (StrictMode disabled)
  index.css                  # Tailwind CSS v4 + theme variables
  /components
    MilkdownEditor.tsx       # Milkdown wrapper (exports ThemeType)
    Toolbar.tsx              # Full menu bar with dropdown menus
    /ui
      button.tsx             # shadcn-ui Button
      separator.tsx          # shadcn-ui Separator
      dropdown-menu.tsx      # shadcn-ui DropdownMenu
      dialog.tsx             # shadcn-ui Dialog
  /lib
    utils.ts                 # cn() utility
/src-tauri
  src/main.rs, lib.rs        # Rust entry & plugins
  Cargo.toml                 # Rust deps
  tauri.conf.json            # Tauri config
  capabilities/              # Plugin permissions
```

## Recommended IDE

VS Code with:
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
