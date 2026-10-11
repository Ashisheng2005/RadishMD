import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { ImageLightbox } from "./image-lightbox"
import { renderMarkdownToHtmlChunks, type MarkdownRenderChunk } from "@/lib/markdown-render"
import { resolveImageSource } from "@/lib/image-utils"
import { useEditorStore } from "@/lib/editor-store"
import { cn } from "@/lib/utils"
import { openExternalTarget } from "@/lib/runtime"
import katex from "katex"
import "katex/dist/katex.min.css"
import mermaid from "mermaid"

const CHUNK_RENDER_BATCH_SIZE = 40
const CHUNK_RENDER_FRAME_DELAY = 16
const MERMAID_ROOT_MARGIN = "600px 0px"

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

// Decode HTML entities in a string
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

// Resolve image paths in HTML chunks on the main thread (worker can't use convertFileSrc)
function resolveImagePathsInHtml(chunks: MarkdownRenderChunk[], baseFilePath: string | null): MarkdownRenderChunk[] {
  if (!baseFilePath) {
    return chunks
  }

  return chunks.map((chunk) => {
    // Replace image src attributes with resolved asset URLs
    const resolvedHtml = chunk.html.replace(
      /<img\s+([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi,
      (_match, before, src, after) => {
        // Decode HTML entities before resolving (the src was HTML-escaped by buildImageTag)
        const decodedSrc = decodeHtmlEntities(src)
        const resolvedSrc = resolveImageSource(decodedSrc, baseFilePath)
        // Re-escape for HTML attribute context
        const escapedSrc = resolvedSrc
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
        return `<img ${before}src="${escapedSrc}"${after}>`
      }
    )
    return { ...chunk, html: resolvedHtml }
  })
}

// Renders math placeholders in HTML chunks - called only in main thread
function renderMathInHtml(html: string): string {
  // Render inline math placeholders %%MATH_INLINE:encoded%%
  html = html.replace(/%%MATH_INLINE:([^%]+)%%/g, (_match, encoded) => {
    const formula = decodeURIComponent(encoded)
    try {
      return katex.renderToString(formula, { throwOnError: false, displayMode: false })
    } catch {
      return `<code class="text-red-500">${escapeHtml(formula)}</code>`
    }
  })
  // Render block math placeholders
  html = html.replace(/<div class="katex-display" data-math-block="([^"]+)"><\/div>/g, (_match, encoded) => {
    const formula = decodeURIComponent(encoded)
    try {
      return `<div class="katex-display">${katex.renderToString(formula, { throwOnError: false, displayMode: true })}</div>`
    } catch {
      return `<div class="katex-display text-red-500"><code>${escapeHtml(formula)}</code></div>`
    }
  })
  return html
}

// Initialize mermaid with theme based on dark mode
let mermaidInitialized = false
function ensureMermaidInitialized() {
  if (mermaidInitialized) return
  const isDark = document.documentElement.classList.contains("dark")
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? "dark" : "base",
    themeVariables: isDark
      ? {
          primaryColor: "#6c47ff",
          primaryTextColor: "#fff",
          primaryBorderColor: "#555",
          lineColor: "#888",
          secondaryColor: "#555",
          tertiaryColor: "#333",
          background: "#1a1a1a",
          mainBkg: "#2d2d2d",
          secondBkg: "#3d3d3d",
          border1: "#555",
          border2: "#666",
          arrowheadColor: "#888",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }
      : {
          primaryColor: "#6c47ff",
          primaryTextColor: "#1a1a1a",
          primaryBorderColor: "#ccc",
          lineColor: "#333",
          secondaryColor: "#f0f0f0",
          tertiaryColor: "#fff",
          background: "#ffffff",
          mainBkg: "#f8f8f8",
          secondBkg: "#f0f0f0",
          border1: "#e0e0e0",
          border2: "#d0d0d0",
          arrowheadColor: "#333",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        },
  })
  mermaidInitialized = true
}

