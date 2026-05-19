import { useCallback, useDeferredValue, useEffect, useRef, useState, useTransition } from "react"
import { ImageLightbox } from "./image-lightbox"
import { renderMarkdownToHtmlChunks, type MarkdownRenderChunk } from "@/lib/markdown-render"
import { resolveImageSource } from "@/lib/image-utils"
import { useEditorStore } from "@/lib/editor-store"
import { cn } from "@/lib/utils"
import { openExternalTarget } from "@/lib/runtime"
import katex from "katex"
import "katex/dist/katex.min.css"
import mermaid from "mermaid"

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

// Renders mermaid placeholders in DOM after HTML is set
async function renderMermaidInContainer(container: HTMLElement) {
  const mermaidDivs = container.querySelectorAll(".mermaid-diagram")
  if (mermaidDivs.length === 0) return

  ensureMermaidInitialized()

  const renders: Promise<void>[] = []
  mermaidDivs.forEach((div) => {
    const id = div.getAttribute("data-mermaid-id")
    const content = div.getAttribute("data-mermaid-content")
    if (!id || !content) return

    const encodedContent = decodeURIComponent(content)
    renders.push(
      mermaid
        .render(id, encodedContent)
        .then(({ svg }) => {
          div.innerHTML = svg
        })
        .catch((err) => {
          console.error("[RadishMD] mermaid render error", err)
          const errorMsg = err instanceof Error ? err.message : String(err)
          div.innerHTML = `<div class="mermaid-error p-4 rounded-lg border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20 my-2">
  <p class="text-sm font-medium text-red-600 dark:text-red-400 mb-1">⚠️ 流程图渲染失败</p>
  <p class="text-xs text-red-500/80 mb-2 font-mono">${escapeHtml(errorMsg)}</p>
  <pre class="text-xs text-red-500 whitespace-pre-wrap border-t border-red-200 dark:border-red-800 pt-2 mt-1">${escapeHtml(encodedContent)}</pre>
</div>`
        })
    )
  })

  await Promise.all(renders)
}

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
  const latestRenderInputRef = useRef<{ content: string; activeFilePath: string | null }>({
    content: "",
    activeFilePath: null,
  })
  const lastActiveFileIdRef = useRef<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const activeFilePath = useEditorStore((state) => {
    if (!state.activeFileId) {
      return null
    }

    return state.findNodeById(state.activeFileId)?.filePath ?? null
  })

  // Render mermaid diagrams after chunks are set in DOM
  useEffect(() => {
    if (!contentRef.current) return
    const container = contentRef.current
    // Use requestAnimationFrame to ensure DOM is updated
    requestAnimationFrame(() => {
      renderMermaidInContainer(container)
    })
  }, [renderedChunks])

  const enqueueChunkRender = useCallback(
    (_requestId: number, chunks: MarkdownRenderChunk[]) => {
      const baseFilePath = latestRenderInputRef.current.activeFilePath
      startTransition(() => {
        // Process math formulas and resolve image paths in main thread
        const processedChunks = chunks.map((chunk) => ({
          ...chunk,
          html: renderMathInHtml(chunk.html),
        }))
        // Resolve image paths after math formulas are processed
        const resolvedChunks = resolveImagePathsInHtml(processedChunks, baseFilePath)
        setRenderedChunks(resolvedChunks)
      })
      setIsRendering(false)
    },
    [startTransition]
  )

  const postRenderRequest = useCallback(
    (renderContent: string, renderActiveFilePath: string | null) => {
      const worker = workerRef.current

      if (!worker) {
        return false
      }

      const nextRequestId = renderRequestIdRef.current + 1
      renderRequestIdRef.current = nextRequestId
      setIsRendering(true)

      worker.postMessage({
        type: "render",
        requestId: nextRequestId,
        content: renderContent,
        activeFilePath: renderActiveFilePath,
      })

      return true
    },
    []
  )

  const scheduleRender = useCallback(
    (renderContent: string, renderActiveFilePath: string | null) => {
      if (renderDebounceTimerRef.current !== null) {
        window.clearTimeout(renderDebounceTimerRef.current)
      }

      renderDebounceTimerRef.current = window.setTimeout(() => {
        renderDebounceTimerRef.current = null

        if (!postRenderRequest(renderContent, renderActiveFilePath)) {
          const chunks = renderMarkdownToHtmlChunks(renderContent, renderActiveFilePath)
          const resolvedChunks = resolveImagePathsInHtml(chunks, renderActiveFilePath)
          setRenderedChunks(resolvedChunks)
          setIsRendering(false)
        }
      }, 220)
    },
    [postRenderRequest]
  )

  useEffect(() => {
    latestRenderInputRef.current = {
      content: deferredContent,
      activeFilePath,
    }
  }, [activeFilePath, deferredContent])

  // 文件切换时立即渲染，跳过延迟
  useEffect(() => {
    const activeFileId = useEditorStore.getState().activeFileId
    if (activeFileId && activeFileId !== lastActiveFileIdRef.current) {
      lastActiveFileIdRef.current = activeFileId
      // 立即渲染，不使用 debounce
      if (renderDebounceTimerRef.current !== null) {
        window.clearTimeout(renderDebounceTimerRef.current)
        renderDebounceTimerRef.current = null
      }
      if (!postRenderRequest(content, activeFilePath)) {
        const chunks = renderMarkdownToHtmlChunks(content, activeFilePath)
        const resolvedChunks = resolveImagePathsInHtml(chunks, activeFilePath)
        setRenderedChunks(resolvedChunks)
        setIsRendering(false)
      }
    }
  }, [content, activeFilePath])

  useEffect(() => {
    if (typeof Worker === "undefined") {
      const chunks = renderMarkdownToHtmlChunks(deferredContent, activeFilePath)
      const resolvedChunks = resolveImagePathsInHtml(chunks, activeFilePath)
      setRenderedChunks(resolvedChunks)
      setIsRendering(false)
      return
    }

    const worker = new Worker(new URL("../../workers/markdown-render-worker.ts", import.meta.url), {
      type: "module",
    })

    workerRef.current = worker

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

    return () => {
      if (renderDebounceTimerRef.current !== null) {
        window.clearTimeout(renderDebounceTimerRef.current)
        renderDebounceTimerRef.current = null
      }
      workerRef.current = null
      setIsWorkerReady(false)
      setIsRendering(false)
      worker.terminate()
    }
  }, [enqueueChunkRender])

  useEffect(() => {
    if (typeof Worker === "undefined") {
      return
    }

    if (!isWorkerReady) {
      setIsRendering(true)
      return
    }

    // Worker is ready, trigger render using current content
    setIsRendering(true)
    scheduleRender(deferredContent, activeFilePath)
  }, [activeFilePath, deferredContent, isWorkerReady, scheduleRender])

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
          <div
            key={chunk.key}
            data-source-line={chunk.sourceLine}
            dangerouslySetInnerHTML={{ __html: chunk.html }}
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
