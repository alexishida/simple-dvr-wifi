import {
  OnvifAdapter,
  type OnvifClientOptions,
} from '../../workers/camera/onvif-adapter.js'
import type { CameraOnvifInfo } from '../../workers/camera/adapter.js'

export async function connectOnvifPtz(
  options: OnvifClientOptions,
  discoverySignal = AbortSignal.timeout(12_000),
): Promise<{ adapter: OnvifAdapter; info: CameraOnvifInfo }> {
  let discovering = true
  const adapter = new OnvifAdapter({
    ...options,
    transport: {
      post: (url, body, requestOptions) => {
        // The adapter is cached for movement and stop commands after discovery.
        // Only discovery requests may inherit this connection-wide deadline.
        if (!discovering) return options.transport.post(url, body, requestOptions)
        discoverySignal.throwIfAborted()
        const signal = requestOptions?.signal
          ? AbortSignal.any([requestOptions.signal, discoverySignal])
          : discoverySignal
        return options.transport.post(url, body, { ...requestOptions, signal })
      },
    },
  })
  try {
    const info = await adapter.detect()
    if (discoverySignal.aborted) {
      throw new Error('A câmera demorou para responder ao controle PTZ. Tente conectar novamente.')
    }
    return { adapter, info }
  } finally {
    discovering = false
  }
}