async function renderMermaidElement(div: Element) {
  ensureMermaidInitialized()

  if (div.getAttribute("data-mermaid-rendered") === "true" || div.getAttribute("data-mermaid-rendering") === "true") {
    return
  }

  const id = div.getAttribute("data-mermaid-id")
  const content = div.getAttribute("data-mermaid-content")
  if (!id || !content) return

  div.setAttribute("data-mermaid-rendering", "true")
  const encodedContent = decodeURIComponent(content)

  try {
    const { svg } = await mermaid.render(id, encodedContent)
    if (!div.isConnected) return

    div.innerHTML = svg
    div.setAttribute("data-mermaid-rendered", "true")
  } catch (err) {
    console.error("[RadishMD] mermaid render error", err)
    if (!div.isConnected) return

    const errorMsg = err instanceof Error ? err.message : String(err)
    div.innerHTML = `<div class="mermaid-error p-4 rounded-lg border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20 my-2">
  <p class="text-sm font-medium text-red-600 dark:text-red-400 mb-1">⚠️ 流程图渲染失败</p>
  <p class="text-xs text-red-500/80 mb-2 font-mono">${escapeHtml(errorMsg)}</p>
  <pre class="text-xs text-red-500 whitespace-pre-wrap border-t border-red-200 dark:border-red-800 pt-2 mt-1">${escapeHtml(encodedContent)}</pre>
</div>`
    div.setAttribute("data-mermaid-rendered", "true")
  } finally {
    div.removeAttribute("data-mermaid-rendering")
  }
}

function processDisplayChunks(chunks: MarkdownRenderChunk[], baseFilePath: string | null): MarkdownRenderChunk[] {
  const processedChunks = chunks.map((chunk) => ({
    ...chunk,
    html: renderMathInHtml(chunk.html),
  }))

  return resolveImagePathsInHtml(processedChunks, baseFilePath)
}

type DisplayChunkCacheEntry = {
  sourceHtml: string
  baseFilePath: string | null
  processedHtml: string
}

