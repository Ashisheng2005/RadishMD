import { convertFileSrc } from "@tauri-apps/api/core"

const IMAGE_EXTENSIONS = /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)(?:[?#].*)?$/i

// Simplified normalizeFilePath - does not depend on window or other main-thread-only APIs
function normalizeFilePath(filePath: string) {
  const trimmedPath = filePath.trim()

  if (!trimmedPath || !trimmedPath.startsWith("file://")) {
    return trimmedPath
  }

  try {
    const parsedUrl = new URL(trimmedPath)
    const decodedPath = decodeURIComponent(parsedUrl.pathname)

    if (parsedUrl.host && parsedUrl.host !== "localhost") {
      return `//${parsedUrl.host}${decodedPath}`
    }

    if (/^\/[A-Za-z]:\//.test(decodedPath)) {
      return decodedPath.slice(1)
    }

    return decodedPath
  } catch {
    return trimmedPath
  }
}

const IMAGE_URL_QUERY_KEYS = ["mediaurl", "imgurl", "imageurl", "img", "src", "url"]

function tryExtractDirectImageUrl(source: string) {
  try {
    const parsedUrl = new URL(source)

    for (const key of IMAGE_URL_QUERY_KEYS) {
      const candidate = parsedUrl.searchParams.get(key)
      if (!candidate) {
        continue
      }

      try {
        const decodedCandidate = decodeURIComponent(candidate)
        if (/^data:image\//i.test(decodedCandidate) || IMAGE_EXTENSIONS.test(decodedCandidate)) {
          return decodedCandidate
        }
        return decodedCandidate
      } catch {
        return candidate
      }
    }
  } catch {
    return null
  }

  return null
}

export function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function parseImageReference(value: string, requireExclamation = false): { alt: string; src: string } | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const markdownPattern = requireExclamation ? /^!\[([^\]]*)\]\(([^)]+)\)$/ : /^!?\[([^\]]*)\]\(([^)]+)\)$/
  const markdownMatch = trimmed.match(markdownPattern)
  if (markdownMatch?.[2]) {
    // If requireExclamation is true, only match if ! is present
    if (requireExclamation && !markdownMatch[0].startsWith('!')) {
      return null
    }
    return {
      alt: markdownMatch[1] || "图片",
      src: markdownMatch[2],
    }
  }

  const shorthandPattern = requireExclamation ? /^!?([^\[\]\(\)（）\n]+)[（(]([^()（）\n]+)[)）]$/ : /^!?([^\[\]\(\)（）\n]+)[（(]([^()（）\n]+)[)）]$/
  const shorthandMatch = trimmed.match(shorthandPattern)
  if (shorthandMatch?.[2]) {
    // If requireExclamation is true, only match if ! is present
    if (requireExclamation && !shorthandMatch[0].startsWith('!')) {
      return null
    }
    return {
      alt: shorthandMatch[1].trim() || "图片",
      src: shorthandMatch[2].trim(),
    }
  }

  if (/^data:image\//i.test(trimmed) || IMAGE_EXTENSIONS.test(trimmed)) {
    return {
      alt: "图片",
      src: trimmed,
    }
  }

  const directImageUrl = tryExtractDirectImageUrl(trimmed)
  if (directImageUrl) {
    return {
      alt: "图片",
      src: directImageUrl,
    }
  }

  return null
}

export function isStandaloneImageReference(value: string) {
  return parseImageReference(value) !== null
}

// Resolve local image paths to Tauri asset URLs
export function resolveImageSource(source: string, baseFilePath?: string | null): string {
  // Already an absolute URL, data URI, or asset URL - return as-is
  if (
    source.startsWith("data:") ||
    source.startsWith("asset://") ||
    source.startsWith("http://") ||
    source.startsWith("https://") ||
    source.startsWith("file://")
  ) {
    return source
  }

  // Relative path - convert to asset URL using baseFilePath
  if (baseFilePath) {
    // Calculate the directory of the base file
    const lastSlash = Math.max(baseFilePath.lastIndexOf("/"), baseFilePath.lastIndexOf("\\"))
    const baseDir = lastSlash > 0 ? baseFilePath.substring(0, lastSlash) : ""
    // Combine with source to get absolute path
    const absolutePath = baseDir ? `${baseDir}/${source}` : source
    const normalizedPath = normalizeFilePath(absolutePath)
    return convertFileSrc(normalizedPath)
  }

  // No baseFilePath - return original source
  return source
}

export function getImageAltFromSource(source: string) {
  const resolvedSource = resolveImageSource(source)
  const cleanedSource = resolvedSource.split(/[?#]/)[0]
  const fileName = cleanedSource.split(/[\\/]/).pop()?.trim()
  if (!fileName) {
    return "图片"
  }

  return fileName.replace(/\.[^.]+$/, "") || "图片"
}

export function buildImageTag(source: string, alt: string, _baseFilePath?: string | null) {
  // Note: Image path resolution (convertFileSrc) happens in the main thread via resolveImagePathsInHtml()
  // This function just builds the img tag with the raw source - let the main thread post-process the paths
  return `<img src="${escapeHtmlAttribute(source)}" alt="${escapeHtmlAttribute(alt)}" class="max-w-full rounded-md my-4" />`
}

export function extractImageSourceFromClipboard(html: string, text: string) {
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (imgMatch?.[1]) {
    return imgMatch[1]
  }

  const parsedReference = parseImageReference(text)
  if (parsedReference) {
    return parsedReference.src
  }

  return null
}