import { useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import mermaid from "mermaid"
import "katex/dist/katex.min.css"
import exportFontUrl from "@/assets/fonts/NotoSansSC-Regular.woff2?url"
import { EXPORT_STYLE } from "@/lib/export-html"

let mermaidReady = false

function ensureExportMermaid() {
  if (mermaidReady) return
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    themeVariables: {
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
      fontFamily: '"Radish Export", sans-serif',
    },
  })
  mermaidReady = true
}

async function renderDiagrams(root: ParentNode) {
  ensureExportMermaid()
  const diagrams = Array.from(root.querySelectorAll(".mermaid-diagram"))
  for (const diagram of diagrams) {
    const id = diagram.getAttribute("data-mermaid-id")
    const encoded = diagram.getAttribute("data-mermaid-content")
    if (!id || !encoded) continue
    const source = decodeURIComponent(encoded)
    try {
      const { svg } = await mermaid.render(id, source)
      diagram.innerHTML = svg
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      diagram.replaceChildren()
      const pre = document.createElement("pre")
      pre.textContent = `${message}\n${source}`
      diagram.append(pre)
    }
  }
}

function waitForImages(root: ParentNode) {
  const images = Array.from(root.querySelectorAll("img"))
  return Promise.all(images.map((img) => {
    if (img.complete) return Promise.resolve()
    return new Promise<void>((resolve) => {
      img.addEventListener("load", () => resolve(), { once: true })
      img.addEventListener("error", () => resolve(), { once: true })
    })
  }))
}

export function ExportPage() {
  useEffect(() => {
    let cancelled = false
    document.documentElement.classList.remove("dark")
    document.body.style.background = "#fff"
    document.body.style.color = "#1a1a1a"
    void (async () => {
      try {
        const html = await invoke<string>("take_export_html")
        if (cancelled) return
        const article = document.getElementById("export-article")
        if (!article) throw new Error("导出页面未就绪")
        article.innerHTML = html
        await renderDiagrams(article)
        await waitForImages(article)
        await document.fonts.ready
        if (cancelled) return
        await invoke("finish_export_render", { article: article.innerHTML })
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        await invoke("fail_export_render", { message }).catch(() => {})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <style>
        {`@font-face{font-family:"Radish Export";src:url("${exportFontUrl}") format("woff2");font-weight:400;font-display:swap;}${EXPORT_STYLE}`}
      </style>
      <article id="export-article" />
    </>
  )
}
