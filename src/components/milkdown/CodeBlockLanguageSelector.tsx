import type { ActiveCodeBlockState } from './types'
import { CODE_LANGUAGES, getLanguageLabel } from './codeBlockLanguages'

interface CodeBlockLanguageSelectorProps {
  activeCodeBlock: ActiveCodeBlockState
  languageSearch: string
  selectedIndex: number
  onLanguageSearchChange: (value: string) => void
  onSelectedIndexChange: (value: number) => void
  onSelectLanguage: (language: string) => void
  onClose: () => void
}

export function CodeBlockLanguageSelector({
  activeCodeBlock,
  languageSearch,
  selectedIndex,
  onLanguageSearchChange,
  onSelectedIndexChange,
  onSelectLanguage,
  onClose,
}: CodeBlockLanguageSelectorProps) {
  const normalizedSearch = languageSearch.toLowerCase()
  const filteredLanguages = CODE_LANGUAGES.filter((language) => {
    return (
      language.label.toLowerCase().includes(normalizedSearch) ||
      language.value.toLowerCase().includes(normalizedSearch)
    )
  })

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      onSelectedIndexChange(Math.min(selectedIndex + 1, filteredLanguages.length - 1))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      onSelectedIndexChange(Math.max(selectedIndex - 1, 0))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      if (filteredLanguages.length > 0) {
        onSelectLanguage(filteredLanguages[selectedIndex].value)
      }
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: activeCodeBlock.rect.left,
        top: activeCodeBlock.rect.bottom + 4,
        zIndex: 1000,
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
      }}
      className="w-[200px] rounded-md border shadow-lg"
    >
      <div className="p-2">
        <input
          type="text"
          placeholder={getLanguageLabel(activeCodeBlock.lang)}
          value={languageSearch}
          onChange={(event) => {
            onLanguageSearchChange(event.target.value)
            onSelectedIndexChange(0)
          }}
          onKeyDown={handleKeyDown}
          className="w-full rounded-md border bg-transparent px-2 py-1.5 text-xs outline-none focus:border-blue-500"
          autoFocus
        />
      </div>

      {languageSearch && (
        <div className="max-h-[200px] overflow-y-auto border-t">
          {filteredLanguages.map((language, index) => (
            <button
              key={language.value}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 ${
                index === selectedIndex
                  ? 'bg-blue-100 dark:bg-blue-800'
                  : activeCodeBlock.lang === language.value
                    ? 'bg-gray-100 dark:bg-gray-700'
                    : ''
              }`}
              onClick={() => onSelectLanguage(language.value)}
              onMouseEnter={() => onSelectedIndexChange(index)}
            >
              {activeCodeBlock.lang === language.value && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {language.label}
            </button>
          ))}

          {filteredLanguages.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500">未找到匹配的语言</div>
          )}
        </div>
      )}
    </div>
  )
}