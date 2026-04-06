import { useEffect, useRef, useState } from "react"

interface PdfRendererProps {
  dataUrl: string
  className?: string
}

interface PageInfo {
  pageNum: number
  canvas: HTMLCanvasElement
}

export function PdfRenderer({ dataUrl, className }: PdfRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState<PageInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [pdfLib, setPdfLib] = useState<typeof import("pdfjs-dist") | null>(null)

  // Dynamically load pdfjs-dist
  useEffect(() => {
    let destroyed = false

    async function loadLib() {
      const pdfjs = await import("pdfjs-dist")
      if (destroyed) return

      // Use legacy build which includes worker - avoids separate worker file issues
      const workerUrl = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.href

      setPdfLib(pdfjs)
    }

    loadLib()

    return () => {
      destroyed = true
    }
  }, [])

  useEffect(() => {
    if (!pdfLib) return

    const pdfjs = pdfLib
    let cancelled = false

    async function loadPdf() {
      try {
        setLoading(true)
        setError(null)

        const loadingTask = pdfjs.getDocument(dataUrl)
        const pdfDoc = await loadingTask.promise

        if (cancelled) return

        setNumPages(pdfDoc.numPages)

        // Render all pages
        const renderedPages: PageInfo[] = []
        const scale = window.devicePixelRatio || 1

        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
          if (cancelled) return

          const page = await pdfDoc.getPage(pageNum)
          if (cancelled) return

          const viewport = page.getViewport({ scale: 1.5 * scale })
          const canvas = document.createElement("canvas")
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.width = `${viewport.width / scale}px`
          canvas.style.height = `${viewport.height / scale}px`

          const context = canvas.getContext("2d")!
          const renderContext = {
            canvasContext: context,
            viewport: viewport,
          }

          await page.render(renderContext).promise

          if (cancelled) return

          renderedPages.push({ pageNum, canvas })
        }

        if (!cancelled) {
          setPages(renderedPages)
        }
      } catch (err) {
        if (!cancelled && err instanceof Error && err.name !== "RenderingCancelledException") {
          setError(err.message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadPdf()

    return () => {
      cancelled = true
    }
  }, [pdfLib, dataUrl])

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        <p>PDF 加载失败: {error}</p>
      </div>
    )
  }

  if (loading && !pdfLib) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">正在初始化 PDF 阅读器...</div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={className}>
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="text-muted-foreground">正在加载 PDF...</div>
        </div>
      )}
      <div className="flex flex-col items-center gap-4">
        {pages.map(({ pageNum, canvas }) => (
          <div
            key={pageNum}
            className="shadow-md bg-white"
            ref={(el) => {
              if (el && !el.contains(canvas)) {
                el.innerHTML = ""
                el.appendChild(canvas)
              }
            }}
          />
        ))}
      </div>
      {!loading && pages.length > 0 && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          共 {numPages} 页
        </div>
      )}
    </div>
  )
}
