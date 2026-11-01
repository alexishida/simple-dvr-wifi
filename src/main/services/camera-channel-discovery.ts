import type { CameraOnvifInfo, CameraProfileInfo } from "../../workers/camera/adapter.js";
import type { CameraChannel } from "../../shared/camera-channels.js";
import { parseRtspUrl } from "../../shared/camera-urls.js";

// SourceToken identifies the lens; encoder profiles identify quality variants.
// Xiongmai/iCSee firmware may omit SourceToken and advertise channel in the URI.
export function cameraProfileChannelKey(profile: CameraProfileInfo): string {
  if (profile.rtspUrl) {
    const url = new URL(profile.rtspUrl);
    const channel = url.searchParams.get("channel") ?? url.searchParams.get("ch") ??
      /(?:^|[&/])channel=(\d+)(?:&|$)/i.exec(url.pathname)?.[1];
    if (channel != null) return `channel:${channel}`;
  }
  return profile.videoSourceToken ? `source:${profile.videoSourceToken}` : "default";
}

export function discoverCameraChannels(info: Pick<CameraOnvifInfo, "profiles">): CameraChannel[] {
  const groups = new Map<string, CameraProfileInfo[]>();
  for (const profile of info.profiles) {
    if (!profile.rtspUrl || !parseRtspUrl(profile.rtspUrl)) continue;
    const key = cameraProfileChannelKey(profile);
    const group = groups.get(key) ?? [];
    group.push(profile);
    groups.set(key, group);
  }
  return [...groups].map(([key, profiles], index) => {
    const sorted = [...profiles].sort((a, b) =>
      (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0));
    const main = sorted.find((p) => p.streamType === "main") ?? sorted[0]!;
    const mainUrl = parseRtspUrl(main.rtspUrl!)!.sanitizedUrl;
    const sub = [...sorted].reverse().find((p) =>
      p !== main && p.streamType === "sub" && parseRtspUrl(p.rtspUrl!)!.sanitizedUrl !== mainUrl);
    return {
      key,
      name: `Canal ${index + 1}`,
      rtspUrl: mainUrl,
      rtspSubUrl: sub ? parseRtspUrl(sub.rtspUrl!)!.sanitizedUrl : null,
    };
  });
}
