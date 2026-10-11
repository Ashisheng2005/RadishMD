# Markdown 双模式局部刷新实施方案

## 1. 目标

解决长 Markdown 文档编辑时右侧预览整页清空、重新插入和滚动跳动的问题，并避免 WYSIWYG 模式在普通块内编辑时重复解析整篇文档。

本方案遵循轻量化原则：复用现有 chunk 和 Block 模型，不引入新的 Markdown AST、Worker patch 协议或视口虚拟化。

## 2. 模式边界

项目有两条独立的编辑路径，必须分别处理：

| 模式 | 入口 | 当前渲染方式 | 本次策略 |
| --- | --- | --- | --- |
| Split | `SplitEditor` | textarea + `MarkdownRenderer` + Worker | 按 chunk 复用预览 DOM 和后处理结果 |
| WYSIWYG | `WysiwygEditor` | `Block[]` + `Block` 组件 | 普通编辑只更新当前 Block，结构提交和外部更新允许整篇解析 |

PDF 使用 `SplitEditor` 的 `splitViewMode="render"`，不参与 Markdown 局部刷新。

## 3. Split 模式方案

### 3.1 保留现有解析链路

继续使用：

```text
content
  -> useDeferredValue
  -> 220ms debounce
  -> markdown-render-worker
  -> renderMarkdownToHtmlChunks
  -> MarkdownRenderer
```

Worker 仍然解析完整文档。这样可以避免修改现有 Markdown 语法解析器，也不需要新增增量解析协议。

本次优化目标是减少主线程后处理和 DOM 重建。Worker 仍然扫描完整文档，不在本次实现增量 Markdown 解析。

### 3.2 chunk 复用

修改 `src/components/editor/markdown-renderer.tsx`：

1. 删除 `enqueueChunkRender` 中先执行 `setRenderedChunks([])` 的逻辑。
2. 删除首批结果直接替换全部旧 chunks 的逻辑。
3. 增加一个主线程 display chunk 缓存，缓存范围限定为当前文件，缓存内容包括：

   ```ts
   type DisplayChunkCacheEntry = {
     sourceHtml: string
     baseFilePath: string | null
     processedHtml: string
   }
   ```

4. 收到 Worker 返回的 chunk 后，以 `chunk.key` 查找缓存：
   - `key`、`sourceHtml` 和 `baseFilePath` 都相同：直接复用处理后的 HTML；
   - 任一项变化：只处理当前 chunk 的数学公式、图片路径和 Mermaid 占位符。
5. 使用本次 Worker 返回的 `key`、`sourceLine` 和其他元数据生成最新 chunk；缓存只提供处理后的 HTML，不能直接复用旧的 `sourceLine`。
6. 按 Worker 返回的顺序生成最终数组，自动删除已经不存在的 key。
7. React 继续使用 `chunk.key` 作为 key，使未变化的 chunk 保留原有 DOM。

当前 key 已由块内容、类型、语言、文件路径和重复次数生成，适合普通文本编辑。相同内容的重复块在 occurrence 变化时允许局部扩大更新，不增加复杂匹配算法。

### 3.3 批量渲染处理

保留现有 40 个 chunk 一批的调度，但批次只用于分摊主线程后处理工作，不在每个批次中提交部分 DOM：

1. 收到 Worker 结果后创建本次渲染的有序结果集合。
2. 每批处理数学公式、图片路径和 Mermaid 占位符，并写入结果集合。
3. 最后一批完成后，按 Worker 返回顺序一次性调用 `setRenderedChunks`。
4. `requestId` 和 `chunkRenderToken` 继续用于丢弃过期 Worker 结果。

这样可以避免旧 chunk 与新 chunk 在中间状态下顺序混杂，同时 React 仍会依据 `chunk.key` 复用未变化的 DOM。

文件切换时清空当前文件的 display chunk 缓存并进行完整替换；同一文件的普通编辑走局部复用路径。

### 3.4 滚动位置

第一阶段不修改现有滚动同步协议，不引入复杂的源代码行锚点：

1. 删除预览清空逻辑并保留稳定的 React key，使同一文件普通编辑时浏览器自然保留预览滚动位置。
2. 文件切换、新文件导入和 `shouldResetScroll` 触发时，继续执行现有的顶部重置或按文件位置恢复。
3. 保留现有 `ResizeObserver` 百分比同步，不新增 `MarkdownRenderer` 与 `SplitEditor` 的渲染回调。

如果验证后仍存在明显跳动，再单独增加一次性滚动保护；“前部插入大量内容”的精确定位再评估 `data-source-line` 锚点，不作为首批改动。

