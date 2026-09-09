import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { LiveVideo } from "../src/renderer/components/LiveVideo.tsx";

export async function run() {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const waitFor = async (predicate) => {
    const deadline = Date.now() + 3000;
    while (!predicate()) {
      if (Date.now() > deadline)
        throw new Error("Timed out waiting for player");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };
  let visibility = "visible";
  Object.defineProperty(document, "visibilityState", { get: () => visibility });
  const setVisibility = (value) => {
    visibility = value;
    flushSync(() => document.dispatchEvent(new Event("visibilitychange")));
  };
  const acquisitions = [];
  const releases = [];
  const peers = [];
  let pendingAcquire;
  let delayAcquire = false;
  window.api = {
    media: {
      async acquire(request) {
        acquisitions.push(request);
        if (delayAcquire)
          await new Promise((resolve) => {
            pendingAcquire = resolve;
          });
        return { ok: true, value: { state: "running" } };
      },
      async release(cameraId, profile) {
        releases.push({ cameraId, profile });
        return { ok: true, value: { released: true } };
      },
      async whepEndpoint() {
        return {
          ok: true,
          value: { url: "http://127.0.0.1:1234/test/whep", token: "test" },
        };
      },
    },
  };
  window.RTCPeerConnection = class extends EventTarget {
    iceGatheringState = "complete";
    connectionState = "new";
    transceivers = [];
    constructor() {
      super();
      peers.push(this);
    }
    addTransceiver(kind) {
      this.transceivers.push(kind);
    }
    async createOffer() {
      return { type: "offer", sdp: "test" };
    }
    async setLocalDescription(offer) {
      this.localDescription = offer;
    }
    async setRemoteDescription() {
      this.connectionState = "connected";
      this.dispatchEvent(new Event("connectionstatechange"));
    }
    close() {
      this.connectionState = "closed";
    }
  };
  window.fetch = async () =>
    new Response("test", { headers: { Location: "/session" } });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (profile = "sub", cameraId = "camera") =>
    flushSync(() => {
      root.render(
        createElement(LiveVideo, { cameraId, cameraName: "Test", profile }),
      );
    });
  try {
    render();
    await waitFor(() => peers[0]?.connectionState === "connected");
    check(
      peers[0].transceivers.join() === "video",
      "Muted player requested audio",
    );
    render();
    check(acquisitions.length === 1, "Unchanged render restarted the stream");
    setVisibility("hidden");
    await waitFor(() => releases.length === 1);
    check(
      peers[0].connectionState === "closed",
      "Hidden player retained its decoder",
    );
    setVisibility("visible");
    await waitFor(() => peers[1]?.connectionState === "connected");
    render("main");
    await waitFor(() => peers[2]?.connectionState === "connected");
    check(
      releases[1].profile === "sub",
      "Profile change released the wrong session",
    );
    check(
      acquisitions[2].profile === "main",
      "Profile change ignored main stream",
    );

    // Minimize/restore while acquire is pending: a late acquisition must be
    // released before the replacement viewer starts (main uses a Set of viewers).
    delayAcquire = true;
    render("sub", "slow-camera");
    await waitFor(() => pendingAcquire);
    setVisibility("hidden");
    setVisibility("visible");
    delayAcquire = false;
    pendingAcquire();
    await waitFor(() => peers[3]?.connectionState === "connected");
    check(
      acquisitions.length === 5,
      "Restore did not serialize pending acquisition",
    );
    check(
      releases.some((item) => item.cameraId === "slow-camera"),
      "Late acquisition leaked",
    );
    flushSync(() => root.unmount());
    await waitFor(() => releases.length === 5);
    check(
      peers.every((peer) => peer.connectionState === "closed"),
      "Unmount leaked a peer",
    );
    return {
      passed: true,
      acquisitions: acquisitions.length,
      releases: releases.length,
    };
  } finally {
    root.unmount();
    container.remove();
  }
}
