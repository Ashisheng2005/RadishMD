import type { ToolbarMenuSection } from './types'

export const TOOLBAR_MENU_SECTIONS: ToolbarMenuSection[] = [
  {
    label: '文件',
    nodes: [
      { kind: 'item', label: '新建文件', action: 'createNewFile', shortcut: 'Ctrl+N' },
      { kind: 'item', label: '打开文件', action: 'openFile', shortcut: 'Ctrl+O' },
      { kind: 'separator' },
      { kind: 'item', label: '保存', action: 'saveFile', shortcut: 'Ctrl+S' },
      { kind: 'item', label: '另存为', action: 'saveFileAs', shortcut: 'Ctrl+Shift+S' },
      { kind: 'separator' },
      { kind: 'item', label: '关闭', action: 'createNewFile', disabled: true },
    ],
  },
  {
    label: '编辑',
    nodes: [
      { kind: 'item', label: '撤销', action: 'undo', shortcut: 'Ctrl+Z' },
      { kind: 'item', label: '重做', action: 'redo', shortcut: 'Ctrl+Y' },
      { kind: 'separator' },
      { kind: 'item', label: '剪切', action: 'cut', shortcut: 'Ctrl+X' },
      { kind: 'item', label: '复制', action: 'copy', shortcut: 'Ctrl+C' },
      { kind: 'item', label: '粘贴', action: 'paste', shortcut: 'Ctrl+V' },
      { kind: 'separator' },
      { kind: 'item', label: '全选', action: 'selectAll', shortcut: 'Ctrl+A' },
      { kind: 'separator' },
      { kind: 'item', label: '查找', action: 'createNewFile', shortcut: 'Ctrl+F', disabled: true },
      { kind: 'item', label: '替换', action: 'createNewFile', shortcut: 'Ctrl+H', disabled: true },
    ],
  },
  {
    label: '视图',
    nodes: [
      { kind: 'item', label: '源码模式', action: 'createNewFile', disabled: true },
      { kind: 'item', label: '专注模式', action: 'createNewFile', disabled: true },
      { kind: 'item', label: '打字机模式', action: 'createNewFile', disabled: true },
      { kind: 'separator' },
      { kind: 'item', label: '侧边栏大纲', action: 'createNewFile', disabled: true },
    ],
  },
  {
    label: '格式',
    nodes: [
      {
        kind: 'group',
        label: '标题',
        items: [
          { kind: 'item', label: '一级标题', action: 'heading', shortcut: 'Ctrl+1', level: 1 },
          { kind: 'item', label: '二级标题', action: 'heading', shortcut: 'Ctrl+2', level: 2 },
          { kind: 'item', label: '三级标题', action: 'heading', shortcut: 'Ctrl+3', level: 3 },
          { kind: 'item', label: '四级标题', action: 'heading', shortcut: 'Ctrl+4', level: 4 },
          { kind: 'item', label: '五级标题', action: 'heading', shortcut: 'Ctrl+5', level: 5 },
          { kind: 'item', label: '六级标题', action: 'heading', shortcut: 'Ctrl+6', level: 6 },
        ],
      },
      { kind: 'separator' },
      { kind: 'item', label: '粗体', action: 'bold', shortcut: 'Ctrl+B' },
      { kind: 'item', label: '斜体', action: 'italic', shortcut: 'Ctrl+I' },
      { kind: 'item', label: '删除线', action: 'strikeThrough', shortcut: 'Alt+Shift+5' },
      { kind: 'separator' },
      { kind: 'item', label: '行内代码', action: 'code', shortcut: 'Ctrl+`' },
      { kind: 'item', label: '代码块', action: 'codeBlock', shortcut: 'Ctrl+Shift+M' },
      { kind: 'separator' },
      { kind: 'item', label: '有序列表', action: 'orderedList', shortcut: 'Ctrl+Shift+7' },
      { kind: 'item', label: '无序列表', action: 'unorderedList', shortcut: 'Ctrl+Shift+8' },
      { kind: 'item', label: '引用', action: 'blockquote', shortcut: 'Ctrl+Shift+.' },
      { kind: 'separator' },
      { kind: 'item', label: '链接', action: 'link', shortcut: 'Ctrl+K' },
      { kind: 'item', label: '图片', action: 'image', shortcut: 'Ctrl+Shift+K' },
      { kind: 'separator' },
      { kind: 'item', label: '水平线', action: 'horizontalRule', shortcut: 'Ctrl+Shift+-' },
      { kind: 'item', label: '表格', action: 'table' },
      { kind: 'separator' },
      {
        kind: 'group',
        label: '数学公式',
        items: [
          { kind: 'item', label: '行内公式', action: 'mathInline', shortcut: 'Ctrl+Shift+P' },
          { kind: 'item', label: '块级公式', action: 'mathBlock', shortcut: 'Ctrl+Shift+Enter' },
        ],
      },
    ],
  },
  {
    label: '主题',
    nodes: [
      { kind: 'item', label: '浅色主题', action: 'createNewFile', disabled: true },
      { kind: 'item', label: 'Nord (蓝灰)', action: 'createNewFile', disabled: true },
      { kind: 'item', label: 'Dark (深灰)', action: 'createNewFile', disabled: true },
      { kind: 'item', label: 'Warm (暖灰)', action: 'createNewFile', disabled: true },
    ],
  },
  {
    label: '帮助',
    nodes: [
      { kind: 'item', label: '关于', action: 'openAbout' },
      { kind: 'item', label: '快捷键列表', action: 'openShortcuts' },
      { kind: 'separator' },
      { kind: 'item', label: '主题设置', action: 'createNewFile', disabled: true },
    ],
  },
]