## 4. WYSIWYG 模式方案

### 4.1 保留 Block 级编辑

WYSIWYG 已经具备 Typora 类似的块模型：

- `WysiwygEditor` 保存 `Block[]`；
- `Block` 使用 `block.id` 作为 React key；
- 输入时 `updateBlock` 只修改当前 Block；
- `Block` 内部有 `localContent`，可以立即响应输入。

不应把 WYSIWYG 改成 Split 模式的 Worker 全文渲染。

### 4.2 消除普通内部更新造成的重复解析

当前流程是：

```text
Block 输入
  -> setBlocks
  -> blocksToMarkdown
  -> setContent
  -> content effect
  -> parseMarkdownToBlocks(content)
```

修改 `src/components/editor/wysiwyg-editor.tsx`：

1. 用待处理内部更新 ref 替代 `isInternalUpdate`，记录序列化内容和所属文件 ID。另用 ref 保存最新 Block 集合，供输入事件同步使用。
2. 集中通过 `commitBlocks(nextBlocks, requiresReparse)` 提交内部操作；在输入事件中直接更新 Block 和 store，保证立即保存可读取最新内容，删除原有 `blocks -> content` effect。
3. 普通编辑传入 `requiresReparse=false`；明确的结构提交传入 `true`，调用现有全文解析器生成新的显示块。
4. `content` effect 只判断是否为当前文件的内部内容回写：匹配时清除标记并跳过重复解析；外部修改或文件切换则重新解析，并清除旧活动块。
5. 保持普通编辑时的 `block.id`、未变化的 Block 对象和稳定回调，配合 `React.memo` 避免无关 Block 重渲染。
6. 序列化后按各块的输出行数更新 `sourceLine`，不调用全文解析器；没有行号变化的 Block 继续复用原对象，保证大纲定位与文档缓冲区一致。

这样普通输入只更新当前 Block 和全局内容，不会再次解析整个文档。文件 ID 检查同时阻止旧块在文件切换时将内容回写到新文件。

### 4.3 结构变化处理

以下操作需要结构检查或重新解析：

- 增加或删除换行导致块数量或块类型改变；
- 标题、列表、引用前缀切换；
- 插入代码块、表格、分隔线；
- 文件切换或外部内容变更。

输入期间保留当前 textarea，不因换行或前缀输入立即拆块。Blur/Escape 结束编辑时，先用现有解析器检查当前块；只有块数量、类型或内容结构变化才整篇重新解析。工具栏的结构操作直接提交并重新解析。

结构重新解析时，以本次序列化后的起始行和块内容、类型、语言、任务状态识别未变化块，保留其 ID；新增或改变结构的块使用新的 UUID。这里只进行同起始行的简单查找，不跨位置匹配，也不引入 LCS。点击其他块时，在确认点击目标后提交原块结构，避免 blur 提前重建目标块导致本次点击失效。工具栏主键 mousedown 保留编辑器焦点和选区。

序列化必须保留段落之间的分隔、列表/引用续行，以及 Mermaid 和块公式的语法标记，避免结构重新解析时合并其他段落或丢失特殊块。这里只修复 Block 到 Markdown 的序列化，不改动两套解析器的语法规则。

## 5. 不同模式的滚动处理

| 场景 | Split | WYSIWYG |
| --- | --- | --- |
| 普通文本编辑 | 依靠 DOM 和稳定 key 保留位置 | 当前编辑 Block 保持焦点和位置 |
| 文档前部插入内容 | 先观察现有百分比同步效果 | 结构变化时重新解析 |
| 文件切换 | 使用现有按文件保存的位置 | 使用现有编辑器滚动容器位置 |
| PDF | 不处理 Markdown 滚动同步 | 不适用 |

不要让 Split 模式的 `ResizeObserver` 逻辑参与 WYSIWYG；两个模式的滚动容器和渲染生命周期不同。

## 6. 实施顺序

1. 修改 WYSIWYG 的内部内容同步，区分普通更新和结构更新。
2. 修改 Split 的 display chunk 缓存，复用处理后的 HTML 和最新 chunk 元数据。
3. 删除 Split 预览清空和首批整体替换逻辑。
4. 保留分批后处理，但最后一次性提交完整的新 chunk 数组。
5. 完成长文档手动验证后，再决定是否需要一次性滚动保护或 source line 锚点。

## 7. 验收标准

### Split 模式

