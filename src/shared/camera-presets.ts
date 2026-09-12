import { parseRtspUrl } from "./camera-urls.js";

export interface CameraPreset {
  id: string;
  manufacturer: string;
  model: string;
  mainPath: string;
  subPath?: string;
  channels?: boolean;
  hint?: string;
}

// Reference: https://gist.github.com/alexishida/b804c0329e1a71d64336e1f0bcbd20da
// Keep model/OEM variants separate. Credentials belong in the credential vault,
// so legacy endpoints that embed passwords in their path are not generated here.
export const CAMERA_PRESETS: readonly CameraPreset[] = [
  {
    id: "intelbras",
    manufacturer: "Intelbras",
    model: "IP / DVR / NVR (cam/realmonitor)",
    mainPath: "/cam/realmonitor?channel={channel}&subtype=0",
    subPath: "/cam/realmonitor?channel={channel}&subtype=1",
    channels: true,
  },
  {
    id: "mibo",
    manufacturer: "Intelbras",
    model: "Mibo Smart iM4 / iM4C",
    mainPath: "/cam/realmonitor?channel=1&subtype=0&unicast=true&proto=Onvif",
    subPath: "/cam/realmonitor?channel=1&subtype=1&unicast=true&proto=Onvif",
    hint: "Use o usuário admin e a chave de acesso do dispositivo. O firmware precisa oferecer RTSP/ONVIF.",
  },
  {
    id: "tapo",
    manufacturer: "TP-Link",
    model: "Tapo C310 / Tapo compatível com RTSP",
    mainPath: "/stream1",
    subPath: "/stream2",
    hint: "Use a Conta da Câmera criada no aplicativo Tapo. A senha da conta TP-Link pode ser diferente.",
  },
  {
    id: "hikvision",
    manufacturer: "Hikvision",
    model: "IP / DVR / NVR (Streaming/Channels)",
    mainPath: "/Streaming/Channels/{channel}01",
    subPath: "/Streaming/Channels/{channel}02",
    channels: true,
  },
  {
    id: "hikvision-legacy",
    manufacturer: "Hikvision",
    model: "Legado (h264/ch)",
    mainPath: "/h264/ch{channel}/main/av_stream",
    subPath: "/h264/ch{channel}/sub/av_stream",
    channels: true,
  },
  {
    id: "dahua",
    manufacturer: "Dahua",
    model: "IP / DVR / NVR (cam/realmonitor)",
    mainPath: "/cam/realmonitor?channel={channel}&subtype=0",
    subPath: "/cam/realmonitor?channel={channel}&subtype=1",
    channels: true,
  },
  {
    id: "axis",
    manufacturer: "Axis",
    model: "IP (axis-media)",
    mainPath: "/axis-media/media.amp?camera={channel}",
    channels: true,
  },
  {
    id: "foscam",
    manufacturer: "Foscam",
    model: "HD (videoMain)",
    mainPath: "/videoMain",
    subPath: "/videoSub",
    hint: "Confira a porta no equipamento; algumas linhas antigas usam 88 em vez de 554.",
  },
  {
    id: "vivotek",
    manufacturer: "Vivotek",
    model: "IP (live.sdp)",
    mainPath: "/live.sdp",
    subPath: "/live2.sdp",
    hint: "O nome do recurso RTSP pode ter sido alterado no firmware.",
  },
  {
    id: "hanwha-ip",
    manufacturer: "Hanwha / Samsung Techwin",
    model: "Câmera IP (profile)",
    mainPath: "/profile1/media.smp",
    subPath: "/profile2/media.smp",
  },
  {
    id: "hanwha-nvr",
    manufacturer: "Hanwha / Samsung Techwin",
    model: "NVR (LiveChannel)",
    mainPath: "/LiveChannel/{channel0}/media.smp",
    channels: true,
    hint: "Canal 1 corresponde ao identificador 0 na URL deste NVR.",
  },
  {
    id: "luxvision-ip",
    manufacturer: "Luxvision",
    model: "Câmera IP (ch01/0)",
    mainPath: "/ch{channel2}/0",
    subPath: "/ch{channel2}/1",
    channels: true,
    hint: "Padrão da família de câmeras IP; DVRs de outros OEMs podem usar URLs diferentes.",
  },
  {
    id: "tecvoz-tw",
    manufacturer: "Tecvoz",
    model: "TW / TW-ICB — câmera IP",
    mainPath: "/profile1",
  },
  {
    id: "tecvoz-tw-nvr",
    manufacturer: "Tecvoz",
    model: "TW — DVR / NVR",
    mainPath: "/chID={channel}&streamType=main&linkType=tcpa",
    channels: true,
  },
  {
    id: "tecvoz-thk",
    manufacturer: "Tecvoz",
    model: "T1 / THK",
    mainPath: "/Streaming/Channels/{channel}01",
    subPath: "/Streaming/Channels/{channel}02",
    channels: true,
  },
  {
    id: "dlink-7010",
    manufacturer: "D-Link",
    model: "DCS-7010L / live.sdp",
    mainPath: "/live1.sdp",
    subPath: "/live2.sdp",
  },
  {
    id: "dlink-942",
    manufacturer: "D-Link",
    model: "DCS-942L / play.sdp",
    mainPath: "/play1.sdp",
    subPath: "/play2.sdp",
  },
  {
    id: "geovision",
    manufacturer: "GeoVision",
    model: "Câmera IP (CH001.sdp)",
    mainPath: "/CH001.sdp",
    subPath: "/CH002.sdp",
  },
  {
    id: "lg",
    manufacturer: "LG",
    model: "IP (Master-0)",
    mainPath: "/Master-0",
    subPath: "/slave-0",
    hint: "Algumas linhas usam master-0 em minúsculas; ajuste a URL se necessário.",
  },
  {
    id: "multilaser",
    manufacturer: "Multilaser",
    model: "OEM (H264)",
    mainPath: "/H264?ch={channel}&subtype=0",
    subPath: "/H264?ch={channel}&subtype=1",
    channels: true,
  },
  {
    id: "ubiquiti",
    manufacturer: "Ubiquiti",
    model: "airCam / UniFi Video legado (ch00_0)",
    mainPath: "/live/ch00_0",
    hint: "Para UniFi Protect, use a URL gerada no controlador na opção de configuração manual.",
  },
  {
    id: "zavio",
    manufacturer: "Zavio",
    model: "B-5111 / video.pro",
    mainPath: "/video.pro1",
    subPath: "/video.pro2",
  },
  {
    id: "yoosee",
    manufacturer: "YooSee",
    model: "OEM compatível (onvif1)",
    mainPath: "/onvif1",
    hint: "O usuário costuma ser admin. Este caminho RTSP não é uma URL do serviço ONVIF.",
  },
  {
    id: "haiz-h264",
    manufacturer: "Haiz",
    model: "OEM (ch0_0.h264)",
    mainPath: "/ch0_0.h264",
    subPath: "/ch0_1.h264",
    hint: "Endpoint comunitário dependente do modelo/OEM. Teste a conexão para confirmar.",
  },
  {
    id: "haiz-stream",
    manufacturer: "Haiz",
    model: "OEM (stream_0)",
    mainPath: "/stream_0",
    subPath: "/stream_1",
    hint: "Endpoint comunitário dependente do modelo/OEM. Teste a conexão para confirmar.",
  },
  {
    id: "greatek",
    manufacturer: "Greatek",
    model: "Câmera OEM (11 / 12)",
    mainPath: "/11",
    subPath: "/12",
  },
];

export function buildPresetRtspUrl(
  preset: CameraPreset,
  host: string,
  port: string,
  channel: string,
  stream: "main" | "sub",
): string | null {
  const address = host.trim();
  const rtspPort = Number(port.trim() || "554");
  const channelNumber = preset.channels ? Number(channel) : 1;
  if (
    !address ||
    /[\s/@?#\\]/.test(address) ||
    !Number.isInteger(rtspPort) ||
    rtspPort < 1 ||
    rtspPort > 65_535 ||
    !Number.isSafeInteger(channelNumber) ||
    channelNumber < 1 ||
    channelNumber > 999
  )
    return null;

  const template = stream === "sub" ? preset.subPath : preset.mainPath;
  if (!template) return null;
  const path = template
    .replaceAll("{channel}", String(channelNumber))
    .replaceAll("{channel2}", String(channelNumber).padStart(2, "0"))
    .replaceAll("{channel0}", String(channelNumber - 1));
  const authority =
    address.includes(":") && !address.startsWith("[")
      ? `[${address}]`
      : address;
  return (
    parseRtspUrl(`rtsp://${authority}:${rtspPort}${path}`)?.sanitizedUrl ?? null
  );
}
