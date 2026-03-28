const IMAGE_EXTENSIONS = /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)(?:[?#].*)?$/i

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

export function parseImageReference(value: string): { alt: string; src: string } | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const markdownMatch = trimmed.match(/^!?\[([^\]]*)\]\(([^)]+)\)$/)
  if (markdownMatch?.[2]) {
    return {
      alt: markdownMatch[1] || "图片",
      src: markdownMatch[2],
    }
  }

  const shorthandMatch = trimmed.match(/^!?([^\[\]\(\)（）\n]+)[（(]([^()（）\n]+)[)）]$/)
  if (shorthandMatch?.[2]) {
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

export function resolveImageSource(source: string, baseFilePath?: string | null) {
  const trimmedSource = source.trim()

  const directImageUrl = tryExtractDirectImageUrl(trimmedSource)
  if (directImageUrl) {
    return directImageUrl
  }

  if (
    /^([a-zA-Z][a-zA-Z\d+.-]*:)?\/\//.test(trimmedSource) ||
    /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmedSource) ||
    trimmedSource.startsWith("data:")
  ) {
    return trimmedSource
  }

  if (!baseFilePath) {
    return trimmedSource
  }

  const normalizedBase = baseFilePath.replace(/\\/g, "/").replace(/\/[^/]*$/, "/")
  const baseUrl = /^[a-zA-Z]:\//.test(normalizedBase)
    ? `file:///${normalizedBase}`
    : `file://${normalizedBase}`

  try {
    return new URL(trimmedSource, baseUrl).href
  } catch {
    return trimmedSource
  }
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

export function buildImageTag(source: string, alt: string, baseFilePath?: string | null) {
  const resolvedSource = resolveImageSource(source, baseFilePath)
  return `<img src="${escapeHtmlAttribute(resolvedSource)}" alt="${escapeHtmlAttribute(alt)}" class="max-w-full rounded-md my-4" />`
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