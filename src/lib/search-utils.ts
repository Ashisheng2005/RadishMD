import type { FileNode } from "@/lib/editor-store"

export interface FileSearchResult {
  fileId: string
  fileName: string
  filePath?: string
  line: number
  content: string
  isActive: boolean
  score: number
  kind: "name" | "content"
}

export interface SearchCorpusFile {
  fileId: string
  fileName: string
  filePath?: string
  content: string
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function buildSnippet(lines: string[], lineIndex: number, query: string) {
  const start = Math.max(0, lineIndex - 1)
  const end = Math.min(lines.length, lineIndex + 2)
  const snippet = lines.slice(start, end).join("\n").trim()

  if (!snippet) {
    return lines[lineIndex] || query
  }

  return snippet
}

function searchInContent(content: string, query: string, maxResults = 10) {
  const lines = content.split("\n")
  const queryPattern = new RegExp(escapeRegExp(query), "i")
  const results: { line: number; content: string }[] = []

  for (let index = 0; index < lines.length; index += 1) {
    if (queryPattern.test(lines[index])) {
      results.push({
        line: index,
        content: buildSnippet(lines, index, query),
      })
      if (results.length >= maxResults) {
        break
      }
    }
  }

  return results
}

function walkNodes(nodes: FileNode[], visitor: (node: FileNode) => void) {
  for (const node of nodes) {
    visitor(node)

    if (node.children?.length) {
      walkNodes(node.children, visitor)
    }
  }
}

export function buildSearchCorpus(nodes: FileNode[]) {
  const corpus: SearchCorpusFile[] = []

  walkNodes(nodes, (node) => {
    if (node.type !== "file") {
      return
    }

    corpus.push({
      fileId: node.id,
      fileName: node.name,
      filePath: node.filePath,
      content: node.content ?? "",
    })
  })

  return corpus
}

export function searchLoadedFiles(nodes: FileNode[], query: string, activeFileId: string | null) {
  return searchCorpus(buildSearchCorpus(nodes), query, activeFileId)
}

export function searchCorpus(
  corpus: SearchCorpusFile[],
  query: string,
  activeFileId: string | null,
) {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return [] as FileSearchResult[]
  }

  const results: FileSearchResult[] = []

  for (const file of corpus) {
    const name = file.fileName.toLowerCase()
    const filePath = file.filePath?.toLowerCase() ?? ""
    const content = file.content

    let baseScore = 0
    let kind: FileSearchResult["kind"] = "content"
    let preview = ""
    let isNameMatch = false

    if (name === normalizedQuery) {
      baseScore += 1000
      kind = "name"
      isNameMatch = true
      preview = file.filePath || file.fileName
    } else if (name.includes(normalizedQuery)) {
      baseScore += 700
      kind = "name"
      isNameMatch = true
      preview = file.filePath || file.fileName
    }

    if (filePath.includes(normalizedQuery)) {
      baseScore += 400
      if (!preview) {
        preview = file.filePath || file.fileName
      }
    }

    // Get all content matches
    const contentMatches = content ? searchInContent(content, normalizedQuery, 10) : []

    if (contentMatches.length > 0) {
      baseScore += 250
      if (!isNameMatch) {
        kind = "content"
      }
    }

    if (baseScore === 0) {
      continue
    }

    if (!preview) {
      preview = file.filePath || file.fileName
    }

    const activeBonus = file.fileId === activeFileId ? 25 : 0

    // Create a result for each content match
    if (contentMatches.length > 0) {
      for (const match of contentMatches) {
        results.push({
          fileId: file.fileId,
          fileName: file.fileName,
          filePath: file.filePath,
          line: match.line,
          content: match.content,
          isActive: file.fileId === activeFileId,
          score: baseScore + activeBonus,
          kind,
        })
      }
    } else {
      // No content match, just create one result for name/path match
      results.push({
        fileId: file.fileId,
        fileName: file.fileName,
        filePath: file.filePath,
        line: 0,
        content: preview,
        isActive: file.fileId === activeFileId,
        score: baseScore + activeBonus,
        kind,
      })
    }
  }

  return results.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }

    if (left.isActive !== right.isActive) {
      return left.isActive ? -1 : 1
    }

    return left.fileName.localeCompare(right.fileName)
  })
}