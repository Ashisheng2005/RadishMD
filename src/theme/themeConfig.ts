export type ThemeType = string

export interface ThemeOption {
  value: string
  label: string
  source: 'builtin' | 'plugin'
  description?: string
}

export interface ThemePluginManifest {
  id: string
  name: string
  themes: ThemeOption[]
  cssPath?: string
  description?: string
}

export const BUILTIN_THEME_OPTIONS: ThemeOption[] = [
  { value: 'light', label: '浅色主题', source: 'builtin' },
  { value: 'nord', label: 'Nord (蓝灰)', source: 'builtin' },
  { value: 'dark', label: 'Dark (深灰)', source: 'builtin' },
  { value: 'warm', label: 'Warm (暖灰)', source: 'builtin' },
]

export const getThemeOptions = (pluginThemes: ThemeOption[] = []) => {
  return [...BUILTIN_THEME_OPTIONS, ...pluginThemes]
}
