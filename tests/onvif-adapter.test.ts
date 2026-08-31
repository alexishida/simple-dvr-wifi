import { describe, expect, it } from 'vitest'
import { OnvifAdapter, type OnvifTransport } from '../src/workers/camera/onvif-adapter.js'

const DEVICE_INFO = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body><GetDeviceInformationResponse>
    <Manufacturer>Acme</Manufacturer>
    <Model>Cam-100</Model>
    <FirmwareVersion>1.2.3</FirmwareVersion>
    <SerialNumber>SN-12345</SerialNumber>
  </GetDeviceInformationResponse></s:Body>
</s:Envelope>`

const CAPABILITIES = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body><GetCapabilitiesResponse><Capabilities>
    <Media XAddr="http://cam.local/onvif/media_service"/>
  </Capabilities></GetCapabilitiesResponse></s:Body>
</s:Envelope>`

const PROFILES_COMPLETE = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body><GetProfilesResponse>
    <Profiles token="main_profile">
      <Name>Main Stream</Name>
      <VideoEncoderConfiguration Encoding="H264" Width="1920" Height="1080" FrameRate="30"/>
      <VideoSourceConfiguration Width="1920" Height="1080"/>
      <PTZConfiguration token="ptz1"/>
    </Profiles>
    <Profiles token="sub_profile">
      <Name>Secondary Stream</Name>
      <VideoEncoderConfiguration Encoding="H264" Width="640" Height="360" FrameRate="15"/>
    </Profiles>
  </GetProfilesResponse></s:Body>
</s:Envelope>`

const PROFILES_MJPEG = PROFILES_COMPLETE.replace(
  '<VideoEncoderConfiguration Encoding="H264" Width="1920" Height="1080" FrameRate="30"/>',
  '<VideoEncoderConfiguration Encoding="MJPEG" Width="1280" Height="720" FrameRate="25"/>',
)

function fullTransport(): OnvifTransport {
  let call = 0
  return {
    post: async () => {
      call++
      if (call === 1) return { status: 200, body: DEVICE_INFO }
      if (call === 2) return { status: 200, body: CAPABILITIES }
      return { status: 200, body: PROFILES_COMPLETE }
    },
  }
}

describe('ONVIF adapter', () => {
  it('detects identity, services, profiles and codecs from complete fixtures', async () => {
    const adapter = new OnvifAdapter({
      deviceServiceUrl: 'http://cam.local/onvif/device_service',
      transport: fullTransport(),
    })

    const info = await adapter.detect()

    expect(info.identity).toEqual({
      manufacturer: 'Acme',
      model: 'Cam-100',
      firmwareVersion: '1.2.3',
      serialNumber: 'SN-12345',
    })
    expect(info.mediaServiceUrl).toBe('http://cam.local/onvif/media_service')
    expect(info.profiles).toHaveLength(2)

    const main = info.profiles[0]
    expect(main).toMatchObject({
      streamType: 'main',
      codec: 'H264',
      width: 1920,
      height: 1080,
      fps: 30,
    })
    const sub = info.profiles[1]
    expect(sub).toMatchObject({
      streamType: 'sub',
      codec: 'H264',
      width: 640,
      height: 360,
      fps: 15,
    })

    expect(info.ptzSupported).toBe(true)
    expect(info.capabilities.h264).toBe('supported')
    expect(info.capabilities.h265).toBe('unsupported')
  })

  it('preserves valid data when Media response is incomplete', async () => {
    let call = 0
    const transport: OnvifTransport = {
      post: async () => {
        call++
        if (call === 1) return { status: 200, body: DEVICE_INFO }
        if (call === 2)
          return {
            status: 200,
            body: '<s:Envelope><s:Body><GetCapabilitiesResponse/></s:Body></s:Envelope>',
          }
        return { status: 200, body: PROFILES_COMPLETE }
      },
    }
    const adapter = new OnvifAdapter({
      deviceServiceUrl: 'http://cam.local/onvif/device_service',
      transport,
    })

    const info = await adapter.detect()
    expect(info.identity.manufacturer).toBe('Acme')
    expect(info.mediaServiceUrl).toBeNull()
    expect(info.profiles).toHaveLength(2)
  })

  it('treats a device that declares ONVIF without PTZ as non-PTZ', async () => {
    let call = 0
    const transport: OnvifTransport = {
      post: async () => {
        call++
        if (call === 1) return { status: 200, body: DEVICE_INFO }
        if (call === 2) return { status: 200, body: CAPABILITIES }
        return {
          status: 200,
          body: PROFILES_COMPLETE.replace('<PTZConfiguration token="ptz1"/>', ''),
        }
      },
    }
    const adapter = new OnvifAdapter({ deviceServiceUrl: 'http://cam.local/onvif', transport })

    const info = await adapter.detect()
    expect(info.ptzSupported).toBe(false)
    expect(info.capabilities.ptz).toBe('unsupported')
  })

  it('detects MJPEG codec from fixtures', async () => {
    let call = 0
    const transport: OnvifTransport = {
      post: async () => {
        call++
        if (call === 1) return { status: 200, body: DEVICE_INFO }
        if (call === 2) return { status: 200, body: CAPABILITIES }
        return { status: 200, body: PROFILES_MJPEG }
      },
    }
    const adapter = new OnvifAdapter({ deviceServiceUrl: 'http://cam.local/onvif', transport })
    const info = await adapter.detect()
    expect(info.capabilities.mjpeg).toBe('supported')
    expect(info.capabilities.h264).toBe('supported')
  })

  it('reports onvif error state on HTTP failure', async () => {
    const transport: OnvifTransport = {
      post: async () => ({ status: 401, body: '<error/>' }),
    }
    const adapter = new OnvifAdapter({ deviceServiceUrl: 'http://cam.local/onvif', transport })
    const info = await adapter.detect()
    expect(info.capabilities.onvif).toBe('error')
    expect(info.identity.manufacturer).toBe('')
    expect(info.profiles).toEqual([])
  })

  it('handles wrong declarations gracefully without crashing', async () => {
    let call = 0
    const transport: OnvifTransport = {
      post: async () => {
        call++
        if (call === 1)
          return {
            status: 200,
            body: '<s:Envelope><s:Body><GetDeviceInformationResponse><Manufacturer>X</Manufacturer></GetDeviceInformationResponse></s:Body></s:Envelope>',
          }
        if (call === 2) return { status: 200, body: '<not-a-valid-response/>' }
        return { status: 200, body: '<GetProfilesResponse/>' }
      },
    }
    const adapter = new OnvifAdapter({ deviceServiceUrl: 'http://cam.local/onvif', transport })
    const info = await adapter.detect()
    expect(info.identity.manufacturer).toBe('X')
    expect(info.profiles).toEqual([])
    expect(info.mediaServiceUrl).toBeNull()
  })
})
