import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { LiveVideo } from "../src/renderer/components/LiveVideo.tsx";
import { audioCodecFromSdp } from "../src/renderer/media-codecs.ts";
import { PtzPanel } from "../src/renderer/components/PtzPanel.tsx";
import { SidebarPtz } from "../src/renderer/App.tsx";

export async function run() {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  check(
    audioCodecFromSdp("v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111 0\r\na=rtpmap:111 opus/48000/2\r\na=rtpmap:0 PCMU/8000\r\n") === "Opus",
    "Audio codec parser did not select the negotiated codec",
  );
  check(audioCodecFromSdp("v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=rtpmap:96 H264/90000\r\n") === null, "Video-only SDP reported audio");
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
  const statusCalls = [];
  window.api = {
    media: {
      async status(cameraId, profile) {
        statusCalls.push({ cameraId, profile });
        return { ok: true, value: { state: "running", error: "A câmera bloqueou temporariamente o acesso ao vídeo." } };
      },
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
    emitAudioTrack() {
      const event = new Event("track");
      Object.defineProperties(event, {
        streams: { value: [new MediaStream()] },
        track: { value: { kind: "audio" } },
      });
      this.dispatchEvent(event);
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
      peers[0].transceivers.join() === "video,audio",
      "Player did not request the optional audio track",
    );
    check(container.querySelector("video").muted === true, "Player must start muted");
    const audioButton = container.querySelector("button[title='Esta câmera não enviou áudio']");
    check(audioButton?.disabled, "Audio control must remain disabled without a track");
    peers[0].emitAudioTrack();
    await waitFor(() => !audioButton.disabled);
    audioButton.click();
    await waitFor(() => container.querySelector("video").muted === false);
    check(audioButton.title === "Silenciar áudio", "Audio control did not reflect its enabled state");
    audioButton.click();
    await waitFor(() => container.querySelector("video").muted === true);
    render();
    check(acquisitions.length === 1, "Unchanged render restarted the stream");
    setVisibility("hidden");
    check(releases.length === 0, "Hidden player released the stream");
    check(
      peers[0].connectionState === "connected",
      "Hidden player closed its connection",
    );
    setVisibility("visible");
    check(acquisitions.length === 1, "Visible player restarted the stream");
    render("main");
    await waitFor(() => peers[1]?.connectionState === "connected");
    check(
      releases[0].profile === "sub",
      "Profile change released the wrong session",
    );
    check(
      acquisitions[1].profile === "main",
      "Profile change ignored main stream",
    );

    // Losing visibility while acquire is pending must not cancel or duplicate
    // the viewer connection.
    delayAcquire = true;
    render("sub", "slow-camera");
    await waitFor(() => pendingAcquire);
    setVisibility("hidden");
    setVisibility("visible");
    delayAcquire = false;
    pendingAcquire();
    await waitFor(() => peers[2]?.connectionState === "connected");
    check(
      acquisitions.length === 3,
      "Visibility change duplicated pending acquisition",
    );
    check(
      !releases.some((item) => item.cameraId === "slow-camera"),
      "Visibility change released pending acquisition",
    );
    window.fetch = async () => new Response("source unavailable", {status:500});
    render("sub", "locked-camera");
    await waitFor(() => container.textContent.includes("bloqueou temporariamente"));
    await waitFor(() => releases.some(item=>item.cameraId === "locked-camera"));
    check(statusCalls.at(-1).profile === "sub", "Error diagnosis must use the selected profile");
    flushSync(() => root.unmount());
    await waitFor(() => releases.length === 4);
    check(releases.filter(item=>item.cameraId === "locked-camera").length === 1, "Blocked viewer must release exactly once");
    check(
      peers.every((peer) => peer.connectionState === "closed"),
      "Unmount leaked a peer",
    );
    const ptzHost = document.createElement("div");
    container.append(ptzHost);
    const ptzRoot = createRoot(ptzHost);
    let connectAttempts = 0;
    window.api.ptz = {status: async () => ({ok:true,value:{stopBlocked:false}}), connect:async () => {
      connectAttempts++;
      if (connectAttempts === 1) return {ok:false,error:{message:"A câmera recusou a autenticação ONVIF."}};
      if (connectAttempts === 2) throw new Error("offline");
      return {ok:true,value:{connected:true}};
    }};
    try {
      flushSync(() => ptzRoot.render(createElement(PtzPanel, {cameraId:"camera",cameraName:"Test",supported:true,zoomSupported:false,presetsSupported:false})));
      await waitFor(() => ptzHost.textContent.includes("recusou a autenticação"));
      const retry = () => [...ptzHost.querySelectorAll("button")].find(button=>button.textContent.includes("Tentar conectar novamente"));
      flushSync(() => retry().click());
      await waitFor(() => ptzHost.textContent.includes("Verifique a conexão"));
      flushSync(() => retry().click());
      await waitFor(() => !ptzHost.querySelector(".ptz-btn").disabled);
      check(connectAttempts === 3 && !retry(), "PTZ must recover after an explicit retry");
      const moves = [];
      const stops = [];
      const connections = [];
      let finishMove;
      let stopBlocked = false;
      window.api.ptz = {
        connect: async (id) => { connections.push(id); return {ok:true,value:{connected:true}}; },
        status: async () => ({ok:true,value:{stopBlocked}}),
        listPresets: async () => ({ok:true,value:[]}),
        move: (id, velocity) => {
          moves.push({id,velocity});
          return new Promise(resolve => { finishMove = resolve; });
        },
        stop: async (id, trigger) => {
          stops.push({id,trigger});
          return stopBlocked ? {ok:false,error:{message:"Parada não confirmada"}} : {ok:true};
        },
      };
      const camera = {id:"new-onvif-camera",name:"Entrada",active:true,hasOnvif:true,supportsPtz:false};
      const sidebar = (selected = camera) => flushSync(() => ptzRoot.render(createElement(SidebarPtz, {
        camera:selected,cameras:[camera, { ...camera, id:"second-camera",name:"Garagem" }],onSelect() {},
      })));
      sidebar();
      await waitFor(() => !ptzHost.querySelector(".ptz-btn").disabled);
      check(connections.includes(camera.id), "A new ONVIF camera must connect without a cached PTZ flag");
      check(!ptzHost.querySelector("dialog") && ptzHost.querySelector("#sidebar-ptz-camera"), "PTZ controls and selection must be inline in the sidebar");
      const key = (type) => flushSync(() => ptzHost.querySelector('[aria-label="Direita"]').dispatchEvent(new KeyboardEvent(type, {key:"Enter",bubbles:true,cancelable:true})));
      key("keydown");
      await new Promise(resolve => setTimeout(resolve, 600));
      check(moves.length === 1, "Pending movements must not accumulate in the command queue");
      check(moves[0].velocity.pan === 0.5, "Short steps must retain the previously working motor speed");
      check(stops.length === 1, "Short steps must request a stop without waiting for key release or a slow move response");
      key("keyup");
      await waitFor(() => stops.length === 1);
      finishMove({ok:true,value:{started:true}});
      await new Promise(resolve => setTimeout(resolve, 20));
      sidebar({...camera,id:"second-camera",name:"Garagem"});
      await waitFor(() => connections.includes("second-camera") && !ptzHost.querySelector(".ptz-btn").disabled);
      check(stops.length === 1, "A late move response must not resurrect a stopped movement");
      stopBlocked = true;
      key("keydown");
      finishMove({ok:true,value:{started:true}});
      await new Promise(resolve => setTimeout(resolve, 20));
      key("keyup");
      await waitFor(() => ptzHost.textContent.includes("Tentar parar novamente"));
      check(ptzHost.querySelector(".ptz-btn").disabled, "Failed stops must block further movement");
      stopBlocked = false;
      flushSync(() => [...ptzHost.querySelectorAll("button")].find(button => button.textContent.includes("Tentar parar novamente")).click());
      await waitFor(() => !ptzHost.querySelector(".ptz-btn").disabled);
      check(stops.at(-1).id === "second-camera", "Stop retry must target the selected camera");
      const stopsBeforeExplicitStop = stops.length;
      flushSync(() => ptzHost.querySelector('[aria-label="Parar movimento"]').click());
      await waitFor(() => stops.length === stopsBeforeExplicitStop + 1);
      check(stops.at(-1).id === "second-camera", "The center stop must reach the selected camera even without a locally held direction");
      for (const [label, pan, tilt] of [["Esquerda", -0.5, 0], ["Cima", 0, 0.5], ["Baixo", 0, -0.5]]) {
        const direction = ptzHost.querySelector(`[aria-label="${label}"]`);
        const stopsBeforeStep = stops.length;
        const movesBeforeStep = moves.length;
        flushSync(() => direction.dispatchEvent(new KeyboardEvent("keydown", {key:"Enter",bubbles:true,cancelable:true})));
        check(moves.length === movesBeforeStep + 1, `${label} must send one short step`);
        check(moves.at(-1).velocity.pan === pan && moves.at(-1).velocity.tilt === tilt, `${label} must use the correct axis and working motor speed`);
        finishMove({ok:true,value:{started:true}});
        await waitFor(() => stops.length === stopsBeforeStep + 1);
        check(stops.at(-1).id === "second-camera", `${label} must stop the selected camera automatically`);
        flushSync(() => direction.dispatchEvent(new KeyboardEvent("keyup", {key:"Enter",bubbles:true,cancelable:true})));
      }
      const mode = ptzHost.querySelector('select[id$="-mode"]');
      flushSync(() => {
        mode.value = "continuous";
        mode.dispatchEvent(new Event("change", {bubbles:true}));
      });
      const stopsBeforeContinuous = stops.length;
      key("keydown");
      finishMove({ok:true,value:{started:true}});
      await new Promise(resolve => setTimeout(resolve, 300));
      check(stops.length === stopsBeforeContinuous, "Continuous mode must not inherit the short-step stop timer");
      key("keyup");
      await waitFor(() => stops.length === stopsBeforeContinuous + 1);
    } finally { ptzRoot.unmount(); }
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
