import { useCallback, useDeferredValue, useEffect, useRef, useState, useTransition } from "react"
import { ImageLightbox } from "./image-lightbox"
import { renderMarkdownToHtmlChunks, type MarkdownRenderChunk } from "@/lib/markdown-render"
import { useEditorStore } from "@/lib/editor-store"
import { cn } from "@/lib/utils"
import { openExternalTarget } from "@/lib/runtime"

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
  const activeFilePath = useEditorStore((state) => {
    if (!state.activeFileId) {
      return null
    }

    return state.findNodeById(state.activeFileId)?.filePath ?? null
  })

  const enqueueChunkRender = useCallback(
    (_requestId: number, chunks: MarkdownRenderChunk[]) => {
      startTransition(() => {
        setRenderedChunks(chunks)
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
              setRenderedChunks(chunks)
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

  useEffect(() => {
    if (typeof Worker === "undefined") {
      const chunks = renderMarkdownToHtmlChunks(deferredContent, activeFilePath)
      setRenderedChunks(chunks)
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

    const latestInput = latestRenderInputRef.current
    setIsRendering(true)
    scheduleRender(latestInput.content, latestInput.activeFilePath)
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
          <div key={chunk.key} dangerouslySetInnerHTML={{ __html: chunk.html }} />
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
