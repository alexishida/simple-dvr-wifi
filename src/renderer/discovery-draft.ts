import type { DiscoveryCamera } from "./views/DiscoveryView.js";
import type { CameraDraft } from "./views/camera-types.js";

export function discoveryCameraToDraft(camera: DiscoveryCamera): CameraDraft {
  const xaddr =
    camera.addresses.find((address) => {
      try {
        const protocol = new URL(address).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    }) ??
    camera.addresses[0] ??
    "";
  let host = "";
  let port: number | null = null;
  let onvifUrl: string | null = null;
  const rtspUrl: string | null = null;
  try {
    const url = new URL(xaddr);
    host = url.hostname;
    port = url.port ? Number(url.port) : null;
    onvifUrl = xaddr;
  } catch {
    host = xaddr;
  }
  const nameScope = camera.scopes.find((scope) =>
    scope.toLowerCase().includes("onvif://www.onvif.org/name/"),
  );
  let name = "";
  if (nameScope) {
    const encodedName = nameScope.slice(
      nameScope.toLowerCase().indexOf("/name/") + 6,
    );
    try {
      name = decodeURIComponent(encodedName).trim();
    } catch {
      name = encodedName.trim();
    }
  }
  return {
    name,
    host,
    port,
    epr: camera.epr || null,
    onvifUrl,
    rtspUrl,
    username: null,
    password: "",
  };
}
