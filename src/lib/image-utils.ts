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

  const markdownPattern = requireExclamation
    ? /^!\[([^\]]*)\]\((<[^>\n]*>|[^)]+)\)$/
    : /^!?\[([^\]]*)\]\((<[^>\n]*>|[^)]+)\)$/
  const markdownMatch = trimmed.match(markdownPattern)
  if (markdownMatch?.[2]) {
    // If requireExclamation is true, only match if ! is present
    if (requireExclamation && !markdownMatch[0].startsWith('!')) {
      return null
    }
    return {
      alt: markdownMatch[1] || "图片",
      src: unwrapImageSource(markdownMatch[2]),
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

function unwrapImageSource(source: string) {
  let value = source.trim()

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const wrappedInQuotes = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
    const wrappedInBrackets = value.startsWith("<") && value.endsWith(">")
    if ((!wrappedInQuotes && !wrappedInBrackets) || value.length < 2) {
      break
    }

    value = value.slice(1, -1).trim()
  }

  return value
}

function isWebSource(source: string) {
  return (
    source.startsWith("data:") ||
    source.startsWith("asset://") ||
    source.startsWith("http://") ||
    source.startsWith("https://") ||
    source.startsWith("//")
  )
}

function isWindowsRuntime() {
  return typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent)
}

function isAbsoluteLocalPath(filePath: string) {
  if (/^[A-Za-z]:[\\/]/.test(filePath) || filePath.startsWith("\\\\")) {
    return true
  }

  return !isWindowsRuntime() && filePath.startsWith("/")
}

function directoryOf(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/")
  const separatorIndex = normalized.lastIndexOf("/")
  if (separatorIndex < 0) {
    return ""
  }

  return normalized.slice(0, separatorIndex)
}

function joinLocalPath(baseDir: string, relativePath: string) {
  const base = baseDir.replace(/[\\/]+$/, "")
  const relative = relativePath.replace(/^[\\/]+/, "")
  if (!base) {
    return relative
  }

  return `${base}/${relative}`
}

function normalizeLocalPath(filePath: string) {
  const unified = filePath.replace(/\\/g, "/")
  const unc = unified.startsWith("//")
  const driveMatch = unified.match(/^([A-Za-z]:)(?:\/|$)/)
  const rooted = unc || Boolean(driveMatch) || unified.startsWith("/")
  const stack: string[] = []

  for (const segment of unified.split("/")) {
    if (!segment || segment === ".") {
      continue
    }

    const top = stack[stack.length - 1]
    const topIsDrive = Boolean(top && /^[A-Za-z]:$/.test(top))
    if (segment === "..") {
      if (stack.length > 0 && !topIsDrive && top !== "..") {
        stack.pop()
      } else if (!rooted) {
        stack.push("..")
      }
      continue
    }

    stack.push(segment)
  }

  if (driveMatch) {
    const rest = stack[0] && /^[A-Za-z]:$/.test(stack[0]) ? stack.slice(1) : stack
    return `${driveMatch[1]}/${rest.join("/")}`
  }

  if (unc) {
    return `//${stack.join("/")}`
  }

  if (unified.startsWith("/")) {
    return `/${stack.join("/")}`
  }

  return stack.join("/")
}

// Turn a markdown image source into a local filesystem path.
// Remote URLs and relative paths without a saved document stay unresolved.
function toLocalImagePath(source: string, baseFilePath?: string | null) {
  let path = unwrapImageSource(source)
  if (!path || isWebSource(path)) {
    return null
  }

  if (path.startsWith("file://")) {
    path = normalizeFilePath(path)
  }

  if (!path || isWebSource(path)) {
    return null
  }

  if (!isAbsoluteLocalPath(path)) {
    if (!baseFilePath) {
      return null
    }

    const baseDir = directoryOf(baseFilePath)
    if (!baseDir) {
      return null
    }

    path = joinLocalPath(baseDir, path)
  }

  return normalizeLocalPath(path) || null
}

function toWebviewAssetUrl(filePath: string) {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return filePath
  }

  try {
    return convertFileSrc(filePath)
  } catch {
    return filePath
  }
}

// Resolve local image paths to Tauri asset URLs.
// Windows absolute paths such as C:\...\a.png must not be joined onto the markdown directory.
export function resolveImageSource(source: string, baseFilePath?: string | null): string {
  const prepared = unwrapImageSource(source)
  if (!prepared) {
    return source
  }

  if (isWebSource(prepared)) {
    return prepared
  }

  const localPath = toLocalImagePath(prepared, baseFilePath)
  if (!localPath) {
    return prepared
  }

  return toWebviewAssetUrl(localPath)
}

export function getImageAltFromSource(source: string) {
  const prepared = unwrapImageSource(source)
  const localPath = toLocalImagePath(prepared) ?? prepared
  const cleanedSource = localPath.split(/[?#]/)[0]
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