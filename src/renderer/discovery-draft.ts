import type { DiscoveryCamera } from "./views/DiscoveryView.js";
import type { CameraDraft } from "./views/camera-types.js";

export function discoveryCameraToDraft(camera: DiscoveryCamera): CameraDraft {
  const xaddr = camera.addresses[0] ?? "";
  let host = "";
  let onvifUrl: string | null = null;
  const rtspUrl: string | null = null;
  try {
    const url = new URL(xaddr);
    host = url.hostname;
    onvifUrl = xaddr;
  } catch {
    host = xaddr;
  }
  return {
    name: "",
    host,
    onvifUrl,
    rtspUrl,
    username: null,
    password: "",
  };
}
