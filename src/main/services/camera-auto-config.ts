import { buildPresetRtspUrl, presetForOnvifIdentity } from "../../shared/camera-presets.js";
import { parseRtspUrl } from "../../shared/camera-urls.js";
import type { CameraOnvifInfo } from "../../workers/camera/adapter.js";

export interface AutoRtspCandidate {
  url: string;
  source: "onvif" | "reference";
}

export function autoRtspCandidate(
  info: Pick<CameraOnvifInfo, "identity" | "rtspMainUrl">,
  host: string,
  port: number | null | undefined,
): AutoRtspCandidate | null {
  const announced = info.rtspMainUrl && parseRtspUrl(info.rtspMainUrl);
  if (announced && announced.sanitizedUrl.length <= 2_048) {
    return { url: announced.sanitizedUrl, source: "onvif" };
  }

  const preset = presetForOnvifIdentity(
    info.identity.manufacturer,
    info.identity.model,
  );
  if (!preset) return null;
  const url = buildPresetRtspUrl(preset, host, String(port ?? 554), "1", "main");
  return url ? { url, source: "reference" } : null;
}
