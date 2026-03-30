import { renderMarkdownToHtmlChunks, type MarkdownRenderChunk } from "../lib/markdown-render"

type MarkdownRenderRequest =
  | {
      type: "render"
      requestId: number
      content: string
      activeFilePath: string | null
    }

type MarkdownRenderResponse =
  | {
      type: "ready"
    }
  | {
      type: "chunks"
      requestId: number
      chunks: MarkdownRenderChunk[]
    }

type MarkdownRenderWorkerScope = {
  postMessage: (message: MarkdownRenderResponse) => void
  onmessage: ((event: MessageEvent<MarkdownRenderRequest>) => void) | null
}

const workerGlobal = self as unknown as MarkdownRenderWorkerScope
const renderCache = new Map<string, string>()

workerGlobal.postMessage({ type: "ready" } satisfies MarkdownRenderResponse)

workerGlobal.onmessage = (event: MessageEvent<MarkdownRenderRequest>) => {
  const message = event.data

  if (message.type !== "render") {
    return
  }

  const chunks = renderMarkdownToHtmlChunks(message.content, message.activeFilePath, renderCache)
  workerGlobal.postMessage({
    type: "chunks",
    requestId: message.requestId,
    chunks,
  } satisfies MarkdownRenderResponse)
}
