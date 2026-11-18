import { invoke } from "@tauri-apps/api/core"
import katexCss from "katex/dist/katex.min.css?raw"
import { renderMarkdownToHtml } from "@/lib/markdown-render"
import { renderMathInHtml } from "@/components/editor/markdown-renderer"
import { localImagePath } from "@/lib/image-utils"
import exportFontUrl from "@/assets/fonts/NotoSansSC-Regular.woff2?url"

const katexFontUrls = import.meta.glob("../../node_modules/katex/dist/fonts/*.woff2", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>

export const EXPORT_STYLE = `
@page { size: A4; margin: 16mm; }
html, body { margin: 0 !important; background: #fff !important; color: #1a1a1a !important; }
body { font-family: "Radish Export", "Noto Sans SC", sans-serif; font-size: 16px; line-height: 1.7; }
h1, h2, h3, h4, h5, h6 { line-height: 1.3; font-weight: 650; }
h1 { font-size: 1.8rem; margin: 1.4rem 0 0.8rem; }
h2 { font-size: 1.4rem; margin: 1.4rem 0 0.7rem; border-bottom: 1px solid #e5e5e5; padding-bottom: 0.3rem; }
h3 { font-size: 1.2rem; margin: 1.2rem 0 0.6rem; }
h4, h5, h6 { font-size: 1rem; margin: 1rem 0 0.5rem; }
p, ul, ol, blockquote, pre, table { margin: 0.7rem 0; }
ul, ol { padding-left: 1.4rem; }
li { margin: 0.2rem 0; }
a { color: #5b3df5; }
blockquote { border-left: 4px solid #6c47ff; padding-left: 1rem; color: #555; }
pre { background: #f6f6f6; padding: 0.8rem; overflow: auto; border-radius: 6px; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ddd; padding: 0.35rem 0.6rem; text-align: left; }
hr { border: 0; border-top: 1px solid #ddd; margin: 1.4rem 0; }
`

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

async function bytesToDataUrl(url: string, mime: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`无法读取导出资源: ${url}`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  let binary = ""
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

let fontFacePromise: Promise<string> | null = null
function exportFontFace() {
  fontFacePromise ??= bytesToDataUrl(exportFontUrl, "font/woff2").then((dataUrl) => {
    return `@font-face{font-family:"Radish Export";src:url("${dataUrl}") format("woff2");font-weight:400;font-display:swap;}`
  })
  return fontFacePromise
}

let katexCssPromise: Promise<string> | null = null
function inlinedKatexCss() {
  katexCssPromise ??= (async () => {
    const replacements = new Map<string, string>()
    await Promise.all(Object.entries(katexFontUrls).map(async ([path, url]) => {
      const fileName = path.split("/").pop()
      if (!fileName) return
      replacements.set(fileName, await bytesToDataUrl(url, "font/woff2"))
    }))
    return katexCss
      .replace(/url\(fonts\/([^)]+\.woff2)\)/g, (_match, fileName: string) => {
        const dataUrl = replacements.get(fileName)
        return dataUrl ? `url("${dataUrl}")` : "none"
      })
      .replace(/,url\(fonts\/[^)]+\.(?:woff|ttf)\)(?: format\("[^"]+"\))?/g, "")
  })()
  return katexCssPromise
}

async function inlineLocalImages(html: string, baseFilePath: string | null) {
  const pattern = /<img\s+([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi
  const matches = [...html.matchAll(pattern)]
  let result = html
  for (const match of matches) {
    const decodedSrc = decodeHtmlEntities(match[2])
    const localPath = localImagePath(decodedSrc, baseFilePath)
    if (!localPath) continue
    try {
      const dataUrl = await invoke<string>("read_image_as_data_url", { path: localPath })
      const nextTag = match[0].replace(match[2], dataUrl)
      result = result.replace(match[0], nextTag)
    } catch {
      // Leave unresolved images as the preview would.
    }
  }
  return result
}

export async function buildExportFragment(content: string, baseFilePath: string | null) {
  const rendered = renderMathInHtml(renderMarkdownToHtml(content, baseFilePath))
  return inlineLocalImages(rendered, baseFilePath)
}

export async function wrapExportDocument(articleHtml: string) {
  const [fontFace, katex] = await Promise.all([exportFontFace(), inlinedKatexCss()])
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${fontFace}${katex}${EXPORT_STYLE}</style></head><body><article id="export-article">${articleHtml}</article></body></html>`
}
