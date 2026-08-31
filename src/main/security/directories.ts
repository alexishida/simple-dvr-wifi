import { isAbsolute, relative, resolve, sep } from 'node:path'
import { access, stat } from 'node:fs/promises'
import { constants } from 'node:fs'

export class DirectoryResolutionError extends Error {
  constructor(
    message: string,
    public readonly code: 'TRAVERSAL' | 'NOT_A_DIRECTORY' | 'PERMISSION' | 'NOT_FOUND',
  ) {
    super(message)
  }
}

function isPathInside(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate)
  return (
    fromRoot !== '' &&
    !fromRoot.startsWith('..') &&
    !isAbsolute(fromRoot) &&
    !fromRoot.includes(`${sep}..`)
  )
}

export function resolveAllowedDirectory(rawPath: string, allowedRoots: string[]): string {
  if (!rawPath.trim()) {
    throw new DirectoryResolutionError('Caminho vazio.', 'NOT_FOUND')
  }

  const resolved = resolve(rawPath)

  const allowed = allowedRoots.some((root) => isPathInside(resolve(root), resolved))
  if (!allowed) {
    throw new DirectoryResolutionError('Caminho fora das raízes autorizadas.', 'TRAVERSAL')
  }

  return resolved
}

export function hasTraversalSegment(rawPath: string): boolean {
  const segments = rawPath.split(/[/\\]+/)
  return segments.includes('..')
}

export async function assertWritableDirectory(dirPath: string): Promise<void> {
  let fileStat
  try {
    fileStat = await stat(dirPath)
  } catch {
    throw new DirectoryResolutionError('Diretório não encontrado.', 'NOT_FOUND')
  }

  if (!fileStat.isDirectory()) {
    throw new DirectoryResolutionError('O caminho não é um diretório.', 'NOT_A_DIRECTORY')
  }

  try {
    await access(dirPath, constants.W_OK)
  } catch {
    throw new DirectoryResolutionError('Sem permissão de escrita.', 'PERMISSION')
  }
}
