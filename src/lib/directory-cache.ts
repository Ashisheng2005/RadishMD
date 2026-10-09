export interface CachedDirectoryEntry {
  name: string
  path: string
  is_directory: boolean
}

const entriesByDirectory = new Map<string, CachedDirectoryEntry[]>()

function cacheKey(path: string) {
  const trimmed = path.trim()
  const isUnc = /^[\\/]{2}/.test(trimmed)
  const raw = trimmed.replace(/\\/g, "/")
  const normalized = isUnc ? `//${raw.slice(2).replace(/\/{2,}/g, "/")}` : raw.replace(/\/{2,}/g, "/")
  const isRoot = normalized === "/" || /^[A-Za-z]:\/$/.test(normalized)
  const withoutTrailingSlash = isRoot ? normalized : normalized.replace(/\/$/, "")
  return /^[A-Za-z]:\//.test(withoutTrailingSlash) || isUnc
    ? withoutTrailingSlash.toLowerCase()
    : withoutTrailingSlash
}

export function getCachedDirectoryEntries(path: string) {
  const entries = entriesByDirectory.get(cacheKey(path))
  return entries ? entries.map((entry) => ({ ...entry })) : null
}

export function setCachedDirectoryEntries(path: string, entries: CachedDirectoryEntry[]) {
  entriesByDirectory.set(cacheKey(path), entries.map((entry) => ({ ...entry })))
}

export function invalidateDirectoryCache(path: string) {
  const key = cacheKey(path)
  const lastSlash = key.replace(/\/$/, "").lastIndexOf("/")
  if (lastSlash >= 0) {
    // Keep POSIX and drive roots intact when invalidating their direct child.
    const parent = key.slice(0, lastSlash + 1)
    entriesByDirectory.delete(cacheKey(parent))
  }
  const prefix = key.endsWith("/") ? key : `${key}/`
  for (const cachedKey of entriesByDirectory.keys()) {
    if (cachedKey === key || cachedKey.startsWith(prefix)) {
      entriesByDirectory.delete(cachedKey)
    }
  }
}

export function clearDirectoryCache() {
  entriesByDirectory.clear()
}
