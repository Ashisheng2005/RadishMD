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
- Vite 7 + React 19 + TypeScript
- Tailwind CSS 4 (using `@tailwindcss/vite` plugin)
- Zustand for state management
- shadcn/ui component library (located in `src/components/ui/`)

**Backend (Rust):**
- Tauri 2 framework
- Plugins: `tauri-plugin-opener` (external links), `tauri-plugin-dialog` (file dialogs)
- Commands in `src-tauri/src/lib.rs`: `read_file`, `write_file`, `get_file_name`

**State Management:**
- `src/lib/editor-store.ts` - Zustand store managing:
  - File tree and active file
  - Editor content
  - UI toggles (sidebar, outline, theme)
  - Word/character counts

**Editor Components** (`src/components/editor/`):
- `index.tsx` - Main Editor container
- `editor-area.tsx` - Split editor/preview panes
- `markdown-renderer.tsx` - Markdown to HTML rendering
- `toolbar.tsx` - Formatting toolbar
- `title-bar.tsx` - Top bar with theme/sidebar toggles
- `sidebar.tsx` / `file-tree.tsx` - File explorer
- `outline.tsx` - Document headings outline
- `status-bar.tsx` - Bottom status bar

**Tauri Configuration:**
- Window settings: 1200x800 default, 800x600 minimum, decorated (standard window frame)
- Bundle targets: all (MSI, NSIS, etc.)
- Frontend dist: `../dist` (Vite build output)

## Key Files

- `src-tauri/tauri.conf.json` - Tauri app configuration
- `src-tauri/capabilities/default.json` - Tauri 2 permission capabilities
- `src-tauri/Cargo.toml` - Rust dependencies
- `vite.config.ts` - Vite configuration with Tailwind plugin
- `src/index.css` - Tailwind CSS 4 with CSS variables (light/dark themes)
