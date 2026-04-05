# Split 模式百分比同步误差分析

## 一、观测现象

用户测试发现，在使用百分比同步方法后，滚动误差呈现以下规律：

```
滚动位置:     顶部        中部        底部
误差分布:   0 → 0.1 → 0.3 → 0.1 → 0    0 → 0.1 → 0.3 → 0.1 → 0
                       |__________________|      | __________________|
                                      第一波峰                                  第二波峰
```

**核心特征：**
- 文件分为上下两部分
- 中间部分同步非常准确
- 两端误差较大，呈现正态分布曲线
- 整体呈现**两个波峰**的正态分布模式

## 二、误差成因分析

### 2.1 百分比同步的基本原理

```typescript
sourcePercent = source.scrollTop / (source.scrollHeight - source.clientHeight)
targetPercent = sourcePercent
target.scrollTop = targetPercent * (targetScrollHeight - target.clientHeight)
```

这个公式假设两个容器的 `scrollHeight` 在任意时刻都是**准确且稳定**的。

### 2.2 问题根源：scrollHeight 的动态变化

导致误差的正态分布模式，最可能的原因是**内容渲染的时序差异**：

#### 可能性 A：Markdown 渲染的异步特性

```typescript
const deferredContent = useDeferredValue(content)
```

`useDeferredValue` 意味着预览区的渲染是**延迟**的。当用户滚动时：

1. textarea 的 `scrollHeight` 是即时准确的（原生表单控件）
2. preview 的 `scrollHeight` 可能是**旧内容**计算的结果

#### 可能性 B：图片加载导致的高度突变

当滚动到特定位置（如含有图片的段落）时：
- 图片开始加载 → preview 的 `scrollHeight` 突然增大
- 但 `scrollTop` 仍按旧高度计算百分比
- 导致同步位置产生跳变

#### 可能性 C：代码块的语法高亮延迟

CodeMirror 或预览区的代码块在渲染时：
- 初始状态：无高亮，等宽字体
- 高亮后：字体宽度变化，行数可能变化

```
编辑区代码块: "abc" (等宽，3字符宽度)
预览区代码块: "a⚡b⚡c⚡" (高亮后，实际渲染宽度不同)
```

### 2.3 为什么是"两个正态分布"？

```
|_________|
|    1    |  ← 第一段高误差区域（可能含代码块/图片）
|_________|
|         |
|    0    |  ← 中间区域（纯文本段落）
|         |
|_________|
|    2    |  ← 第二段高误差区域（可能含代码块/图片）
|_________|
```

推测文件结构：
- **第一段**：包含标题、列表、代码块 A
- **第二段**：包含表格、引用、代码块 B
- **中间段**：纯文本段落

当预览区渲染这些特殊元素时，高度计算出现偏差；而纯文本段落渲染稳定，所以中间区域准确。

## 三、误差传播模型

```
时刻 T0 (滚动前):
  textarea.scrollHeight = 1000
  preview.scrollHeight = 1200  (旧内容，含代码块未高亮)
  计算百分比: 50% → target.scrollTop = 600

时刻 T1 (滚动触发，代码块高亮完成):
  preview.scrollHeight = 1300  (高亮后高度增加)
  但 scrollTop 已经设为 600 (按旧高度计算)
  实际百分比 = 600 / (1300 - viewHeight) = 600 / 900 ≈ 67%
  预期百分比 = 50%
  误差 = 17%
```

## 四、解决方案建议

### 方案 1：等待渲染稳定后计算

```typescript
const syncScrollByPercent = useCallback((source, target, targetType) => {
  // 强制触发布局计算，确保 scrollHeight 准确
  target.offsetHeight; // 强制 reflow

  // 或者使用 requestAnimationFrame 等待下一帧
  requestAnimationFrame(() => {
    // 此时 scrollHeight 应已稳定
    const sourcePercent = source.scrollTop / (source.scrollHeight - source.clientHeight)
    target.scrollTop = sourcePercent * (target.scrollHeight - target.clientHeight)
  })
})
```

### 方案 2：持续监听高度变化并修正

```typescript
// 使用 ResizeObserver 监听 preview 高度变化
useEffect(() => {
  const observer = new ResizeObserver((entries) => {
    // 当 preview 高度变化时，重新同步
    syncScrollByPercent(textareaRef.current, previewRef.current, "preview")
  })
  if (previewRef.current) {
    observer.observe(previewRef.current)
  }
  return () => observer.disconnect()
}, [])
```

### 方案 3：基于内容块的锚点同步

不再依赖 scrollHeight，而是将内容分为多个"锚点块"：
- 编辑区和预览区都解析为相同顺序的块
- 滚动时找到当前可见块对应的目标区块
- 将目标区块滚动到相同位置

### 方案 4：预渲染+双缓冲

在内容变化时：
1. 先在隐藏的 DOM 中渲染新内容
2. 计算准确的 scrollHeight
3. 然后才显示新内容并同步滚动位置

## 五、进一步验证建议

### 5.1 添加诊断日志

```typescript
const syncScrollByPercent = useCallback((source, target, targetType) => {
  const sourcePercent = source.scrollTop / (source.scrollHeight - source.clientHeight)
  console.log({
    sourceScrollHeight: source.scrollHeight,
    targetScrollHeight: target.scrollHeight,
    sourcePercent,
    targetScrollTop: target.scrollTop,
    timestamp: performance.now()
  })
  // ... 同步逻辑
})
```

### 5.2 测试文档结构

请提供测试文档的大纲结构，确认是否包含：
- [ ] 多个代码块（不同语言）
- [ ] 图片
- [ ] 表格
- [ ] 嵌套列表
- [ ] 大段连续文本

### 5.3 观察时机

分别在以下时机测试，观察误差位置是否变化：
1. 首次打开文件（图片未加载）
2. 刷新后立即测试（缓存已加载）
3. 禁用网络后测试（排除图片干扰）

---

*文档生成时间：2026-04-06*
