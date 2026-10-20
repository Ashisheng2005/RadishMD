import { useEffect, useMemo, useRef, useState } from "react"
import { parseMarkdownHeadings, type MarkdownHeading } from "@/lib/heading-utils"
import { useEditorStore } from "@/lib/editor-store"
import { jumpToHeading, measureTextareaLineTop } from "./outline"

const HIT = 12
const PREFERRED_STEP = 20
const TRACK_TOP = 40
const TRACK_BOTTOM = 32

function sectionHeadings(content: string) {
  return parseMarkdownHeadings(content).filter((heading) => heading.level <= 2)
}

function lineCountOf(content: string) {
  return content.replace(/\r\n?/g, "\n").split("\n").length
}

function findScroller(
  editMode: "split" | "wysiwyg",
  splitViewMode: "split" | "editor" | "render",
  contentType: "markdown" | "pdf",
) {
  if (contentType === "pdf") return null
  if (editMode === "split" && splitViewMode === "editor") {
    return document.querySelector("[data-editor-textarea]") as HTMLElement | null
  }
  return document.querySelector("[data-editor-scroll-container]") as HTMLElement | null
}

function placeTops(headings: MarkdownHeading[], lines: number, height: number) {
  if (headings.length === 0 || height <= HIT) return []
  const packed = (headings.length - 1) * PREFERRED_STEP + HIT
  if (packed <= height) {
    const offset = (height - packed) / 2
    return headings.map((_, index) => offset + index * PREFERRED_STEP)
  }

  const maxTop = height - HIT
  const minStep = Math.min(PREFERRED_STEP, maxTop / (headings.length - 1))
  const lastLine = Math.max(1, lines - 1)
  const tops = headings.map((heading) => Math.min(maxTop, Math.max(0, (heading.lineIndex / lastLine) * maxTop)))

  for (let index = 1; index < tops.length; index += 1) {
    tops[index] = Math.max(tops[index], tops[index - 1] + minStep)
  }
  if (tops[tops.length - 1] > maxTop) {
    tops[tops.length - 1] = maxTop
    for (let index = tops.length - 2; index >= 0; index -= 1) {
      tops[index] = Math.min(tops[index], tops[index + 1] - minStep)
    }
  }
  return tops.map((top) => Math.min(maxTop, Math.max(0, top)))
}

function activeFromScroll(scroller: HTMLElement, headings: MarkdownHeading[], lines: number) {
  const threshold = scroller.getBoundingClientRect().top + 24
  let active = headings[0]?.lineIndex ?? -1
  let found = false

  for (const heading of headings) {
    const element = scroller.querySelector(`[data-source-line="${heading.lineIndex}"]`)
    if (!(element instanceof HTMLElement) || element.getBoundingClientRect().height <= 0) continue
    found = true
    if (element.getBoundingClientRect().top <= threshold) active = heading.lineIndex
    else break
  }
  if (found) return active

  const span = Math.max(1, scroller.scrollHeight - scroller.clientHeight)
  const marker = (scroller.scrollTop / span) * Math.max(1, lines - 1)
  for (const heading of headings) {
    if (heading.lineIndex <= marker) active = heading.lineIndex
    else break
  }
  return active
}

function activeFromOffsets(scrollTop: number, offsets: Array<{ lineIndex: number; top: number }>) {
  let active = offsets[0]?.lineIndex ?? -1
  const marker = scrollTop + 24
  for (const offset of offsets) {
    if (offset.top <= marker) active = offset.lineIndex
    else break
  }
  return active
}

