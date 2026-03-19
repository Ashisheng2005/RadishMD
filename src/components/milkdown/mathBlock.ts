import { InputRule } from '@milkdown/prose/inputrules'
import { $inputRule, $nodeSchema, $view } from '@milkdown/utils'
import katex from 'katex'

export const customMathBlockSchema = $nodeSchema('math_block', () => ({
  content: '',
  group: 'block',
  marks: '',
  selectable: false,
  atom: true,
  isolating: true,
  defining: true,
  attrs: {
    value: {
      default: '',
    },
  },
  parseDOM: [
    {
      tag: 'div[data-type="math_block"]',
      getAttrs: (dom) => {
        return { value: (dom as HTMLElement).dataset.value ?? '' }
      },
    },
  ],
  toDOM: (node) => {
    const value = node.attrs.value || ''

    return [
      'div',
      {
        'data-type': 'math_block',
        'data-value': value,
        class: 'math-block',
      },
      ['div', { class: 'math-block-preview' }, value],
    ]
  },
  parseMarkdown: {
    match: ({ type }) => type === 'math',
    runner: (state, node, type) => {
      const value = String(node.value ?? '')
      state.openNode(type, { value })
      state.closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_block',
    runner: (state, node) => {
      state.addNode('math', undefined, node.attrs.value || '')
    },
  },
}))

const createMathBlockNodeView = () => {
  return (node: any, view: any, getPos: any): any => {
    const container = document.createElement('div')
    container.className = 'math-block'
    container.dataset.type = 'math_block'
    container.contentEditable = 'false'

    const editorWrapper = document.createElement('div')
    editorWrapper.className = 'math-block-editor'
    editorWrapper.contentEditable = 'false'

    const textarea = document.createElement('textarea')
    textarea.className = 'math-block-content'
    textarea.spellcheck = false

    const preview = document.createElement('div')
    preview.className = 'math-block-preview'
    preview.contentEditable = 'false'

    editorWrapper.appendChild(textarea)
    container.appendChild(editorWrapper)
    container.appendChild(preview)

    let value = String(node.attrs.value ?? '')
    let isEditing = false
    let isUpdatingFromView = false

    const getPosition = () => {
      const position = typeof getPos === 'function' ? getPos() : getPos
      return typeof position === 'number' ? position : null
    }

    const renderPreview = () => {
      const content = value.trim()

      if (!content) {
        preview.innerHTML = '<span class="math-placeholder">输入公式内容</span>'
        return
      }

      try {
        preview.innerHTML = katex.renderToString(content, {
          displayMode: true,
          throwOnError: false,
        })
      } catch {
        preview.textContent = content
      }
    }

    const showEditor = () => {
      isEditing = true
      container.classList.add('math-block--editing')
      textarea.style.display = 'block'
      preview.style.display = 'none'
    }

    const showPreview = () => {
      isEditing = false
      container.classList.remove('math-block--editing')
      textarea.style.display = 'none'
      preview.style.display = 'block'
      renderPreview()
    }

    const updateValue = (nextValue: string) => {
      value = nextValue.replace(/\u200b/g, '')
      renderPreview()

      const position = getPosition()
      if (position === null) return

      const currentNode = view.state.doc.nodeAt(position)
      if (!currentNode || currentNode.attrs.value === value) return

      const transaction = view.state.tr.setNodeMarkup(position, undefined, {
        ...currentNode.attrs,
        value,
      })
      view.dispatch(transaction)
    }

    const focusTextarea = () => {
      textarea.focus()
      const length = textarea.value.length
      textarea.setSelectionRange(length, length)
    }

    textarea.value = value
    textarea.placeholder = '输入 $...$ 之间的公式内容'
    renderPreview()
    showPreview()

    textarea.addEventListener('input', () => {
      if (isUpdatingFromView) return
      updateValue(textarea.value)
    })

    textarea.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      window.setTimeout(() => focusTextarea(), 0)
    })

    textarea.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
    })

    textarea.addEventListener('focus', () => {
      showEditor()
    })

    textarea.addEventListener('blur', () => {
      showPreview()
    })

    textarea.addEventListener('keydown', (event) => {
      const isEmpty = textarea.value.trim().length === 0

      if (isEmpty && (event.key === 'Backspace' || event.key === 'Delete')) {
        event.preventDefault()

        const position = getPosition()
        if (position === null) return

        const currentNode = view.state.doc.nodeAt(position)
        if (!currentNode) return

        view.dispatch(view.state.tr.delete(position, position + currentNode.nodeSize).scrollIntoView())
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        textarea.blur()
      }
    })

    preview.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      showEditor()
      focusTextarea()
    })

    preview.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      showEditor()
      window.setTimeout(() => focusTextarea(), 0)
    })

    return {
      dom: container,

      stopEvent: () => true,

      ignoreMutation: () => true,

      selectNode: () => {
        showEditor()
        focusTextarea()
      },

      deselectNode: () => {
        showPreview()
      },

      update: (newNode: any) => {
        if (newNode.type.name !== 'math_block') return false

        node = newNode
        const nextValue = String(newNode.attrs.value ?? '')

        if (nextValue !== value) {
          value = nextValue
          isUpdatingFromView = true
          textarea.value = value
          isUpdatingFromView = false
        }

        if (isEditing) {
          textarea.style.display = 'block'
          preview.style.display = 'none'
        } else {
          showPreview()
        }

        return true
      },

      destroy: () => {
        container.remove()
      },
    }
  }
}

export const customMathBlockView = $view(customMathBlockSchema as any, () => createMathBlockNodeView())

export const customMathBlockInputRule = $inputRule((ctx) => {
  const mathType = customMathBlockSchema.type(ctx)

  return new InputRule(/^\$\$([^$]*)\$\$\s?$/, (state, match, start, end) => {
    if (!mathType) return null

    const content = String(match[1] ?? '')
    const transaction = state.tr.delete(start, end)
    const node = mathType.create({ value: content })

    return transaction.replaceWith(start, start, node)
  })
})