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

- `editMode === "split"` and every PDF render `SplitEditor` (`editor-area.tsx`). PDF is an `<embed>`, not `pdf-renderer.tsx` (that file is unused). Scroll sync returns early when `contentType === "pdf"`.
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
- `{exe_dir}/data/session.json` — open roots, active path, expanded folders, scroll percents, sidebar/outline, `editMode`, `splitViewMode`, optional `openFilePaths`

`tauri dev` writes them under `src-tauri/target/debug/data/`. A missing software-dir file is copied once from the legacy app-data path. Saves go through `load_*` / `save_*` commands (atomic, queued). Do not write these files from the frontend.

`localStorage` keys `radishmd.theme`, `radishmd.tabSize`, and `radishmd.pasteClipboardUrlOnLink` are a first-paint cache only. `index.html` reads the theme key before React and still accepts an old Zustand `{state:{theme}}` blob. The settings file wins on hydrate. A missing `pasteClipboardUrlOnLink` means false.

`src/components/editor/index.tsx` applies settings before restoring the session, and sets `settingsHydratedRef` first so that hydrate is not saved as a user edit. A new setting must be added to `AppSettings`, serialize/parse, the store, `currentSettings()`, and that subscription. Do not put theme or tab size in the session snapshot — `sessionFieldsChanged` ignores them. Session does not store document text.

Startup restore classifies each `rootPath` with `getPathStatus` / Rust `path_status` (`"dir"` | `"file"` | `"missing"`; only `NotFound` is `"missing"`). Do not use `is_directory` here: a missing path is false, so restore used to open it as a file, toast `打开失败`, and freeze the window. `is_directory`, `path_status`, `read_file_snapshot`, and `read_directory_entries` are sync commands on the Tauri main thread.

- `"dir"`: `openFolderPath` with `activateFirstFile: false` (list only, no body).
- `"file"`: unloaded sidebar node, no body read.
- `"missing"`: skip, no toast.
- CLI and manual opens still read immediately through `openExternalPath`.

Settings UI is `settings-dialog.tsx` (外观 / 编辑 / 关于), not a title-bar popover. Appearance controls stay in `appearance-settings.tsx`.

## Section rail

`section-rail.tsx` is a heading rail, not a document minimap. Do not draw per-line canvas bars.

- Only h1/h2 from `parseMarkdownHeadings`. Shown only when the outline is closed, the file is not a PDF, there are at least two such headings, and the tracked scroller can scroll.
- Clicks call `jumpToHeading` in `outline.tsx`. Do not add a second scroll path. That helper still queries `[contenteditable]` after a rendered jump; nothing sets it.
- Hover is one truncated popover chip beside the tick, not a full-height panel. Moving between ticks moves that chip; leaving fades it out.
- Ticks use a 20px step and are centered in the track when that packing fits. Spread by source-line proportion only when it does not. The rail is `fixed` to the window; tick tops are inset below the title bar and above the status bar.
- Editor-only spies `[data-editor-textarea]` via `measureTextareaLineTop`. Every other markdown view spies `[data-editor-scroll-container]` (WYSIWYG and the split preview both set it). In split mode the rail follows the preview; existing percent sync moves the textarea.

## Editor tabs

Tabs are not the file tree. `openFileIds` is a separate ordered list; `editor-tabs.tsx` renders it in the status-bar center, left-aligned, 5 visible (`VISIBLE_TAB_COUNT`). Paging is local UI state. `Ctrl+←` / `Ctrl+→` move that window by one and must not run while focus is in an input, textarea, or dialog.

Open a tab through `appendOpenFileId` in `setActiveFile`, new-file create, and `openFileFromPath`. Do not only set `activeFileId`. `closeOpenFile` removes the tab and activates the right neighbor, then the left. It must not call `removeNode`. Deleting a tree node also drops its id from `openFileIds`.

On launch, only `activeFilePath` is read. Other `openFilePaths` are tabs only (`resolveSessionFileNode`). No active path means an empty editor — do not activate `openFileIds[0]`. A path not already in the tree is a `tabOnly` placeholder: hidden from the file tree, omitted from session `rootPaths`, still stored in `openFilePaths`. `replaceFolderChildren` adopts a root `tabOnly` node when the same path appears in a directory listing and keeps its id. An explicit `openFileFromPath` of that node clears `tabOnly`.

An unloaded node (`content` undefined, or `""` with `sourceModified == null`, and not dirty/new) calls `getPathStatus` before read. Missing sets `missingTabPrompt`; `missing-tab-dialog.tsx` asks `文档不存在，是否删除标签？`. Yes calls `closeOpenFile`, and `removeNode` only when `tabOnly`. No sets `missingPromptDismissed` and must not ask or stat again this session. Other errors toast and keep the tab. Already-loaded text still refreshes with `read_file_snapshot` on switch and does not use that dialog. An already-loaded PDF returns early — its node `content` is the `convertFileSrc` URL, so do not re-close the sidebar. `checkActiveFileForExternalChanges` skips unloaded and dismissed files. `watch_file_changes` may fail for a missing active path; that error is not fatal.

Persist paths as optional `openFilePaths` on session `version: 1`. A missing field is a legacy session: do not bump the version, and do not wipe tabs before the active file is restored. Files with no `filePath` cannot be cached. The visible-window index is not persisted.

## Backend

New `invoke` names must be registered in `generate_handler!` in `lib.rs`. Plugins: `opener`, `dialog`, `cli`.

Document saves use `write_file_atomic` with `expected_modified`. A mismatch returns `conflict: 文件已在外部修改`. Do not switch saves to `write_file`. PDF paths are rejected for text writes.

Events: `radishmd://file-changed`, `radishmd://file-opened`, `radishmd://close-requested` (close is intercepted until `confirm_close`), `radishmd://update-download-progress`. Update checks target GitHub `Ashisheng2005/RadishMD`.

`isTauriRuntime()` checks `window.__TAURI_INTERNALS__`. Gate file, watcher, session, and settings commands on it. File-tree nodes are deduped by normalized `filePath`; never-saved files are `isNew`, edited files are `isDirty`.
