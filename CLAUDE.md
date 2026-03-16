# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A WYSIWYG Markdown desktop editor (similar to Typora) built with Tauri 2.x, React 19, and Milkdown. Features include GitHub Flavored Markdown support, dark/light theme switching, and native file dialogs.

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
├── Toolbar.tsx         # File open/save via Tauri plugins, theme toggle
└── MilkdownEditor.tsx  # WYSIWYG editor using Milkdown
    └── Uses: commonmark, gfm, history, clipboard, listener plugins
```

**State Flow:**
1. `App.tsx` holds `content` state (markdown string) and `theme` state
2. `MilkdownEditor` receives `initialValue` and emits changes via `onChange`
3. `Toolbar` uses `@tauri-apps/plugin-fs` and `@tauri-apps/plugin-dialog` for file I/O
4. When a file is opened, `editorKeyRef` increments to force re-mount of `MilkdownEditor`

### Backend (`src-tauri/`)

```
src/main.rs     # Entry point, calls lib::run()
src/lib.rs      # Plugin initialization (fs, dialog, opener)
Cargo.toml      # Rust dependencies
tauri.conf.json # App window config, bundle settings
```

## Key Configuration

- `src-tauri/tauri.conf.json` - App name, window size (800x600), bundle targets
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
  index.css                  # Tailwind CSS v4
  /components
    MilkdownEditor.tsx       # Milkdown wrapper
    Toolbar.tsx              # File ops & theme toggle
    /ui
      button.tsx             # shadcn-ui Button
      separator.tsx          # shadcn-ui Separator
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
