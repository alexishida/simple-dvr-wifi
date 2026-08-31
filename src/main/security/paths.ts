import { normalize, relative, resolve } from 'node:path'

export function isPathInside(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate)
  return pathFromRoot !== '' && !pathFromRoot.startsWith('..') && !pathFromRoot.includes(':')
}

function containsParentSegment(value: string): boolean {
  const segments = value.split(/[/\\]+/)
  return segments.includes('..')
}

export function resolveRenderAsset(root: string, rawUrl: string): string | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  if (url.hostname !== 'renderer' || url.search || url.hash) {
    return null
  }

  let decodedPathname: string
  try {
    decodedPathname = decodeURIComponent(url.pathname)
  } catch {
    return null
  }

  if (containsParentSegment(decodedPathname)) {
    return null
  }

  const requestedPath = normalize(decodedPathname).replace(/^[/\\]+/, '')
  const assetPath = resolve(root, requestedPath || 'index.html')

  if (!isPathInside(root, assetPath)) {
    return null
  }

  return assetPath
}
