import { invoke } from "@tauri-apps/api/core"
import { isTauriRuntime } from "./runtime"

export type AppTheme = "light" | "dark" | "system"
export type AppTabSize = 4 | 6 | 8

export interface AppSettings {
  version: 1
  theme: AppTheme
  tabSize: AppTabSize
  pasteClipboardUrlOnLink: boolean
}

const THEME_CACHE_KEY = "radishmd.theme"
const TAB_SIZE_CACHE_KEY = "radishmd.tabSize"
const PASTE_CLIPBOARD_URL_KEY = "radishmd.pasteClipboardUrlOnLink"

export function defaultAppSettings(): AppSettings {
  return {
    version: 1,
    theme: "system",
    tabSize: 4,
    pasteClipboardUrlOnLink: false,
  }
}

function isAppTheme(value: unknown): value is AppTheme {
  return value === "light" || value === "dark" || value === "system"
}

function isAppTabSize(value: unknown): value is AppTabSize {
  return value === 4 || value === 6 || value === 8
}

export function serializeAppSettings(settings: AppSettings) {
  return JSON.stringify({
    version: 1 as const,
    theme: settings.theme,
    tabSize: settings.tabSize,
    pasteClipboardUrlOnLink: settings.pasteClipboardUrlOnLink,
  })
}

export function readSettingsCache(): AppSettings {
  if (typeof window === "undefined") {
    return defaultAppSettings()
  }

  const storedTheme = window.localStorage.getItem(THEME_CACHE_KEY)
  let theme: AppTheme = "system"
  if (isAppTheme(storedTheme)) {
    theme = storedTheme
  } else if (storedTheme) {
    try {
      const parsed = JSON.parse(storedTheme) as { state?: { theme?: unknown } }
      if (isAppTheme(parsed.state?.theme)) {
        theme = parsed.state.theme
      }
    } catch {
      theme = "system"
    }
  }

  const storedTabSize = window.localStorage.getItem(TAB_SIZE_CACHE_KEY)
  const tabSize: AppTabSize = storedTabSize === "6" || storedTabSize === "8"
    ? Number.parseInt(storedTabSize, 10) as AppTabSize
    : 4

  return {
    version: 1,
    theme,
    tabSize,
    pasteClipboardUrlOnLink: window.localStorage.getItem(PASTE_CLIPBOARD_URL_KEY) === "true",
  }
}

export function writeSettingsCache(settings: AppSettings) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(THEME_CACHE_KEY, settings.theme)
  window.localStorage.setItem(TAB_SIZE_CACHE_KEY, String(settings.tabSize))
  window.localStorage.setItem(PASTE_CLIPBOARD_URL_KEY, settings.pasteClipboardUrlOnLink ? "true" : "false")
}

function parseAppSettings(raw: string): AppSettings | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    if (parsed.version !== 1) {
      return null
    }

    return {
      version: 1,
      theme: isAppTheme(parsed.theme) ? parsed.theme : "system",
      tabSize: isAppTabSize(parsed.tabSize) ? parsed.tabSize : 4,
      pasteClipboardUrlOnLink: parsed.pasteClipboardUrlOnLink === true,
    }
  } catch {
    return null
  }
}

let settingsWriteQueue: Promise<void> = Promise.resolve()
let lastSavedContent: string | null = null

export async function loadAppSettings(): Promise<AppSettings | null> {
  if (!isTauriRuntime()) {
    return null
  }

  const raw = await invoke<string | null>("load_app_settings")
  if (!raw) {
    return null
  }

  const parsed = parseAppSettings(raw)
  if (!parsed) {
    console.warn("[RadishMD][settings] ignored invalid settings file")
    return null
  }

  writeSettingsCache(parsed)
  lastSavedContent = serializeAppSettings(parsed)
  return parsed
}

export async function saveAppSettings(settings: AppSettings) {
  writeSettingsCache(settings)
  if (!isTauriRuntime()) {
    lastSavedContent = serializeAppSettings(settings)
    return
  }

  const content = serializeAppSettings(settings)
  const write = settingsWriteQueue.catch(() => undefined).then(async () => {
    if (content === lastSavedContent) {
      return
    }

    await invoke("save_app_settings", { content })
    lastSavedContent = content
  })
  settingsWriteQueue = write
  await write
}