export function SectionRail() {
  const content = useEditorStore((state) => state.content)
  const editMode = useEditorStore((state) => state.editMode)
  const splitViewMode = useEditorStore((state) => state.splitViewMode)
  const contentType = useEditorStore((state) => state.contentType)
  const isOutlineOpen = useEditorStore((state) => state.isOutlineOpen)
  const activeFileId = useEditorStore((state) => state.activeFileId)
  const headings = useMemo(() => sectionHeadings(content), [content])
  const lines = useMemo(() => lineCountOf(content), [content])
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const [canScroll, setCanScroll] = useState(false)
  const [railHeight, setRailHeight] = useState(0)
  const [activeLine, setActiveLine] = useState(-1)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [labelOn, setLabelOn] = useState(false)
  const [labelMoves, setLabelMoves] = useState(false)
  const [pressedLine, setPressedLine] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  const [shown, setShown] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  const hostRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef<Array<{ lineIndex: number; top: number }>>([])
  const hideTimerRef = useRef(0)
  const unmountTimerRef = useRef(0)
  const labelOpenRef = useRef(false)
  const sourceMode = editMode === "split" && splitViewMode === "editor"
  const visible = !isOutlineOpen && contentType !== "pdf" && headings.length >= 2 && canScroll
  const tops = placeTops(headings, lines, Math.max(0, railHeight - TRACK_TOP - TRACK_BOTTOM))
    .map((top) => top + TRACK_TOP)

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const onChange = () => setReduceMotion(media.matches)
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  useEffect(() => {
    const next = findScroller(editMode, splitViewMode, contentType)
    setScroller(next)
    if (!next) {
      setCanScroll(false)
      return
    }

    const update = () => {
      setCanScroll(next.scrollHeight > next.clientHeight + 1)
    }
    update()
    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(next)
    const observeChildren = () => {
      next.querySelectorAll(":scope > *").forEach((child) => resizeObserver.observe(child))
    }
    observeChildren()
    const mutationObserver = new MutationObserver(() => {
      observeChildren()
      update()
    })
    mutationObserver.observe(next, { childList: true })

    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [editMode, splitViewMode, contentType, activeFileId, content])

  useEffect(() => {
    if (!sourceMode || !(scroller instanceof HTMLTextAreaElement)) {
      offsetRef.current = []
      return
    }

    const textarea = scroller
    let timer = 0
    const measure = () => {
      offsetRef.current = headings.map((heading) => ({
        lineIndex: heading.lineIndex,
        top: measureTextareaLineTop(textarea, content, heading.lineIndex),
      }))
      setActiveLine(activeFromOffsets(textarea.scrollTop, offsetRef.current))
    }
    timer = window.setTimeout(measure, offsetRef.current.length === headings.length ? 200 : 0)
    const resizeObserver = new ResizeObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(measure, 200)
    })
    resizeObserver.observe(textarea)

    return () => {
      window.clearTimeout(timer)
      resizeObserver.disconnect()
    }
  }, [sourceMode, scroller, headings, content])

  useEffect(() => {
    if (!scroller || !visible) return
    let frame = 0
    const update = () => {
      frame = 0
      const element = scroller
      if (sourceMode) {
        setActiveLine(activeFromOffsets(element.scrollTop, offsetRef.current))
        return
      }
      setActiveLine(activeFromScroll(element, headings, lines))
    }
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(update)
    }
    onScroll()
    scroller.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      scroller.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [scroller, visible, headings, lines, sourceMode])

  useEffect(() => {
    if (visible) {
      setMounted(true)
      const frame = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(frame)
    }
    setShown(false)
    const timer = window.setTimeout(() => setMounted(false), reduceMotion ? 0 : 120)
    return () => window.clearTimeout(timer)
  }, [visible, reduceMotion])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const update = () => setRailHeight(host.clientHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(host)
    return () => observer.disconnect()
  }, [mounted])

  useEffect(() => () => {
    window.clearTimeout(hideTimerRef.current)
    window.clearTimeout(unmountTimerRef.current)
  }, [])

  const showLabel = (index: number) => {
    window.clearTimeout(hideTimerRef.current)
    window.clearTimeout(unmountTimerRef.current)
    const opening = !labelOpenRef.current
    labelOpenRef.current = true
    setHoverIndex(index)
    if (!opening) {
      setLabelOn(true)
      setLabelMoves(true)
      return
    }
    setLabelMoves(false)
    setLabelOn(false)
    requestAnimationFrame(() => {
      setLabelOn(true)
      requestAnimationFrame(() => setLabelMoves(true))
    })
  }

  const scheduleHide = () => {
    window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => {
      labelOpenRef.current = false
      setLabelMoves(false)
      setLabelOn(false)
      unmountTimerRef.current = window.setTimeout(() => setHoverIndex(null), reduceMotion ? 0 : 100)
    }, reduceMotion ? 0 : 80)
  }

  if (!mounted) return null

  const hoverHeading = hoverIndex === null ? null : headings[hoverIndex]
  const hoverTop = hoverIndex === null ? 0 : tops[hoverIndex] ?? 0
  const labelTop = Math.min(Math.max(16, hoverTop + HIT / 2), Math.max(16, railHeight - 16))

  return (
    <div
      ref={hostRef}
      className="pointer-events-none fixed inset-y-0 right-0 z-30"
      style={{
        opacity: shown ? 1 : 0,
        transition: reduceMotion ? "none" : `opacity ${shown ? 180 : 120}ms ease-out`,
      }}
    >
      {hoverHeading && (
        <div
          className="pointer-events-none absolute right-10 max-w-[220px] truncate rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm"
          style={{
            top: labelTop,
            transform: "translateY(-50%)",
            opacity: labelOn ? 1 : 0,
            transition: reduceMotion
              ? "none"
              : `opacity ${labelOn ? 140 : 100}ms ease-out${labelMoves ? ", top 120ms ease-out" : ""}`,
          }}
        >
          {hoverHeading.text}
        </div>
      )}
      {headings.map((heading, index) => {
        const active = heading.lineIndex === activeLine
        const hovered = index === hoverIndex
        const pressed = heading.lineIndex === pressedLine
        const width = heading.level === 1 ? (active ? 20 : 16) : (active ? 14 : 10)
        return (
          <button
            key={heading.lineIndex}
            type="button"
            aria-label={heading.text}
            className="pointer-events-auto absolute right-2 flex items-center justify-end"
            style={{ top: tops[index] ?? 0, height: HIT, width: 28 }}
            onMouseEnter={() => showLabel(index)}
            onMouseLeave={scheduleHide}
            onPointerDown={() => setPressedLine(heading.lineIndex)}
            onPointerUp={() => setPressedLine(null)}
            onPointerCancel={() => setPressedLine(null)}
            onClick={() => {
              const state = useEditorStore.getState()
              jumpToHeading(heading, state.content, state.editMode, state.splitViewMode)
            }}
          >
            <span
              className="block rounded-[1px] bg-foreground"
              style={{
                width,
                height: active ? 4 : 3,
                opacity: pressed ? 0.5 : active ? 1 : hovered ? 0.75 : 0.35,
                transition: reduceMotion
                  ? "opacity 160ms ease-out"
                  : "width 160ms ease-out, height 160ms ease-out, opacity 160ms ease-out",
              }}
            />
          </button>
        )
      })}
    </div>
  )
}
