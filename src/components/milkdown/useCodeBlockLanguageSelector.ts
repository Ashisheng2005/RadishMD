import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { ActiveCodeBlockState } from './types'

interface UseCodeBlockLanguageSelectorOptions {
  editorViewRef: RefObject<any>
  containerRef: RefObject<HTMLDivElement | null>
}

export const useCodeBlockLanguageSelector = ({ editorViewRef, containerRef }: UseCodeBlockLanguageSelectorOptions) => {
  const [activeCodeBlock, setActiveCodeBlock] = useState<ActiveCodeBlockState | null>(null)
  const [languageSearch, setLanguageSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const activeCodeBlockRef = useRef<ActiveCodeBlockState | null>(null)
  const isClosingRef = useRef(false)
  const hasSelectedLanguageRef = useRef(false)
  const lastCreatedCodeBlockRef = useRef<number | null>(null)

  useEffect(() => {
    activeCodeBlockRef.current = activeCodeBlock
  }, [activeCodeBlock])

  const closeLanguageSelector = (keepClosed = false) => {
    isClosingRef.current = true

    if (keepClosed) {
      hasSelectedLanguageRef.current = true
    }

    lastCreatedCodeBlockRef.current = null
    setLanguageSearch('')
    setSelectedIndex(0)
    setActiveCodeBlock(null)

    window.setTimeout(() => {
      isClosingRef.current = false
    }, 100)
  }

  const refreshCodeBlockState = () => {
    const view = editorViewRef.current
    const container = containerRef.current

    if (!view || !container) return

    const { state } = view
    const { $from } = state.selection

    if ($from.parent.type.name !== 'code_block') {
      closeLanguageSelector()
      return
    }

    const pos = $from.before($from.depth)
    const node = state.doc.nodeAt(pos)
    if (!node || node.type.name !== 'code_block') return

    try {
      const domNode = view.nodeDOM(pos) as HTMLElement | null
      if (domNode) {
        setActiveCodeBlock({
          pos,
          lang: node.attrs.language || '',
          rect: domNode.getBoundingClientRect(),
        })
        setSelectedIndex(0)
        return
      }
    } catch {
      // 当 DOM 还未就绪时，改用后备方案定位
    }

    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      const rangeContainer = range.commonAncestorContainer as HTMLElement
      const codeBlockElement = rangeContainer.closest?.('pre') || rangeContainer.parentElement?.closest?.('pre')

      if (codeBlockElement) {
        setActiveCodeBlock({
          pos,
          lang: node.attrs.language || '',
          rect: codeBlockElement.getBoundingClientRect(),
        })
        setSelectedIndex(0)
        return
      }
    }

    setActiveCodeBlock({
      pos,
      lang: node.attrs.language || '',
      rect: container.getBoundingClientRect(),
    })
    setSelectedIndex(0)
  }

  const markNewCodeBlock = (pos: number) => {
    lastCreatedCodeBlockRef.current = pos
    hasSelectedLanguageRef.current = false
  }

  const updateCodeBlockLanguage = (language: string) => {
    const view = editorViewRef.current
    const activeBlock = activeCodeBlockRef.current

    if (!view || !activeBlock) return

    const { state, dispatch } = view
    const node = state.doc.nodeAt(activeBlock.pos)
    if (!node || node.type.name !== 'code_block') return

    view.focus()

    const transaction = state.tr.setNodeMarkup(activeBlock.pos, undefined, {
      ...node.attrs,
      language: language || '',
    })

    dispatch(transaction)
    closeLanguageSelector(true)
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleSelectionChange = () => {
      if (isClosingRef.current || hasSelectedLanguageRef.current) return

      const view = editorViewRef.current
      if (!view) return

      const { state } = view
      const { $from } = state.selection

      if ($from.parent.type.name === 'code_block') {
        const pos = $from.before($from.depth)
        if (pos !== lastCreatedCodeBlockRef.current) return
      }

      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return

      const range = selection.getRangeAt(0)
      if (!container.contains(range.commonAncestorContainer)) return

      refreshCodeBlockState()
    }

    const handleEditorClick = () => {
      if (isClosingRef.current) return

      const view = editorViewRef.current
      if (!view) return

      const { state } = view
      const { $from } = state.selection

      if ($from.parent.type.name !== 'code_block') return

      const pos = $from.before($from.depth)
      if (pos !== lastCreatedCodeBlockRef.current) return

      hasSelectedLanguageRef.current = false
      refreshCodeBlockState()
      lastCreatedCodeBlockRef.current = null
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && activeCodeBlockRef.current) {
        closeLanguageSelector()
      }
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    container.addEventListener('click', handleEditorClick)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      container.removeEventListener('click', handleEditorClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [editorViewRef, containerRef])

  return {
    activeCodeBlock,
    languageSearch,
    selectedIndex,
    setLanguageSearch,
    setSelectedIndex,
    closeLanguageSelector,
    refreshCodeBlockState,
    updateCodeBlockLanguage,
    markNewCodeBlock,
  }
}