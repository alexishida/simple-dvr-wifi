import { describe, expect, it } from "vitest";
import { discoveryCameraToDraft } from "../src/renderer/discovery-draft.js";

describe("discoveryCameraToDraft", () => {
  it("extracts the host and ONVIF URL from the discovered XAddr", () => {
    const draft = discoveryCameraToDraft({
      epr: "urn:uuid:abc",
      addresses: ["http://192.168.1.100/onvif/device_service"],
      types: ["dn:NetworkVideoTransmitter"],
      scopes: [],
    });
    expect(draft.host).toBe("192.168.1.100");
    expect(draft.onvifUrl).toBe("http://192.168.1.100/onvif/device_service");
  });

  it("falls back to the raw string when the address is not a URL", () => {
    const draft = discoveryCameraToDraft({
      epr: "urn:uuid:abc",
      addresses: ["192.168.1.100"],
      types: [],
      scopes: [],
    });
    expect(draft.host).toBe("192.168.1.100");
    expect(draft.onvifUrl).toBeNull();
  });

  it("leaves name, credentials and RTSP empty for the wizard to complete", () => {
    const draft = discoveryCameraToDraft({
      epr: "urn:uuid:abc",
      addresses: ["http://10.0.0.5/onvif/device_service"],
      types: [],
      scopes: [],
    });
    expect(draft.name).toBe("");
    expect(draft.username).toBeNull();
    expect(draft.password).toBe("");
    expect(draft.rtspUrl).toBeNull();
  });
});
