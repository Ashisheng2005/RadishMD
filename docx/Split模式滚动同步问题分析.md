# Split 模式滚动同步问题分析

## 一、问题描述

在 Split 编辑模式下，编辑区（textarea）和预览区的滚动同步存在偏差：
- 预览区滚动速度明显快于编辑区
- 相同滚动量下，预览区内容位置与编辑区不对应

## 二、核心挑战

编辑区和预览区的内容呈现方式存在本质差异：

| 维度 | 编辑区 (Textarea) | 预览区 (HTML) |
|------|-------------------|---------------|
| 内容形式 | 纯文本，等宽字体 | HTML 渲染，可变高度 |
| 行高计算 | 固定行高（1.75rem） | 依赖 CSS 样式和内容 |
| 代码块 | 单行显示，横向滚动 | 多行显示，可能换行 |
| 嵌套元素 | 无 | 有（标题、列表、表格等） |
| 空行 | 固定高度 | 折叠或合并 |

这种结构差异导致相同的 `scrollTop` 增量在不同区域产生的视觉位移完全不同。

## 三、当前算法说明

### 3.1 核心技术：增量式滚动同步 (Delta-based Scroll Sync)

```typescript
// 伪代码
sourceDelta = source.scrollTop - lastSourceScrollTop
newScrollTop = target.scrollTop + sourceDelta * dynamicRatio
```

**核心思想**：不同步绝对位置，而是同步滚动增量，避免累积误差。

### 3.2 动态比率计算

```typescript
const editorScrollable = textarea.scrollHeight - textarea.clientHeight
const previewScrollable = preview.scrollHeight - preview.clientHeight
const heightRatio = previewScrollable / editorScrollable
dynamicRatio = clamp(heightRatio * 0.85, 0.68, 0.82)
```

**公式解读**：
- `heightRatio` = 预览区可滚动高度 / 编辑区可滚动高度
- 乘以 `0.85` 是为了减缓预览区滚动速度
- clamp 到 `[0.68, 0.82]` 区间是为了稳定性

### 3.3 防抖机制

```typescript
// 滚动事件抑制，防止死循环
suppressScroll(target, 180ms)
// 180ms 内忽略来自 target 的滚动事件
```

### 3.4 关键变量

| 变量 | 说明 |
|------|------|
| `lastEditorScrollTopRef` | 编辑区上次滚动位置 |
| `lastPreviewScrollTopRef` | 预览区上次滚动位置 |
| `dynamicRatioRef` | 动态滚动比率 |
| `isSyncingScrollRef` | 防止同步循环的标志 |

## 四、问题根因分析

### 4.1 比率计算的问题

当前公式 `heightRatio * 0.85` 假设预览区总是比编辑区需要更多的滚动距离来同步。但这个假设并不总是成立：

**场景 1：代码块多**
- 编辑区：代码块每行等高
- 预览区：代码块行高更大（语法高亮、边框等）
- 结果：`previewScrollable < editorScrollable`，`heightRatio < 1`
- 后果：预览区滚动被过度减速

**场景 2：列表嵌套深**
- 编辑区：嵌套列表仅多一个字符宽度
- 预览区：嵌套列表需要额外缩进空间
- 结果：`previewScrollable > editorScrollable`，`heightRatio > 1`
- 后果：预览区滚动被加速

### 4.2 视觉位移的不对应

即使 `scrollTop` 增量相同，由于内容结构差异：
- 预览区的"一行"可能包含多个编辑区的行
- 编辑区的"一行"在预览区可能被拆分为多行
- 导致相同滚动量下，两边看到的不是同一段内容

## 五、算法验证场景

### 测试文档建议

```markdown
# 标题 1
内容...

## 标题 2
内容...

### 标题 3
```代码块第一行
代码块第二行
代码块第三行
```
> 引用块
> 多行引用

- 列表项 1
  - 嵌套列表
    - 深层嵌套
- 列表项 2

| 表格 | 表头 |
|------|------|
| 单元格 | 内容 |

段落文本...
```

### 验证方法

1. 在编辑区滚动，找到特定内容位置 X
2. 记录此时预览区显示的内容是否为同一位置 X
3. 从预览区反向验证

## 六、可能的改进方向

### 方向 1：基于百分比的同步
```typescript
// 使用可滚动百分比而非增量
sourcePercent = source.scrollTop / sourceScrollable
target.scrollTop = targetScrollable * sourcePercent
```

**优点**：直接对应视觉位置
**缺点**：需要额外处理边界情况

### 方向 2：基于内容块的对齐
将编辑区和预览区都解析为"内容块"，按块索引对齐。

**优点**：内容级别精确对应
**缺点**：实现复杂度高

### 方向 3：双比率自适应
分别计算编辑→预览和预览→编辑的比率，取不同场景下的平均值。

### 方向 4：滚动事件插值
使用滚动速度而非滚动量，根据加速度平滑过渡。

---

*文档生成时间：2026-04-06*
