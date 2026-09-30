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
    if (body.includes('GetPresets')) {
      return { status: 200, body: soapResponse('<tptz:GetPresetsResponse xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"><tptz:Preset token="preset-1"><tt:Name xmlns:tt="http://www.onvif.org/ver10/schema">Entrada</tt:Name></tptz:Preset></tptz:GetPresetsResponse>') }
    }
    if (body.includes('SetPreset')) {
      return { status: 200, body: soapResponse('<tptz:SetPresetResponse xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"><tptz:PresetToken>preset-2</tptz:PresetToken></tptz:SetPresetResponse>') }
    }
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
const presets = await adapter.listPresets({ profileToken: 'profile-1' })
assert.deepEqual(presets, [{ token: 'preset-1', name: 'Entrada' }])
await adapter.gotoPreset({ profileToken: 'profile-1', presetToken: 'preset-1' })
assert.match(requests.at(-1), /<tptz:GotoPreset>/)
assert.match(requests.at(-1), /<tptz:PresetToken>preset-1<\/tptz:PresetToken>/)
assert.equal(await adapter.setPreset({ profileToken: 'profile-1', name: 'Portão' }), 'preset-2')
assert.match(requests.at(-1), /<tptz:PresetName>Portão<\/tptz:PresetName>/)
await adapter.removePreset({ profileToken: 'profile-1', presetToken: 'preset-2' })
assert.match(requests.at(-1), /<tptz:RemovePreset>/)
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

const unsupportedEventAdapter = new OnvifAdapter({
  deviceServiceUrl: 'http://camera.local/onvif/device_service',
  transport: {
    post: async () => ({ status: 200, body: soapResponse(
      '<tds:GetCapabilitiesResponse xmlns:tds="http://www.onvif.org/ver10/device/wsdl"><tds:Capabilities/></tds:GetCapabilitiesResponse>',
    ) }),
  },
})
assert.equal(await unsupportedEventAdapter.getEventServiceUrl(), null)

const redirectedEventAdapter = new OnvifAdapter({
  deviceServiceUrl: 'http://camera.local/onvif/device_service',
  transport: {
    post: async () => ({ status: 200, body: soapResponse(
      '<tds:GetCapabilitiesResponse xmlns:tds="http://www.onvif.org/ver10/device/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema"><tds:Capabilities><tt:Events XAddr="https://outside.example/events"/></tds:Capabilities></tds:GetCapabilitiesResponse>',
    ) }),
  },
})
await assert.rejects(() => redirectedEventAdapter.getEventServiceUrl(), /fora da câmera/)

const eventRequests = []
const eventAdapter = new OnvifAdapter({
  deviceServiceUrl: 'http://camera.local/onvif/device_service',
  transport: {
    post: async (url, body, options) => {
      eventRequests.push({ url, body, options })
      if (body.includes('GetCapabilities')) return { status: 200, body: soapResponse(
        '<tds:GetCapabilitiesResponse xmlns:tds="http://www.onvif.org/ver10/device/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema"><tds:Capabilities><tt:Events XAddr="http://camera.local/onvif/event_service"/></tds:Capabilities></tds:GetCapabilitiesResponse>',
      ) }
      if (body.includes('CreatePullPointSubscription')) return { status: 200, body: soapResponse(
        '<tev:CreatePullPointSubscriptionResponse xmlns:tev="http://www.onvif.org/ver10/events/wsdl" xmlns:wsa="http://www.w3.org/2005/08/addressing"><tev:SubscriptionReference><wsa:Address>http://camera.local/onvif/pullpoint</wsa:Address></tev:SubscriptionReference></tev:CreatePullPointSubscriptionResponse>',
      ) }
      return { status: 200, body: soapResponse('<tev:PullMessagesResponse xmlns:tev="http://www.onvif.org/ver10/events/wsdl"/>') }
    },
  },
})
assert.equal(await eventAdapter.getEventServiceUrl(), 'http://camera.local/onvif/event_service')
const subscription = await eventAdapter.createPullPointSubscription()
assert.equal(subscription.reference, 'http://camera.local/onvif/pullpoint')
assert.equal(eventRequests[1].url, 'http://camera.local/onvif/event_service')
assert.match(eventRequests[1].options.headers['Content-Type'], /events\/wsdl\/CreatePullPointSubscription/)
await eventAdapter.pullPointMessages(subscription.reference)
assert.equal(eventRequests[2].url, subscription.reference)

console.log('ONVIF: PTZ, suporte/ausência de Events e PullPoint verificados.')
