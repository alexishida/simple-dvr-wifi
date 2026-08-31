import type { WebContents } from 'electron'
import { is } from '@electron-toolkit/utils'
import {
  PACKAGED_RENDERER_ORIGIN,
  isAllowedNavigationUrl,
  devServerOrigin,
} from './navigation-urls.js'

export {
  PACKAGED_RENDERER_ORIGIN,
  isAllowedNavigationUrl,
  devServerOrigin,
} from './navigation-urls.js'

function allowedNavigationOrigins(): string[] {
  const origins = [PACKAGED_RENDERER_ORIGIN]
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    const origin = devServerOrigin(process.env.ELECTRON_RENDERER_URL)
    if (origin) origins.push(origin)
  }
  return origins
}

export function configureNavigationSecurity(contents: WebContents): void {
  const origins = allowedNavigationOrigins()

  contents.setWindowOpenHandler(() => ({ action: 'deny' }))

  contents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigationUrl(url, origins)) {
      event.preventDefault()
    }
  })

  contents.on('will-attach-webview', (event) => event.preventDefault())
}