const PreviewChunk = memo(function PreviewChunk({ html, sourceLine }: { html: string; sourceLine: number }) {
  // Keep the innerHTML prop stable, including when only sourceLine changes.
  // Mermaid writes SVG into this DOM after React has mounted the placeholder.
  const innerHtml = useMemo(() => ({ __html: html }), [html])
  return <div data-source-line={sourceLine} dangerouslySetInnerHTML={innerHtml} />
})

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const [previewImage, setPreviewImage] = useState<{ src: string; alt?: string } | null>(null)
  const [renderedChunks, setRenderedChunks] = useState<MarkdownRenderChunk[]>([])
  const [isRendering, setIsRendering] = useState(false)
  const [isWorkerReady, setIsWorkerReady] = useState(false)
  const [isPending, startTransition] = useTransition()
  const deferredContent = useDeferredValue(content)
  const workerRef = useRef<Worker | null>(null)
  const renderRequestIdRef = useRef(0)
  const renderDebounceTimerRef = useRef<number | null>(null)
  const chunkRenderTimerRef = useRef<number | null>(null)
  const chunkRenderTokenRef = useRef(0)
  const displayChunkCacheRef = useRef(new Map<string, DisplayChunkCacheEntry>())
  const latestRenderInputRef = useRef<{ requestId: number; content: string; activeFilePath: string | null; activeFileId: string | null }>({
    requestId: 0,
    content: "",
    activeFilePath: null,
    activeFileId: null,
  })
  const lastActiveFileIdRef = useRef<string | null | undefined>(undefined)
  const contentRef = useRef<HTMLDivElement>(null)
  const activeFileId = useEditorStore((state) => state.activeFileId)
  const activeFilePath = useEditorStore((state) => {
    if (!state.activeFileId) {
      return null
    }

    return state.findNodeById(state.activeFileId)?.filePath ?? null
  })

  const cancelScheduledChunkRender = useCallback(() => {
    chunkRenderTokenRef.current += 1

    if (chunkRenderTimerRef.current !== null) {
      window.clearTimeout(chunkRenderTimerRef.current)
      chunkRenderTimerRef.current = null
    }
  }, [])

  // Mermaid diagrams are rendered only when they approach the preview viewport.
  useEffect(() => {
    if (!contentRef.current) return
    const container = contentRef.current

    const mermaidDivs = Array.from(container.querySelectorAll(".mermaid-diagram")).filter((div) => {
      return div.getAttribute("data-mermaid-rendered") !== "true"
    })

    if (mermaidDivs.length === 0) return

    const previewScroller = container.parentElement

    if (typeof IntersectionObserver === "undefined") {
      mermaidDivs.forEach((div) => {
        void renderMermaidElement(div)
      })
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return

          observer.unobserve(entry.target)
          void renderMermaidElement(entry.target)
        })
      },
      {
        root: previewScroller,
        rootMargin: MERMAID_ROOT_MARGIN,
      },
    )

    mermaidDivs.forEach((div) => observer.observe(div))

    return () => observer.disconnect()
  }, [renderedChunks])

  const enqueueChunkRender = useCallback(
    (requestId: number, chunks: MarkdownRenderChunk[]) => {
      const { activeFilePath: baseFilePath, activeFileId: renderFileId } = latestRenderInputRef.current
      const token = chunkRenderTokenRef.current + 1
      chunkRenderTokenRef.current = token

      if (chunkRenderTimerRef.current !== null) {
        window.clearTimeout(chunkRenderTimerRef.current)
        chunkRenderTimerRef.current = null
      }

      let nextIndex = 0
      const nextChunks: MarkdownRenderChunk[] = []
      const nextCache = new Map<string, DisplayChunkCacheEntry>()

      const renderNextBatch = () => {
        if (token !== chunkRenderTokenRef.current || requestId !== renderRequestIdRef.current ||
          useEditorStore.getState().activeFileId !== renderFileId) {
          return
        }

        const batch = chunks.slice(nextIndex, nextIndex + CHUNK_RENDER_BATCH_SIZE)
        nextIndex += batch.length
        for (const chunk of batch) {
          let cached = displayChunkCacheRef.current.get(chunk.key)
          if (!cached || cached.sourceHtml !== chunk.html || cached.baseFilePath !== baseFilePath) {
            cached = {
              sourceHtml: chunk.html,
              baseFilePath,
              processedHtml: processDisplayChunks([chunk], baseFilePath)[0].html,
            }
          }
          nextCache.set(chunk.key, cached)
          nextChunks.push({ ...chunk, html: cached.processedHtml })
        }

        if (nextIndex < chunks.length) {
          chunkRenderTimerRef.current = window.setTimeout(renderNextBatch, CHUNK_RENDER_FRAME_DELAY)
          return
        }

        chunkRenderTimerRef.current = null
        displayChunkCacheRef.current = nextCache
        startTransition(() => {
          setRenderedChunks((previousChunks) => (
            token === chunkRenderTokenRef.current && requestId === renderRequestIdRef.current &&
              useEditorStore.getState().activeFileId === renderFileId ? nextChunks : previousChunks
          ))
        })
        setIsRendering(false)
      }

      renderNextBatch()
    },
    [startTransition]
  )

  useEffect(() => {
    const worker = typeof Worker === "undefined" ? null : new Worker(new URL("../../workers/markdown-render-worker.ts", import.meta.url), {
      type: "module",
    })

    workerRef.current = worker

    if (worker) {
      worker.onmessage = (event: MessageEvent<{ type: string; requestId?: number; chunks?: MarkdownRenderChunk[] }>) => {
        const message = event.data

        if (message.type === "ready") {
          setIsWorkerReady(true)
          return
        }

        if (message.type === "chunks" && typeof message.requestId === "number") {
          if (message.requestId !== renderRequestIdRef.current) {
            return
          }

          enqueueChunkRender(message.requestId, message.chunks || [])
        }
      }

      worker.onerror = (error) => {
        console.error("[RadishMD][markdown-render] worker error", error)
      }
    }

    return () => {
      if (renderDebounceTimerRef.current !== null) {
        window.clearTimeout(renderDebounceTimerRef.current)
        renderDebounceTimerRef.current = null
      }
      cancelScheduledChunkRender()
      renderRequestIdRef.current += 1
      workerRef.current = null
      setIsWorkerReady(false)
      setIsRendering(false)
      lastActiveFileIdRef.current = undefined
      worker?.terminate()
    }
  }, [cancelScheduledChunkRender, enqueueChunkRender])

  useEffect(() => {
    if (lastActiveFileIdRef.current === activeFileId &&
      latestRenderInputRef.current.requestId === renderRequestIdRef.current &&
      latestRenderInputRef.current.content === content &&
      latestRenderInputRef.current.activeFilePath === activeFilePath &&
      (typeof Worker === "undefined" || isWorkerReady)) {
      return
    }
    // Invalidate old work as soon as input changes, including the debounce interval.
    renderRequestIdRef.current += 1
    const requestId = renderRequestIdRef.current
    cancelScheduledChunkRender()
    if (renderDebounceTimerRef.current !== null) {
      window.clearTimeout(renderDebounceTimerRef.current)
      renderDebounceTimerRef.current = null
    }
    const fileChanged = activeFileId !== lastActiveFileIdRef.current
    if (fileChanged) {
      displayChunkCacheRef.current.clear()
      setRenderedChunks([])
      setPreviewImage(null)
    }
    setIsRendering(true)
    if (typeof Worker !== "undefined" && !isWorkerReady) {
      return
    }
    if (!fileChanged && deferredContent !== content) return

    lastActiveFileIdRef.current = activeFileId
    latestRenderInputRef.current = { requestId, content, activeFilePath, activeFileId }
    const render = () => {
      renderDebounceTimerRef.current = null
      if (requestId !== renderRequestIdRef.current) return
      if (workerRef.current) {
        workerRef.current.postMessage({ type: "render", requestId, content, activeFilePath })
      } else {
        enqueueChunkRender(requestId, renderMarkdownToHtmlChunks(content, activeFilePath))
      }
    }
    if (fileChanged) render()
    else renderDebounceTimerRef.current = window.setTimeout(render, 220)
  }, [activeFileId, activeFilePath, content, deferredContent, isWorkerReady, cancelScheduledChunkRender, enqueueChunkRender])

  const isRenderLoading = isRendering || isPending

  function openRenderedTarget(target: string) {
    void openExternalTarget(target)
  }

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    if (!target) return

    const imageElement = target.closest("img[src]") as HTMLImageElement | null
    if (imageElement) {
      const imageSource = imageElement.getAttribute("src")
      if (!imageSource) return

      event.preventDefault()

      if (event.ctrlKey || event.metaKey) {
        openRenderedTarget(imageSource)
        return
      }

      setPreviewImage({
        src: imageSource,
        alt: imageElement.getAttribute("alt") || undefined,
      })
      return
    }

    const linkElement = target.closest("a[href]") as HTMLAnchorElement | null
    if (!linkElement) return

    const targetUrl = linkElement.getAttribute("href")
    if (!targetUrl) return

    event.preventDefault()

    if (!event.ctrlKey && !event.metaKey) {
      return
    }

    openRenderedTarget(targetUrl)
  }

  return (
    <>
      <div
        ref={contentRef}
        className={cn(
          "prose prose-sm max-w-none",
          "prose-headings:text-foreground prose-p:text-foreground",
          "prose-strong:text-foreground prose-em:text-foreground",
          "prose-code:text-primary",
          className
        )}
        style={{ overflowAnchor: "none" }}
        onClickCapture={handleClickCapture}
      >
        {renderedChunks.length === 0 && isRenderLoading ? (
          <div className="px-1 py-8 text-center text-sm text-muted-foreground">
            正在渲染预览...
          </div>
        ) : null}
        {renderedChunks.map((chunk) => (
          <PreviewChunk
            key={chunk.key}
            sourceLine={chunk.sourceLine}
            html={chunk.html}
          />
        ))}
      </div>
      {previewImage && (
        <ImageLightbox
          open={Boolean(previewImage)}
          onOpenChange={(open) => {
            if (!open) {
              setPreviewImage(null)
            }
          }}
          src={previewImage.src}
          alt={previewImage.alt}
        />
      )}
    </>
  )
}
