import { dialog } from 'electron'
import { app } from 'electron'
import { resolve } from 'node:path'
import {
  assertWritableDirectory,
  resolveAllowedDirectory,
  type DirectoryResolutionError,
} from '../security/directories.js'
import { homedir } from 'node:os'

export class DirectoryService {
  private readonly allowedRoots: string[]

  constructor() {
    const userData = app.getPath('userData')
    this.allowedRoots = [userData, resolve(homedir())]
  }

  async selectAndValidateDirectory(defaultPath: string): Promise<{ path: string } | null> {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      defaultPath,
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    const path = resolveAllowedDirectory(result.filePaths[0] as string, this.allowedRoots)
    await assertWritableDirectory(path)
    return { path }
  }

  async validateDirectory(
    rawPath: string,
  ): Promise<{ ok: true; path: string } | { ok: false; code: string }> {
    try {
      const path = resolveAllowedDirectory(rawPath, this.allowedRoots)
      await assertWritableDirectory(path)
      return { ok: true, path }
    } catch (error) {
      return { ok: false, code: (error as DirectoryResolutionError).code ?? 'NOT_FOUND' }
    }
  }
}
