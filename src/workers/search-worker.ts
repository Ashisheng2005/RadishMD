import { searchCorpus, type FileSearchResult, type SearchCorpusFile } from "@/lib/search-utils"

type SearchWorkerMessage =
  | {
      type: "set-files"
      files: SearchCorpusFile[]
    }
  | {
      type: "search"
      requestId: number
      query: string
      activeFileId: string | null
    }

type SearchWorkerResponse =
  | {
      type: "ready"
    }
  | {
      type: "results"
      requestId: number
      results: FileSearchResult[]
    }

let corpus: SearchCorpusFile[] = []

self.postMessage({ type: "ready" } satisfies SearchWorkerResponse)

self.onmessage = (event: MessageEvent<SearchWorkerMessage>) => {
  const message = event.data

  if (message.type === "set-files") {
    corpus = message.files
    return
  }

  if (message.type === "search") {
    const results = searchCorpus(corpus, message.query, message.activeFileId)
    self.postMessage({
      type: "results",
      requestId: message.requestId,
      results,
    } satisfies SearchWorkerResponse)
  }
}
