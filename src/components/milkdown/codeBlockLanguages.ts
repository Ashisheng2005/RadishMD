import type { LanguageOption } from './types'

export const CODE_LANGUAGES: LanguageOption[] = [
  { value: '', label: '无语言' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
  { value: 'xml', label: 'XML' },
  { value: 'csharp', label: 'C#' },
  { value: 'php', label: 'PHP' },
]

export const getLanguageLabel = (languageValue?: string) => {
  if (typeof languageValue !== 'string') return '无语言'

  const matchedLabel = CODE_LANGUAGES.find((language) => language.value === languageValue)?.label
  return matchedLabel ?? languageValue ?? '无语言'
}