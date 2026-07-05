export interface MarkdownHeading {
  level: 1 | 2 | 3 | 4 | 5 | 6
  text: string
  lineIndex: number
}

export function parseMarkdownHeadingLine(line: string): Omit<MarkdownHeading, "lineIndex"> | null {
  const normalizedLine = line.replace(/^\uFEFF/, "")
  const match = normalizedLine.match(/^[ \t]{0,3}(#{1,6})(.*)$/)

  if (!match) {
    return null
  }

  const marker = match[1]
  const rawText = match[2]

  if (rawText.startsWith("#")) {
    return null
  }

  const text = rawText
    .trim()
    .replace(/[ \t]+#{1,}[ \t]*$/, "")
    .replace(/^#{1,6}[ \t]*/, "")
    .trim()

  if (!text) {
    return null
  }

  return {
    level: marker.length as MarkdownHeading["level"],
    text,
  }
}

export function parseMarkdownHeadings(markdown: string): MarkdownHeading[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n")
  const headings: MarkdownHeading[] = []
  let inCodeBlock = false

  lines.forEach((line, lineIndex) => {
    if (/^[ \t]{0,3}```/.test(line)) {
      inCodeBlock = !inCodeBlock
      return
    }

    if (inCodeBlock) {
      return
    }

    const heading = parseMarkdownHeadingLine(line)
    if (heading) {
      headings.push({ ...heading, lineIndex })
    }
  })

  return headings
}
