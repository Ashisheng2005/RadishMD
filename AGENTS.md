# AGENTS.md

RadishMD is a Tauri 2 + React 19 Markdown editor. Frontend is `src/`. Rust is only `src-tauri/src/lib.rs`; `main.rs` calls `radishmd_lib::run()`. `docx/` is Chinese notes and can lag the code — trust scripts and source. Commit style is Conventional Commits (`CONTRIBUTING.md`); `npm run release:notes` reads those commits.

## Commands

- `npm run dev` — Vite only, port 1420. No Rust, dialogs, watcher, or `data/` files.
- `npm run tauri dev` — full app. `beforeDevCommand` (`scripts/start-tauri-dev.mjs`) starts Vite on **1421** only if that port is free; if it is taken the script exits 0 and reuses the existing server. `devUrl` is `http://localhost:1421`.
- `npm run dev:tauri` — Vite on 1421 with `strictPort`, without Rust.
- `npm run build` is `tsc && vite build`. There is no lint or test script. Focused typecheck: `npx tsc --noEmit`. Manual check is `npm run dev` or `npm run tauri dev`.
- Version source of truth is `package.json`. `predev` / `prebuild` / `prepreview` / `pretauri` run `version:sync` into `tauri.conf.json` and `Cargo.toml`. Do not bump those by hand.
- Bundle targets live in `tauri.windows.conf.json` (nsis), `tauri.linux.conf.json` (deb/rpm), and `tauri.macos.conf.json` (dmg), not only `tauri.conf.json`.

## Editors

Both modes edit with a native `<textarea>`. `@codemirror/*` is installed and unused. Do not wire CodeMirror back in unless asked.

- `editMode === "split"` and every PDF render `SplitEditor` (`editor-area.tsx`). PDF uses `pdfjs-dist` in that view and disables scroll sync.
- WYSIWYG is `parseMarkdownToBlocks()` → `Block`: view mode is `dangerouslySetInnerHTML`, edit mode is a textarea. No `contentEditable`.
- Toolbar buttons `preventDefault` on left `mousedown` so the textarea keeps its selection. WYSIWYG also exposes formatting as `window.__formatShortcut`.
- React StrictMode double-mounts in dev. Listeners, the file watcher, and the markdown worker need cleanup.

## Markdown (keep both parsers in sync)

- Split preview: `src/lib/markdown-render.ts` inside `src/workers/markdown-render-worker.ts`. The worker cannot touch `window`, `convertFileSrc`, KaTeX, or Mermaid.
- WYSIWYG: `src/components/editor/blocks/utils.ts`.
- Main-thread post-process in `markdown-renderer.tsx`: `resolveImagePathsInHtml`, `renderMathInHtml`, `renderMermaidInContainer`. `buildImageTag()` does not resolve paths.
- Split escapes HTML before the image/link regexes, so `<dest>` is `&lt;dest&gt;` there. WYSIWYG matches raw `<dest>`. A destination fix must update both files and `parseImageReference()` in `src/lib/image-utils.ts`.
- Local images and PDFs use the asset protocol (`convertFileSrc`). New external assets also need a CSP change in `tauri.conf.json`; production CSP failures are silent.
- Vite ignores `src-tauri/**`, `*.md`, and `*.markdown`, so saving Markdown does not reload the dev server.

## Insert link / image

Shared helpers are `src/lib/markdown-insert.ts`. Both `split-editor.tsx` and `wysiwyg-editor.tsx` must use them.

- Clipboard fill is the setting `pasteClipboardUrlOnLink`, default **false**. It reads `navigator.clipboard.readText()` (current text, first line only — not clipboard history). Empty or failed reads insert `url` and select it. There is no Rust clipboard command.
- Image insert opens the Tauri `open` dialog. Cancel inserts nothing. Outside Tauri, keep the `url` placeholder.
- A saved document gets a relative path; unsaved or cross-drive paths stay absolute. Always forward slashes. Wrap the destination in `<>` when it has spaces, parentheses, or angle brackets.
- Capture textarea value and selection **before** the clipboard or dialog await. The file dialog blurs the WYSIWYG textarea and leaves edit mode. If `activeFileId` changed when the await returns, drop the insert.

## Persistence

Canonical files sit next to the executable, not in the OS app-data dir:

- `{exe_dir}/data/settings.json` — `version`, `theme`, `tabSize`, `pasteClipboardUrlOnLink`
- `{exe_dir}/data/session.json` — open roots, active path, expanded folders, scroll percents, sidebar/outline, `editMode`, `splitViewMode`

`tauri dev` writes them under `src-tauri/target/debug/data/`. A missing software-dir file is copied once from the legacy app-data path. Saves go through `load_*` / `save_*` commands (atomic, queued). Do not write these files from the frontend.

`localStorage` keys `radishmd.theme`, `radishmd.tabSize`, and `radishmd.pasteClipboardUrlOnLink` are a first-paint cache only. `index.html` reads the theme key before React and still accepts an old Zustand `{state:{theme}}` blob. The settings file wins on hydrate. A missing `pasteClipboardUrlOnLink` means false.

`src/components/editor/index.tsx` applies settings before restoring the session, and sets `settingsHydratedRef` first so that hydrate is not saved as a user edit. A new setting must be added to `AppSettings`, serialize/parse, the store, `currentSettings()`, and that subscription. Do not put theme or tab size in the session snapshot — `sessionFieldsChanged` ignores them. Session does not store document text; files are re-read from disk.

Settings UI is `settings-dialog.tsx` (外观 / 编辑 / 关于), not a title-bar popover. Appearance controls stay in `appearance-settings.tsx`.

## Backend

New `invoke` names must be registered in `generate_handler!` in `lib.rs`. Plugins: `opener`, `dialog`, `cli`.

Document saves use `write_file_atomic` with `expected_modified`. A mismatch returns `conflict: 文件已在外部修改`. Do not switch saves to `write_file`. PDF paths are rejected for text writes.

Events: `radishmd://file-changed`, `radishmd://file-opened`, `radishmd://close-requested` (close is intercepted until `confirm_close`), `radishmd://update-download-progress`. Update checks target GitHub `Ashisheng2005/RadishMD`.

`isTauriRuntime()` checks `window.__TAURI_INTERNALS__`. Gate file, watcher, session, and settings commands on it. File-tree nodes are deduped by normalized `filePath`; never-saved files are `isNew`, edited files are `isDirty`.
