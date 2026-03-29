export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export async function openExternalTarget(target: string) {
  if (!target) {
    return
  }

  const isProbablyUrl = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(target)

  if (!isTauriRuntime()) {
    if (isProbablyUrl && typeof window !== "undefined") {
      window.open(target, "_blank", "noopener,noreferrer")
    }

    return
  }

  const { openPath, openUrl } = await import("@tauri-apps/plugin-opener")

  if (isProbablyUrl) {
    await openUrl(target)
    return
  }

  await openPath(target)
}