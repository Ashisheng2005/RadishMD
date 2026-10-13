import { open } from "@tauri-apps/plugin-dialog"
import { getImageAltFromSource } from "./image-utils"
import { isTauriRuntime } from "./runtime"

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"]

export interface MarkdownInsertion {
  text: string
  selection: { start: number; end: number } | null
}

export interface AppliedTextInsertion {
  value: string
  selectionStart: number
  selectionEnd: number
}

export type ImagePickResult =
  | { status: "selected"; path: string }
  | { status: "cancelled" }
  | { status: "unavailable" }

function normalizeLabel(label: string, fallback: string) {
  const collapsed = label.replace(/\s+/g, " ").trim()
  return (collapsed || fallback).replace(/\\/g, "\\\\").replace(/\]/g, "\\]")
}

function isWebDestination(value: string) {
  return /^(https?:|mailto:|data:)/i.test(value)
}

export function formatMarkdownDestination(destination: string) {
  const trimmed = destination.trim()
  const normalized = isWebDestination(trimmed) ? trimmed : trimmed.replace(/\\/g, "/")
  if (!normalized) {
    return "url"
  }

  if (/[\s()<>]/.test(normalized)) {
    return `<${normalized.replace(/</g, "\\<").replace(/>/g, "\\>")}>`
  }

  return normalized
}

export function toDocumentImagePath(absolutePath: string, documentPath?: string | null) {
  const target = absolutePath.replace(/\\/g, "/")
  if (!documentPath) {
    return target
  }

  const document = documentPath.replace(/\\/g, "/")
  const directoryEnd = document.lastIndexOf("/")
  if (directoryEnd < 0) {
    return target
  }

  const directoryParts = document.slice(0, directoryEnd).split("/")
  const targetParts = target.split("/")
  const ignoreCase = /^[A-Za-z]:\//.test(target) || /^[A-Za-z]:\//.test(document) || target.startsWith("//") || document.startsWith("//")
  const same = (left: string, right: string) => ignoreCase ? left.toLowerCase() === right.toLowerCase() : left === right

  let shared = 0
  while (shared < directoryParts.length && shared < targetParts.length && same(directoryParts[shared], targetParts[shared])) {
    shared += 1
  }

  if (shared === 0) {
    return target
  }

  const parentSegments = Array.from({ length: directoryParts.length - shared }, () => "..")
  return [...parentSegments, ...targetParts.slice(shared)].join("/") || "."
}

function buildMarkdown(prefix: "" | "!", label: string, href: string | null, fallbackLabel: string): MarkdownInsertion {
  const safeLabel = normalizeLabel(label, fallbackLabel)
  if (!href) {
    const text = `${prefix}[${safeLabel}](url)`
    const urlStart = text.lastIndexOf("(url)") + 1
    return { text, selection: { start: urlStart, end: urlStart + 3 } }
  }

  return {
    text: `${prefix}[${safeLabel}](${formatMarkdownDestination(href)})`,
    selection: null,
  }
}

export function buildLinkMarkdown(label: string, href: string | null) {
  return buildMarkdown("", label, href, "链接文本")
}

export function buildImageMarkdown(label: string, source: string | null) {
  const alt = label.trim() ? label : source ? getImageAltFromSource(source) : ""
  return buildMarkdown("!", alt, source, "图片描述")
}

export function applyTextInsertion(
  value: string,
  start: number,
  end: number,
  insertion: MarkdownInsertion,
): AppliedTextInsertion {
  const next = value.slice(0, start) + insertion.text + value.slice(end)
  if (!insertion.selection) {
    const cursor = start + insertion.text.length
    return { value: next, selectionStart: cursor, selectionEnd: cursor }
  }

  return {
    value: next,
    selectionStart: start + insertion.selection.start,
    selectionEnd: start + insertion.selection.end,
  }
}

export async function readClipboardText() {
  if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
    return null
  }

  try {
    const text = await navigator.clipboard.readText()
    const line = text.replace(/\r\n/g, "\n").split("\n", 1)[0]?.trim() ?? ""
    return line || null
  } catch (error) {
    console.warn("[RadishMD][clipboard] read failed", error)
    return null
  }
}

export async function pickImageFile(): Promise<ImagePickResult> {
  if (!isTauriRuntime()) {
    return { status: "unavailable" }
  }

  let selected: string | string[] | null
  try {
    selected = await open({
      multiple: false,
      title: "选择图片",
      filters: [{ name: "图片", extensions: IMAGE_EXTENSIONS }],
    })
  } catch (error) {
    console.warn("[RadishMD][image] picker failed", error)
    return { status: "cancelled" }
  }
  if (!selected) {
    return { status: "cancelled" }
  }

  const path = Array.isArray(selected) ? selected[0] : selected
  return path ? { status: "selected", path } : { status: "cancelled" }
}
