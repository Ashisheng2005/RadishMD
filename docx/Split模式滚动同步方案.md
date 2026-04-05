# 从 Delta 到 Percentage：Split 编辑器滚动同步方案演进

## 一、问题背景

在 Markdown 编辑器中，Split 模式（左侧编辑、右侧预览）是一种常见的交互形式。用户期望当滚动编辑区时，预览区能够同步滚动，反之亦然。然而实现这一功能远比想象中复杂。

我在开发 [RadishMD](https://github.com/Ashisheng2005/RadishMD) 编辑器时，遇到了滚动同步的精度问题：预览区总是滚动的比编辑区"快"或"慢"，视觉上无法对齐同一段内容。

## 二、问题分析

### 2.1 核心挑战：内容结构差异

编辑区和预览区的内容呈现方式存在本质差异：

| 维度 | 编辑区 (Textarea) | 预览区 (HTML) |
|------|-------------------|---------------|
| 内容形式 | 纯文本，等宽字体 | HTML 渲染，富文本 |
| 行高计算 | 固定行高 | 依赖 CSS 样式 |
| 代码块 | 横向滚动 | 自动换行 |
| 图片 | 不显示 | 异步加载，高度变化 |

这种结构差异导致相同的 `scrollTop` 增量在不同区域产生的视觉位移完全不同。

### 2.2 初次尝试：Delta-Based 同步

最初的实现思路很直接：同步滚动增量。

```typescript
const sourceDelta = source.scrollTop - lastSourceScrollTop
const newScrollTop = target.scrollTop + sourceDelta * ratio
```

为了适应两侧不同的内容高度，引入动态比率：

```typescript
const heightRatio = previewScrollable / editorScrollable
ratio = clamp(heightRatio * 0.85, 0.68, 0.82)
```

**问题**：这个方法需要不断调试 0.85 这个经验系数，而且当文档内容变化时（尤其是代码块、表格多的文档），比率计算总是"差一点"。

### 2.3 升级方案：Percentage-Based 同步

既然同步"滚动距离"不可行，那就同步"视觉位置"：

```typescript
// 计算源元素的滚动百分比
const sourcePercent = source.scrollTop / (source.scrollHeight - source.clientHeight)

// 将百分比应用到目标元素
target.scrollTop = sourcePercent * (targetScrollHeight - target.clientHeight)
```

这种方法理论上更优雅，因为百分比直接对应视觉位置。

**新问题**：测试发现误差呈现正态分布规律——文档中间部分非常准确，但两端误差较大，整体呈现"两个波峰"。

### 2.4 根因定位：scrollHeight 的时序问题

```
滚动位置:     顶部        中部        底部
误差分布:   0 → 0.1 → 0.3 → 0.1 → 0    0 → 0.1 → 0.3 → 0.1 → 0
           |__________|  |__________|
              第一波峰      第二波峰
```

误差分布暗示了一个规律：文档中某些区域的渲染是不稳定的。

**关键发现**：预览区使用 `useDeferredValue` 延迟渲染。当用户滚动到特定位置时：

1. textarea 的 `scrollHeight` 是即时准确的
2. preview 的 `scrollHeight` 可能还是**旧内容**计算的结果
3. 当特殊元素（代码块、表格、图片）完成渲染后，高度突然变化
4. 百分比同步基于旧高度计算，导致错位

## 三、解决方案：ResizeObserver + Percentage 同步

### 3.1 核心思路

监听预览区的高度变化，在渲染完成后重新同步滚动位置：

```typescript
// 百分比同步函数
const syncScrollByPercent = (source, target) => {
  const sourcePercent = source.scrollTop / (sourceScrollable)
  const targetScrollable = target.scrollHeight - target.clientHeight
  target.scrollTop = sourcePercent * targetScrollable
}

// ResizeObserver 监听高度变化
const observer = new ResizeObserver(() => {
  // 渲染完成后，重新同步
  syncScrollByPercent(textareaRef.current, previewRef.current)
})
```

### 3.2 性能优化

为了避免快速滚动时的过度调用，引入节流机制：

```typescript
const lastSyncTimeRef = useRef(0)
const THROTTLE_MS = 50

const handleResizeSync = () => {
  const now = performance.now()
  if (now - lastSyncTimeRef.current < THROTTLE_MS) {
    // 记录待执行任务，下次执行
    pendingSyncRef.current = { source, target, targetType }
    return
  }
  lastSyncTimeRef.current = now
  syncScrollByPercent(source, target, targetType)
}
```

### 3.3 完整流程

```
用户滚动编辑区
      ↓
textarea scrollTop 变化
      ↓
handleEditorScroll 触发
      ↓
计算百分比 → 同步到 preview.scrollTop
      ↓
preview 渲染（延迟）
      ↓
preview.scrollHeight 变化
      ↓
ResizeObserver 触发
      ↓
重新计算百分比 → 修正 preview.scrollTop
```

## 四、效果对比

| 方案 | 中间区域 | 两端区域 | 代码块文档 | 纯文本文档 |
|------|---------|---------|-----------|-----------|
| Delta + 动态比率 | 良好 | 偏差较大 | 不稳定 | 良好 |
| Percentage | 非常准确 | 正态分布误差 | 仍有误差 | 完美 |
| Percentage + ResizeObserver | 非常准确 | 非常准确 | 稳定 | 完美 |

## 五、代码实现要点

### 5.1 关键变量

```typescript
const isSyncingScrollRef = useRef(false)   // 防止同步循环
const ignoreEditorScrollUntilRef = useRef(0)  // 180ms 滚动抑制
const lastSyncTimeRef = useRef(0)          // 节流时间戳
const pendingSyncRef = useRef(null)         // 待执行的同步任务
```

### 5.2 抑制机制

双向同步（编辑区→预览区，预览区→编辑区）容易形成死循环。通过 `isSyncingScrollRef` 标志和 `suppressScroll` 函数（180ms 忽略期）来防止。

### 5.3 useDeferredValue

```typescript
const deferredContent = useDeferredValue(content)
```

这是 React 19 的特性，允许内容渲染降低优先级，保证输入流畅。配合 ResizeObserver，可以在渲染完成后修正同步。

## 六、总结

滚动同步看似简单，实则涉及：

1. **内容差异**：textarea 和 HTML 的渲染模型完全不同
2. **时序问题**：异步渲染导致的高度计算不准确
3. **性能权衡**：同步精度 vs 渲染性能

最终方案的核心洞见是：**与其试图预测同步比例，不如在渲染稳定后主动修正**。ResizeObserver 正是这个"稳定后回调"的完美机制。

---

*RadishMD 是一个正在积极开发中的桌面 Markdown 编辑器，欢迎 Star 和贡献。*
