export const TOOLBAR_ABOUT = {
  title: '关于 Markdown 编辑器',
  description: '一个基于 Tauri、React 和 Milkdown 的 WYSIWYG Markdown 编辑器。',
  version: '0.1.0',
  techStack: 'Tauri 2.x + React 19 + Milkdown + Tailwind CSS',
}

export const SHORTCUT_GROUPS = [
  { title: '文件', items: [['新建文件', 'Ctrl+N'], ['打开文件', 'Ctrl+O'], ['保存', 'Ctrl+S'], ['另存为', 'Ctrl+Shift+S']] },
  { title: '编辑', items: [['撤销', 'Ctrl+Z'], ['重做', 'Ctrl+Y']] },
  { title: '标题', items: [['一级标题', 'Ctrl+1'], ['二级标题', 'Ctrl+2'], ['三级标题', 'Ctrl+3'], ['四级标题', 'Ctrl+4'], ['五级标题', 'Ctrl+5'], ['六级标题', 'Ctrl+6']] },
  { title: '格式', items: [['粗体', 'Ctrl+B'], ['斜体', 'Ctrl+I'], ['删除线', 'Alt+Shift+5'], ['行内代码', 'Ctrl+`'], ['代码块', 'Ctrl+Shift+M']] },
  { title: '列表与引用', items: [['有序列表', 'Ctrl+Shift+7'], ['无序列表', 'Ctrl+Shift+8'], ['引用', 'Ctrl+Shift+.']] },
  { title: '插入', items: [['链接', 'Ctrl+K'], ['图片', 'Ctrl+Shift+K'], ['水平线', 'Ctrl+Shift+-']] },
  { title: '数学公式', items: [['行内公式', 'Ctrl+Shift+P'], ['块级公式', 'Ctrl+Shift+Enter']] },
] as const