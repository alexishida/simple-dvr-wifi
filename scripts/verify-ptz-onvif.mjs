import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const chunksDir = resolve('out/main/chunks')
const adapterFile = (await readdir(chunksDir)).find((file) =>
  /^onvif-adapter-.+\.js$/.test(file),
)
if (!adapterFile) {
  throw new Error('Execute "npm run build" antes da verificação de PTZ ONVIF.')
}

const { OnvifAdapter } = await import(pathToFileURL(resolve(chunksDir, adapterFile)).href)

const successResponse = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body><tptz:ContinuousMoveResponse xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"/></s:Body>
</s:Envelope>`
const requests = []
const transport = {
  post: async (_url, body) => {
    requests.push(body)
    return { status: 200, body: successResponse }
  },
}
const adapter = new OnvifAdapter({
  deviceServiceUrl: 'http://camera.local/onvif/ptz_service',
  transport,
})

await adapter.continuousMove({
  profileToken: 'profile-1',
  velocity: { pan: 0.5 },
})
await adapter.stop({ profileToken: 'profile-1', panTilt: true })

assert.match(requests[0], /<tt:PanTilt x="0.5" y="0"\/>/)
assert.doesNotMatch(requests[0], /<tt:Zoom/)
assert.match(requests[1], /<tptz:PanTilt>true<\/tptz:PanTilt>/)
assert.doesNotMatch(requests[1], /<tptz:Zoom>/)

const soapResponse = (body) => `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body>${body}</s:Body>
</s:Envelope>`
const tapoRequests = []
const tapoTransport = {
  post: async (_url, body) => {
    tapoRequests.push(body)
    if (body.includes('GetDeviceInformation')) {
      return {
        status: 200,
        body: soapResponse(
          '<tds:GetDeviceInformationResponse xmlns:tds="http://www.onvif.org/ver10/device/wsdl"><tds:Manufacturer>TP-Link</tds:Manufacturer><tds:Model>Tapo C210</tds:Model></tds:GetDeviceInformationResponse>',
        ),
      }
    }
    if (body.includes('GetCapabilities')) {
      return {
        status: 200,
        body: soapResponse(
          '<tds:GetCapabilitiesResponse xmlns:tds="http://www.onvif.org/ver10/device/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema"><tds:Capabilities><tt:Media XAddr="http://camera.local/onvif/media_service"/><tt:PTZ XAddr="http://camera.local/onvif/ptz_service"/></tds:Capabilities></tds:GetCapabilitiesResponse>',
        ),
      }
    }
    if (body.includes('GetProfiles')) {
      return {
        status: 200,
        body: soapResponse(
          '<trt:GetProfilesResponse xmlns:trt="http://www.onvif.org/ver10/media/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema"><trt:Profiles token="profile-1"><tt:Name>Main Stream</tt:Name><tt:VideoEncoderConfiguration Encoding="H264" Width="1920" Height="1080"/><tt:PTZConfiguration token="ptz-1"/></trt:Profiles></trt:GetProfilesResponse>',
        ),
      }
    }
    return { status: 200, body: successResponse }
  },
}
const tapoAdapter = new OnvifAdapter({
  deviceServiceUrl: 'http://camera.local/onvif/device_service',
  transport: tapoTransport,
})
await tapoAdapter.detect()
await tapoAdapter.continuousMove({
  profileToken: 'profile-1',
  velocity: { pan: 0.5 },
})
const tapoMove = tapoRequests.at(-1)
assert.match(
  tapoMove,
  /<tptz:RelativeMove>/,
)
assert.match(
  tapoMove,
  /<tt:PanTilt x="10" y="0" space="http:\/\/www\.onvif\.org\/ver10\/tptz\/PanTiltSpaces\/TranslationGenericSpace"\/>/,
)
await tapoAdapter.stop({
  profileToken: 'profile-1',
  panTilt: true,
  zoom: false,
})
assert.equal(
  tapoRequests.at(-1),
  tapoMove,
  'Soltar o botão não deve cancelar o RelativeMove horizontal da Tapo.',
)

await tapoAdapter.continuousMove({
  profileToken: 'profile-1',
  velocity: { pan: 0, tilt: 0.5 },
})
await tapoAdapter.stop({
  profileToken: 'profile-1',
  panTilt: true,
  zoom: false,
})
assert.match(tapoRequests.at(-2), /<tptz:ContinuousMove>/)
assert.match(tapoRequests.at(-1), /<tptz:Stop>/)
assert.doesNotMatch(tapoRequests.at(-1), /<tptz:Zoom>/)

const faultTransport = {
  post: async () => ({
    status: 200,
    body: `<?xml version="1.0"?>
      <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
        <s:Body><s:Fault><s:Reason><s:Text>PTZ indisponível</s:Text></s:Reason></s:Fault></s:Body>
      </s:Envelope>`,
  }),
}
const faultingAdapter = new OnvifAdapter({
  deviceServiceUrl: 'http://camera.local/onvif/ptz_service',
  transport: faultTransport,
})

await assert.rejects(
  () =>
    faultingAdapter.continuousMove({
      profileToken: 'profile-1',
      velocity: { pan: 0.5 },
    }),
  /PTZ indisponível/,
)

console.log('PTZ ONVIF: eixos opcionais, fallback Tapo e SOAP Fault verificados.')