- 长文档中间或末尾编辑时，预览不再出现整页空白。
- 未修改区域的 DOM 不被整体卸载重建。
- Worker 仍全文解析；普通段落编辑只在主线程重新处理变化 chunk，未变化 chunk 的 DOM 保持复用。
- 代码块、表格、公式和 Mermaid 修改后内容正确更新。
- 快速连续输入时，旧 Worker 结果不会覆盖新内容。
- 同一文件编辑后预览保持当前位置；切换文件仍能恢复各自位置。

### WYSIWYG 模式

- 普通连续输入时只更新当前 Block；换行和前缀输入保持焦点，结束块编辑后再规范化结构。
- 光标、焦点和当前 Block 的编辑状态保持不变。
- 未修改 Block 不重新挂载。
- 切换文件、外部修改和结构变化仍能正确重新解析。

### 通用检查

- `npm run build` 通过。
- 手动验证普通段落、列表、标题、代码块、表格、公式、Mermaid 和图片。
- 使用 React DevTools 或日志确认普通输入不会触发整棵预览树重建。

## 8. 明确不做的内容

本次不实现：

- Worker 增量 Markdown 解析；
- 新的 patch 消息协议；
- AST/LCS/复杂块匹配；
- 视口虚拟化；
- Split 与 WYSIWYG 之间新增渲染生命周期回调；
- 修改两套 Markdown 解析器的语法规则；
- 将 WYSIWYG 和 Split 合并为同一套渲染组件。

## 9. 实施与验证记录

本次实现将 WYSIWYG 的内容同步从 effect 移到输入事件中，结构检查放在 Blur/Escape；Split 删除重复的外层 `useDeferredValue`，由渲染器统一管理防抖、请求失效和缓存。Mermaid 占位符 ID 由 chunk 签名和 occurrence 生成，避免重复图表 ID 冲突及源行变化导致无关图表重建。

主线程 display chunk 缓存只保留当前文件最近一次完整结果；过期批次不提交 DOM，空文档提交空数组。Worker 协议和全文解析方式保持不变。

预览块使用 `React.memo` 和按 HTML 字符串缓存的 `dangerouslySetInnerHTML` 属性对象，保证仅更新源行号时不会重新插入 HTML 或覆盖 Mermaid 已生成的 SVG。

首轮验证：`npm run build` 通过；基于实际 React 组件、StrictMode 和真实 Worker 的临时浏览器回归页面完成 31 项检查，覆盖未变化 DOM/公式/图表复用、末尾编辑滚动、源行号更新、快速切换文件、空文档、WYSIWYG 输入与焦点、结构提交、外部更新、格式快捷键、序列化往返和无 Worker 备用路径。

Review 修复：工具栏点击保留焦点和选区；结构解析保留未变化块 ID，新增块统一生成 UUID；活动块切换回调保持稳定，使 `React.memo` 在无关块上生效；Mermaid 异步结果增加失效检查和每次渲染唯一 ID，并保持 SVG 的 HTML 属性对象稳定。移除不再使用的块输入防抖与卸载回写逻辑，继续在输入事件同步缓冲区。

文件切换同时更新当前文件 ID 和缓存内容，避免读取期间将旧文档显示为新文件的可编辑内容。磁盘读取完成后检查最新文件状态，保护读取期间的新输入，并丢弃保存、重新加载或路径变化后已经失效的快照；读取失败时也只对仍然活动的文件使用最新缓存。

Review 回归：真实点击验证粗体工具栏、段落拆分后直接编辑后续块、标题/列表/引用转换后的点击；DOM 观察确认无关块不重写内容、不重新挂载。模拟延迟 Tauri 读写验证磁盘变化、磁盘未变、读取失败、读取期间保存、切回其他文件以及正常加载。真实 Worker 的 Split 回归中，末尾编辑只替换 123 个块中的 1 个，滚动位置保持；前部插入段落后原有 123 个块及公式/图表节点保持复用，源行号正确平移。WYSIWYG 无关段落输入不重绘图表，连续图表编辑最终显示最新内容。本轮 `npm run build` 通过。所有临时验证文件最终清理，不引入测试框架。

验证范围为 Vite 浏览器环境；Tauri 桌面中的实际文件 I/O、PDF 和大规模文档性能未在本次浏览器检查中重新验证。Worker 全文解析的成本仍然存在，文档前部大量插入内容后的精确锚点定位仍按后续事项处理。

如果完成本方案后，性能测试仍显示 Worker 全文解析是主要瓶颈，再单独评估“仅对当前 Block 及相邻边界重新解析”的第二阶段优化。
